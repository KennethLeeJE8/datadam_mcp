#!/usr/bin/env node

/**
 * Robust MCP Bridge for HTTP Streamable Server
 * 
 * This bridge connects Claude Desktop (stdio MCP protocol) to an HTTP streamable MCP server.
 * It handles session management, proper JSON-RPC 2.0 communication, and error resilience.
 * 
 * Usage:
 *   node stdio-mcp-bridge.js <server-url>
 * 
 * Claude Desktop Configuration:
 * {
 *   "mcpServers": {
 *     "datadam": {
 *       "command": "node",
 *       "args": ["path/to/stdio-mcp-bridge.js", "https://datadam-mcp.onrender.com"]
 *     }
 *   }
 * }
 */

const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const https = require('https');
const http = require('http');
const { URL } = require('url');

class StdioMcpBridge {
  constructor(serverUrl) {
    this.serverUrl = serverUrl;
    this.sessionId = null;
    this.requestIdCounter = 1;
    
    // Get API key from environment if available
    this.apiKey = process.env.MCP_API_KEY;
    
    // Enable verbose logging if DEBUG environment variable is set
    this.debug = process.env.DEBUG === 'true';
    
    this.log('MCP Bridge starting...', { 
      serverUrl, 
      hasApiKey: !!this.apiKey,
      apiKeyLength: this.apiKey ? this.apiKey.length : 0
    });

    // Create the MCP server that will handle stdio communication
    this.mcpServer = new McpServer({
      name: "datadam-mcp-bridge",
      version: "2.0.0"
    }, {
      capabilities: {
        tools: { listChanged: true },
        resources: { listChanged: true },
        prompts: { listChanged: true }
      }
    });

    this.setupMcpServer();
  }

  log(message, data = {}) {
    if (this.debug) {
      process.stderr.write(`[MCP-Bridge] ${message} ${JSON.stringify(data)}\n`);
    }
  }

  async setupMcpServer() {
    try {
      // Test connection to HTTP server first
      await this.testServerConnection();
      
      // Register dynamic tools and resources
      await this.registerDynamicToolsAndResources();
      
      // Add handlers for prompts and resources
      this.setupHandlers();
      
      // Setup stdio transport
      const transport = new StdioServerTransport();
      
      // Connect the server to the transport
      await this.mcpServer.connect(transport);
      
      this.log('Bridge connected successfully to Claude Desktop');
      
    } catch (error) {
      process.stderr.write(`[ERROR] Failed to setup MCP bridge: ${error.message}\n`);
      process.exit(1);
    }
  }

  async testServerConnection() {
    try {
      this.log('Testing connection to HTTP server...');
      const healthResponse = await this.makeRestRequest('GET', '/health');
      
      if (healthResponse.status !== 'healthy') {
        throw new Error('Server health check failed');
      }
      
      this.log('Server health check passed', { healthResponse });
    } catch (error) {
      throw new Error(`HTTP server connection failed: ${error.message}`);
    }
  }

  async registerDynamicToolsAndResources() {
    // Start with fallback tools immediately, then try to get dynamic ones later
    this.log('Registering fallback tools initially');
    await this.registerFallbackTools();
    
    // We'll try to get dynamic tools after we have a session ID
    // This will be called during the first tools/list request
  }

  async setupDynamicTools() {
    try {
      // First establish a session by making an initialize request
      this.log('Establishing session for dynamic tool registration...');
      const initResponse = await this.makeMCPRequest('initialize', {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: {
          name: 'datadam-mcp-bridge',
          version: '2.0.0'
        }
      });
      
      this.log('Session established, fetching tools from MCP server...');
      const toolsResponse = await this.makeMCPRequest('tools/list', {});
      
      if (toolsResponse.result && toolsResponse.result.tools && Array.isArray(toolsResponse.result.tools)) {
        this.log('Got dynamic tools', { count: toolsResponse.result.tools.length });
        return toolsResponse.result.tools;
      }
    } catch (error) {
      this.log('Dynamic tool setup failed', { error: error.message });
    }
    
    return null;
  }

  async registerFallbackTools() {
    // Register basic tools based on what we know the server should have
    const fallbackTools = [
      {
        name: 'search-personal-data',
        description: 'Search through personal data by title and content'
      },
      {
        name: 'extract-personal-data', 
        description: 'Extract groups of similar entries by tags'
      },
      {
        name: 'create-personal-data',
        description: 'Create new personal data records'
      },
      {
        name: 'update-personal-data',
        description: 'Update existing personal data records'
      },
      {
        name: 'delete-personal-data',
        description: 'Delete personal data records'
      }
    ];

    for (const tool of fallbackTools) {
      this.mcpServer.registerTool(
        tool.name,
        {
          title: tool.description,
          description: tool.description,
          inputSchema: {
            type: "object",
            properties: {},
            additionalProperties: true
          }
        },
        async (args) => {
          return await this.callRemoteTool(tool.name, args);
        }
      );
    }

    this.log('Registered fallback tools', { count: fallbackTools.length });
  }

