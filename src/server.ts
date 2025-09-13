import express from "express";
import cors from "cors";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

interface User {
  id: string;
  name: string;
  email: string;
  department: string;
  role: string;
  location: string;
  phone: string;
  startDate: string;
  skills: string[];
  manager: string | null;
}

let userData: User[] = [];

async function loadUserData(): Promise<void> {
  try {
    const dataPath = join(__dirname, "..", "data", "users.json");
    const rawData = await readFile(dataPath, "utf-8");
    userData = JSON.parse(rawData);
    console.log(`Loaded ${userData.length} users`);
  } catch (error) {
    console.error("Error loading user data:", error);
    userData = [];
  }
}

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "user-data-server",
    version: "1.0.0"
  });

  // Register the user IDs list resource
  server.registerResource(
    "user-ids",
    "users://user_ids",
    {
      title: "User IDs List",
      description: "List of all available user IDs"
    },
    async (uri) => {
      const userIdsList = userData.map(user => 
        `${user.id}: ${user.name} (${user.role})`
      ).join('\n');
      
      return {
        contents: [{
          uri: uri.href,
          text: userIdsList,
          mimeType: "text/plain"
        }]
      };
    }
  );

  // Register the search users tool
  server.registerTool(
    "search-users",
    {
      title: "Search Users",
      description: "Search for users by name, department, role, or skills",
      inputSchema: {
        query: z.string().describe("Search query (name, department, role, or skill)")
      }
    },
    async ({ query }) => {
      const searchTerm = query.toLowerCase();
      
      const matchingUsers = userData.filter(user => 
        user.name.toLowerCase().includes(searchTerm) ||
        user.department.toLowerCase().includes(searchTerm) ||
        user.role.toLowerCase().includes(searchTerm) ||
        user.email.toLowerCase().includes(searchTerm) ||
        user.location.toLowerCase().includes(searchTerm) ||
        user.skills.some(skill => skill.toLowerCase().includes(searchTerm))
      );

      if (matchingUsers.length === 0) {
        return {
          content: [{
            type: "text",
            text: `No users found matching query: "${query}"`
          }]
        };
      }

      const resultText = matchingUsers.map(user => 
        `${user.name} (${user.role}) - ${user.department} - ID: ${user.id}`
      ).join("\n");

      const resourceLinks = matchingUsers.map(user => ({
        type: "resource_link" as const,
        uri: `users://${user.id}`,
        name: user.name,
        description: `${user.role} in ${user.department}`
      }));

      return {
        content: [
          {
            type: "text",
            text: `Found ${matchingUsers.length} users matching "${query}":\n\n${resultText}`
          },
          ...resourceLinks
        ]
      };
    }
  );

  return server;
}

async function main() {
  // Load user data
  await loadUserData();

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
    console.log(`MCP User Data Server listening on port ${PORT}`);
    console.log(`Available endpoints:`);
    console.log(`- POST/GET/DELETE http://localhost:${PORT}/mcp`);
    console.log(`\nResources:`);
    console.log(`- users://user_ids - List all available user IDs`);
    console.log(`\nTools:`);
    console.log(`- search-users - Search users by various criteria`);
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