// Main entry point for DataDam MCP Server

import express from "express";
import cors from "cors";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import * as dotenv from "dotenv";
import { initializeDatabase } from "./services/supabase.js";
import { createMcpServer, createChatGptMcpServer } from "./server.js";
import { generateUsageGuideHtml } from "./usageGuide.js";

// Load environment variables
dotenv.config();

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

  // Health check endpoint for Render
  app.get('/health', (req: express.Request, res: express.Response) => {
    res.status(200).json({
      status: 'healthy',
      service: 'MCP Personal Data Server',
      timestamp: new Date().toISOString()
    });
  });

  // Root endpoint - Usage Guide HTML
  app.get('/', async (req: express.Request, res: express.Response) => {
    try {
      const { supabase } = await import("./services/supabase.js");
      const html = await generateUsageGuideHtml(supabase);
      res.setHeader('Content-Type', 'text/html');
      res.send(html);
    } catch (error) {
      res.status(500).send('Error loading usage guide');
    }
  });

  // Map to store transports by session ID
  const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

  // Separate transport map for ChatGPT endpoint
  const chatgptTransports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

  // Handle POST requests for client-to-server communication
  app.post('/mcp', async (req: express.Request, res: express.Response) => {
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
  app.get('/mcp', async (req: express.Request, res: express.Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }

    const transport = transports[sessionId];
    await transport.handleRequest(req, res);
  });

  // Handle DELETE requests for session termination
  app.delete('/mcp', async (req: express.Request, res: express.Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }

    const transport = transports[sessionId];
    await transport.handleRequest(req, res);
  });

  // ChatGPT-specific endpoint routes
  // Handle POST requests for ChatGPT client-to-server communication
  app.post('/chatgpt_mcp', async (req: express.Request, res: express.Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    if (sessionId && chatgptTransports[sessionId]) {
      // Reuse existing transport
      transport = chatgptTransports[sessionId];
    } else if (!sessionId && isInitializeRequest(req.body)) {
      // New initialization request
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sessionId) => {
          chatgptTransports[sessionId] = transport;
          console.log(`New ChatGPT session initialized: ${sessionId}`);
        },
        enableDnsRebindingProtection: false,
      });

      // Clean up transport when closed
      transport.onclose = () => {
        if (transport.sessionId) {
          console.log(`ChatGPT session closed: ${transport.sessionId}`);
          delete chatgptTransports[transport.sessionId];
        }
      };

      const server = createChatGptMcpServer();
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

  // Handle GET requests for ChatGPT server-to-client notifications via SSE
  app.get('/chatgpt_mcp', async (req: express.Request, res: express.Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !chatgptTransports[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }

    const transport = chatgptTransports[sessionId];
    await transport.handleRequest(req, res);
  });

  // Handle DELETE requests for ChatGPT session termination
  app.delete('/chatgpt_mcp', async (req: express.Request, res: express.Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !chatgptTransports[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }

    const transport = chatgptTransports[sessionId];
    await transport.handleRequest(req, res);
  });

  const PORT = process.env.PORT || 3000;
  const HOST = '0.0.0.0'; // Bind to all interfaces for Render

  app.listen(Number(PORT), HOST, () => {
    console.log(`🚀 MCP Personal Data Server listening on ${HOST}:${PORT}`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);

    if (process.env.NODE_ENV === 'production') {
      console.log(`🔗 Server is ready to accept connections`);
    } else {
      console.log(`🌐 Available endpoints:`);
      console.log(`- POST/GET/DELETE http://localhost:${PORT}/mcp (Full MCP server)`);
      console.log(`- POST/GET/DELETE http://localhost:${PORT}/chatgpt_mcp (ChatGPT connector)`);
      console.log(`\nResources:`);
      console.log(`- data://categories - List available personal data categories`);
      console.log(`\n🔍 Main Tools:`);
      console.log(`- datadam_search_personal_data - Search through personal data by title and content`);
      console.log(`- datadam_extract_personal_data - Extract data by category with optional tag filtering`);
      console.log(`- datadam_create_personal_data - Create new personal data records`);
      console.log(`- datadam_update_personal_data - Update existing records`);
      console.log(`- datadam_delete_personal_data - Delete records`);
      console.log(`\n🤖 ChatGPT Tools:`);
      console.log(`- search - Search for documents (ChatGPT format)`);
      console.log(`- fetch - Fetch complete document content (ChatGPT format)`);
      console.log(`\n💡 Make sure to configure your .env file with database credentials!`);
    }
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