  setupHandlers() {
    // Add a simple resource for data categories
    this.mcpServer.registerResource(
      "data-categories",
      "data://categories",
      {
        title: "Data Categories",
        description: "List of available personal data categories",
        mimeType: "text/plain"
      },
      async (uri) => {
        try {
          // Establish session first if we don't have one
          if (!this.sessionId) {
            this.log('Establishing session for resource read...');
            await this.makeMCPRequest('initialize', {
              protocolVersion: '2025-06-18',
              capabilities: {},
              clientInfo: {
                name: 'datadam-mcp-bridge',
                version: '2.0.0'
              }
            });
          }
          
          const resourceResponse = await this.makeMCPRequest('resources/read', { uri: uri.href });
          
          if (resourceResponse.result && resourceResponse.result.contents) {
            return {
              contents: resourceResponse.result.contents
            };
          } else {
            return {
              contents: [{
                uri: uri.href,
                mimeType: 'text/plain',
                text: 'Resource temporarily unavailable'
              }]
            };
          }
        } catch (error) {
          this.log('Resource read failed', { uri: uri.href, error: error.message });
          return {
            contents: [{
              uri: uri.href,
              mimeType: 'text/plain',
              text: `Resource read failed: ${error.message}`
            }]
          };
        }
      }
    );

    this.log('Resource and prompt handlers registered');
  }

  async callRemoteTool(toolName, args) {
    try {
      this.log('Calling remote tool', { toolName, args });
      
      // Establish session first if we don't have one
      if (!this.sessionId) {
        this.log('Establishing session for tool call...');
        await this.makeMCPRequest('initialize', {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: {
            name: 'datadam-mcp-bridge',
            version: '2.0.0'
          }
        });
      }
      
      // Use the MCP tools/call method
      const result = await this.makeMCPRequest('tools/call', {
        name: toolName,
        arguments: args
      });
      
      this.log('Tool call completed', { toolName, hasResult: !!result });
      
      // Format the response according to MCP protocol
      let content;
      if (result.result && result.result.content) {
        content = result.result.content;
      } else if (result.content) {
        content = result.content;
      } else {
        content = [{
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }];
      }
      
      return {
        content: content,
        isError: result.isError || false
      };
    } catch (error) {
      this.log('Tool call failed', { toolName, error: error.message });
      return {
        content: [{
          type: 'text',
          text: `Tool execution failed: ${error.message}`
        }],
        isError: true
      };
    }
  }

  async readRemoteResource(uri) {
    try {
      this.log('Reading remote resource', { uri });
      
      const resourceResponse = await this.makeMCPRequest('resources/read', { uri });
      
      if (resourceResponse.result && resourceResponse.result.contents) {
        return {
          contents: resourceResponse.result.contents
        };
      } else {
        return {
          contents: [{
            uri: uri,
            mimeType: 'text/plain',
            text: 'Resource not found or empty'
          }]
        };
      }
    } catch (error) {
      this.log('Resource read failed', { uri, error: error.message });
      return {
        contents: [{
          uri: uri,
          mimeType: 'text/plain',
          text: `Resource read failed: ${error.message}`
        }]
      };
    }
  }

