import express from "express";
import cors from "cors";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

interface PersonalDataRecord {
  id: string;
  user_id: string;
  title: string;
  content: any;
  tags: string[];
  category: string;
  classification: string;
  created_at: string;
  updated_at: string;
}

interface Category {
  category_name: string;
  display_name: string;
  description: string;
  item_count: number;
  trigger_words: string[];
  query_hint: string;
  example_queries: string[];
  last_modified: string;
}

let supabase: SupabaseClient;

async function initializeDatabase(): Promise<void> {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration. Please check your .env file.");
    }

    supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Test the connection by fetching category stats
    const { data, error } = await supabase.rpc('get_category_stats');
    
    if (error) {
      throw error;
    }
    
    console.log(`✅ Connected to Supabase successfully`);
    console.log(`📊 Database stats:`, data?.[0] || 'No data');
  } catch (error) {
    console.error("❌ Error connecting to database:", error);
    throw error;
  }
}

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "personal-data-mcp-server",
    version: "1.0.0"
  });

  // Register the categories list resource
  server.registerResource(
    "data-categories",
    "data://categories",
    {
      title: "Data Categories",
      description: "List of available personal data categories with item counts"
    },
    async (uri) => {
      try {
        const { data: categories, error } = await supabase.rpc('get_active_categories');
        
        if (error) {
          return {
            contents: [{
              uri: uri.href,
              text: `Error fetching categories: ${error.message}`,
              mimeType: "text/plain"
            }]
          };
        }

        if (!categories || categories.length === 0) {
          return {
            contents: [{
              uri: uri.href,
              text: "No data categories found. Add some personal data to see categories here.",
              mimeType: "text/plain"
            }]
          };
        }

        const categoriesList = categories.map((cat: Category) => 
          `📁 ${cat.display_name} (${cat.item_count} items)
   Category: ${cat.category_name}
   Description: ${cat.description}
   Keywords: ${cat.trigger_words.join(', ')}
   Query when: ${cat.query_hint}
   Examples: ${cat.example_queries.join(' | ')}`
        ).join('\n\n');
        
        return {
          contents: [{
            uri: uri.href,
            text: `Available Personal Data Categories:\n\n${categoriesList}`,
            mimeType: "text/plain"
          }]
        };
      } catch (error) {
        return {
          contents: [{
            uri: uri.href,
            text: `Database connection error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            mimeType: "text/plain"
          }]
        };
      }
    }
  );

  // Register the search personal data tool
  server.registerTool(
    "search-personal-data",
    {
      title: "Search Personal Data",
      description: "Search through personal data by title and content for a specific user",
      inputSchema: {
        query: z.string().describe("Search query to find in titles and content"),
        userId: z.string().describe("User ID (UUID) to search data for"),
        categories: z.array(z.string()).optional().describe("Filter by specific categories (e.g., 'books', 'contacts')"),
        classification: z.enum(['public', 'personal', 'sensitive', 'confidential']).optional().describe("Filter by classification level"),
        limit: z.number().min(1).max(100).default(20).describe("Maximum number of results to return")
      }
    },
    async ({ query, userId, categories, classification, limit = 20 }) => {
      try {
        // Remove surrounding quotes if present
        const cleanQuery = query.replace(/^["']|["']$/g, '').trim();

        // Log to file for debugging
        const fs = require('fs');
        const debugInfo = {
          timestamp: new Date().toISOString(),
          userId, 
          cleanQuery, 
          categories, 
          classification
        };
        fs.appendFileSync('/tmp/mcp_debug.log', JSON.stringify(debugInfo) + '\n');

        const { data: results, error } = await supabase.rpc('search_personal_data', {
          p_user_id: userId,
          p_search_text: cleanQuery,
          p_categories: (categories && categories.length > 0) ? categories : null,
          p_tags: null,
          p_classification: classification || null,
          p_limit: limit,
          p_offset: 0
        });

        fs.appendFileSync('/tmp/mcp_debug.log', JSON.stringify({ results: results?.length || 0, error: error?.message }) + '\n');

        if (error) {
          return {
            content: [{
              type: "text",
              text: `Database error: ${error.message}`
            }]
          };
        }

        if (!results || results.length === 0) {
          return {
            content: [{
              type: "text",
              text: `No personal data found matching query: "${query}"`
            }]
          };
        }

        const resultText = results.map((item: PersonalDataRecord) => {
          const contentPreview = typeof item.content === 'object' 
            ? JSON.stringify(item.content, null, 2).substring(0, 200) 
            : String(item.content).substring(0, 200);
          
          return `📄 ${item.title}
   Category: ${item.category || 'Uncategorized'}
   Classification: ${item.classification}
   Tags: ${item.tags?.join(', ') || 'None'}
   Content: ${contentPreview}${contentPreview.length >= 200 ? '...' : ''}
   Updated: ${new Date(item.updated_at).toLocaleDateString()}`;
        }).join('\n\n');

        const resourceLinks = results.map((item: PersonalDataRecord) => ({
          type: "resource_link" as const,
          uri: `data://item/${item.id}`,
          name: item.title,
          description: `${item.category} - ${item.classification}`
        }));

        return {
          content: [
            {
              type: "text",
              text: `Found ${results.length} items matching "${query}":\n\n${resultText}`
            },
            ...resourceLinks
          ]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error searching personal data: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  );

  return server;
}

async function main() {
  // Initialize database connection
  await initializeDatabase();

  const app = express();
  
  // CORS configuration for browser-based clients
  app.use(cors({
    origin: '*',
    exposedHeaders: ['Mcp-Session-Id'],
    allowedHeaders: ['Content-Type', 'mcp-session-id'],
  }));
  
  app.use(express.json());

  // Map to store transports by session ID
  const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

  // Handle POST requests for client-to-server communication
  app.post('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports[sessionId]) {
      // Reuse existing transport
      transport = transports[sessionId];
    } else if (!sessionId && isInitializeRequest(req.body)) {
      // New initialization request
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sessionId) => {
          transports[sessionId] = transport;
          console.log(`New session initialized: ${sessionId}`);
        },
        enableDnsRebindingProtection: false,
      });

      // Clean up transport when closed
      transport.onclose = () => {
        if (transport.sessionId) {
          console.log(`Session closed: ${transport.sessionId}`);
          delete transports[transport.sessionId];
        }
      };

      const server = createMcpServer();
      await server.connect(transport);
    } else {
      // Invalid request
      res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Bad Request: No valid session ID provided',
        },
        id: null,
      });
      return;
    }

    // Handle the request
    await transport.handleRequest(req, res, req.body);
  });

  // Handle GET requests for server-to-client notifications via SSE
  app.get('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }
    
    const transport = transports[sessionId];
    await transport.handleRequest(req, res);
  });

  // Handle DELETE requests for session termination
  app.delete('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }
    
    const transport = transports[sessionId];
    await transport.handleRequest(req, res);
  });

  const PORT = 3000;
  app.listen(PORT, () => {
    console.log(`🚀 MCP Personal Data Server listening on port ${PORT}`);
    console.log(`🌐 Available endpoints:`);
    console.log(`- POST/GET/DELETE http://localhost:${PORT}/mcp`);
    console.log(`\n📁 Resources:`);
    console.log(`- data://categories - List available personal data categories`);
    console.log(`\n🔍 Tools:`);
    console.log(`- search-personal-data - Search through personal data by title and content`);
    console.log(`\n💡 Make sure to configure your .env file with database credentials!`);
  });
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down server...');
  process.exit(0);
});

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});