  async makeRestRequest(method, path, body = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.serverUrl);
      const isHttps = url.protocol === 'https:';
      const httpModule = isHttps ? https : http;
      
      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'MCP-Bridge/2.0.0',
          'Accept': 'application/json'
        },
        timeout: 30000 // 30 second timeout
      };

      // Add API key authentication if available
      if (this.apiKey) {
        options.headers['Authorization'] = `Bearer ${this.apiKey}`;
        this.log('Added API key authentication to REST request');
      }

      let postData = '';
      if (body) {
        postData = JSON.stringify(body);
        options.headers['Content-Length'] = Buffer.byteLength(postData);
      }

      this.log('Making REST request', { method, path, hasBody: !!body });

      const req = httpModule.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            if (res.statusCode >= 400) {
              reject(new Error(`HTTP ${res.statusCode}: ${res.statusText || data}`));
              return;
            }

            // Try to parse as JSON, fallback to text if it fails
            let response;
            try {
              response = JSON.parse(data);
            } catch (parseError) {
              // If it's not JSON, return as text response
              this.log('Non-JSON response received', { statusCode: res.statusCode, data: data.substring(0, 200) });
              reject(new Error(`Invalid JSON response: ${parseError.message}`));
              return;
            }
            
            this.log('Received REST response', { statusCode: res.statusCode, hasData: !!data });
            resolve(response);
          } catch (error) {
            reject(new Error(`Response processing failed: ${error.message}`));
          }
        });
      });

      req.on('error', (error) => {
        this.log('REST request error', { error: error.message });
        reject(new Error(`REST request failed: ${error.message}`));
      });

      req.on('timeout', () => {
        this.log('REST request timeout');
        req.destroy();
        reject(new Error('REST request timeout'));
      });

      if (postData) {
        req.write(postData);
      }
      req.end();
    });
  }

  async makeMCPRequest(method, params = {}) {
    return new Promise((resolve, reject) => {
      const url = new URL('/mcp', this.serverUrl);
      const isHttps = url.protocol === 'https:';
      const httpModule = isHttps ? https : http;
      
      const requestBody = {
        jsonrpc: '2.0',
        method: method,
        params: params,
        id: this.requestIdCounter++
      };
      
      const postData = JSON.stringify(requestBody);
      
      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          'User-Agent': 'MCP-Bridge/2.0.0',
          'Content-Length': Buffer.byteLength(postData)
        },
        timeout: 30000
      };

      // Add session ID if we have one
      if (this.sessionId) {
        options.headers['mcp-session-id'] = this.sessionId;
      }

      // Add API key authentication if available
      if (this.apiKey) {
        options.headers['Authorization'] = `Bearer ${this.apiKey}`;
        this.log('Added API key authentication to MCP request');
      }

      this.log('Making MCP request', { method, params });

      const req = httpModule.request(options, (res) => {
        let data = '';
        
        // Capture session ID from response headers
        const newSessionId = res.headers['mcp-session-id'];
        if (newSessionId) {
          this.sessionId = newSessionId;
          this.log('Updated session ID', { sessionId: this.sessionId });
        }
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            let response;
            
            // Check if this is an SSE response
            if (data.startsWith('event: message\ndata: ')) {
              // Parse SSE format
              const lines = data.split('\n');
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const jsonData = line.substring(6); // Remove 'data: ' prefix
                  response = JSON.parse(jsonData);
                  break;
                }
              }
            } else {
              // Regular JSON response
              response = JSON.parse(data);
            }
            
            if (!response) {
              reject(new Error('No valid response data found'));
              return;
            }
            
            this.log('Received MCP response', { statusCode: res.statusCode, hasError: !!response.error });
            
            if (res.statusCode >= 400 || response.error) {
              reject(new Error(response.error?.message || `HTTP ${res.statusCode}`));
            } else {
              resolve(response);
            }
          } catch (error) {
            this.log('Error parsing MCP response', { error: error.message, data: data.substring(0, 200) });
            reject(new Error(`Invalid response format: ${error.message}`));
          }
        });
      });

      req.on('error', (error) => {
        this.log('MCP request error', { error: error.message });
        reject(new Error(`MCP request failed: ${error.message}`));
      });

      req.on('timeout', () => {
        this.log('MCP request timeout');
        req.destroy();
        reject(new Error('MCP request timeout'));
      });

      req.write(postData);
      req.end();
    });
  }
}

// Main execution
function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    process.stderr.write('Usage: node stdio-mcp-bridge.js <server-url>\n');
    process.stderr.write('Example: node stdio-mcp-bridge.js https://datadam-mcp.onrender.com\n');
    process.exit(1);
  }
  
  const serverUrl = args[0];
  
  // Validate URL
  try {
    new URL(serverUrl);
  } catch (error) {
    process.stderr.write(`Invalid server URL: ${serverUrl}\n`);
    process.exit(1);
  }
  
  // Start the bridge
  new StdioMcpBridge(serverUrl);
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  process.stderr.write(`Unhandled Rejection at: ${promise} reason: ${reason}\n`);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  if (error.code === 'EPIPE') {
    // EPIPE errors are common when stdout/stderr is closed - just exit gracefully
    process.stderr.write('Client disconnected (EPIPE)\n');
    process.exit(0);
  } else {
    process.stderr.write(`Uncaught Exception: ${error}\n`);
    process.exit(1);
  }
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  process.stderr.write('\nShutting down MCP bridge...\n');
  process.exit(0);
});

process.on('SIGTERM', () => {
  process.stderr.write('\nShutting down MCP bridge...\n');
  process.exit(0);
});

if (require.main === module) {
  main();
}

module.exports = StdioMcpBridge;