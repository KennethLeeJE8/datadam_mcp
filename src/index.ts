// Main entry point for DataDam MCP Server
// HTTP transport with OAuth 2.1 authentication

import express from "express";
import cors from "cors";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import * as dotenv from "dotenv";
import { authMiddleware, getMetadataRouter } from "./middleware/auth.js";
import { initializeDatabase } from "./services/supabase.js";
import { createMcpServer, createChatGptMcpServer } from "./server.js";
import { generateUsageGuideHtml } from "./usageGuide.js";

// Load environment variables
dotenv.config();

/**
 * Returns authentication middleware based on REQUIRE_AUTH environment variable
 *
 * If REQUIRE_AUTH=true: Returns full JWT validation middleware
 * If REQUIRE_AUTH=false: Returns pass-through middleware with test user
 *
 * This enables gradual rollout and testing without authentication
 */
function getAuthMiddleware() {
  const requireAuth = process.env.REQUIRE_AUTH === 'true';

  if (requireAuth) {
    return authMiddleware;
  } else {
    // Pass-through middleware when auth is disabled - no user context required
    return (req: express.Request, res: express.Response, next: express.NextFunction) => {
      // Don't set req.auth - system works without userId
      next();
    };
  }
}

async function main() {
  console.log('🌐 Starting DataDam MCP Server - HTTP Transport');

  // Initialize database connection
  await initializeDatabase();

  const app = express();

  // Check authentication configuration
  const requireAuth = process.env.REQUIRE_AUTH === 'true';

  if (requireAuth) {
    if (!process.env.SUPABASE_URL) {
      throw new Error('REQUIRE_AUTH=true but SUPABASE_URL not set');
    }
    if (!process.env.SERVER_URL) {
      throw new Error('REQUIRE_AUTH=true but SERVER_URL not set');
    }
    console.log('🔒 Authentication: ENABLED for HTTP endpoints');
  } else {
    console.log('⚠️  Authentication: DISABLED (development mode)');
    console.log('⚠️  WARNING: Do not use in production without auth!');
  }

  // CORS configuration
  const getCorsOrigins = () => {
    if (process.env.ALLOWED_ORIGINS) {
      const origins = process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim());
      console.log(`🌐 CORS: Allowing origins: ${origins.join(', ')}`);
      return origins;
    }
    console.log('🌐 CORS: Allowing all origins (*)');
    return '*';
  };

  app.use(cors({
    origin: getCorsOrigins(),
    exposedHeaders: ['Mcp-Session-Id', 'WWW-Authenticate'],
    allowedHeaders: ['Content-Type', 'mcp-session-id', 'Authorization'],
  }));

  app.use(express.json());

  // Mount OAuth metadata router (if auth enabled)
  if (requireAuth) {
    const metadataRouter = await getMetadataRouter();
    app.use(metadataRouter);
    console.log('📋 OAuth metadata: /.well-known/oauth-authorization-server');
  }

  // Health check endpoint for Render (public - no auth)
  app.get('/health', (req: express.Request, res: express.Response) => {
    res.status(200).json({
      status: 'healthy',
      service: 'MCP Personal Data Server',
      transport: 'http',
      timestamp: new Date().toISOString(),
      auth_enabled: requireAuth
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

  // Handle POST requests for client-to-server communication (PROTECTED)
  app.post('/mcp', getAuthMiddleware(), async (req: express.Request, res: express.Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    const userId = req.auth?.subject; // Optional: Authenticated user ID from JWT

    if (requireAuth && userId) {
      console.log(`[AUTH] MCP request from user: ${userId}`);
    }

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
          const logMsg = `Session: ${sessionId}${requireAuth ? ` (user: ${userId})` : ''}`;
          console.log(logMsg);
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

      // TODO Phase 4: Optionally pass userId to server for user-scoped operations
      // userId is optional - system works without it
      // const server = createMcpServer(userId);
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

  // Handle GET requests for server-to-client notifications via SSE (PROTECTED)
  app.get('/mcp', getAuthMiddleware(), async (req: express.Request, res: express.Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }

    const transport = transports[sessionId];
    await transport.handleRequest(req, res);
  });

  // Handle DELETE requests for session termination (PROTECTED)
  app.delete('/mcp', getAuthMiddleware(), async (req: express.Request, res: express.Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }

    const transport = transports[sessionId];
    await transport.handleRequest(req, res);
  });

  // ChatGPT-specific endpoint routes (PROTECTED)
  // Handle POST requests for ChatGPT client-to-server communication
  app.post('/chatgpt_mcp', getAuthMiddleware(), async (req: express.Request, res: express.Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    const userId = req.auth?.subject; // Optional: Authenticated user ID from JWT

    if (requireAuth && userId) {
      console.log(`[AUTH] ChatGPT MCP request from user: ${userId}`);
    }

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
          const logMsg = `ChatGPT session: ${sessionId}${requireAuth ? ` (user: ${userId})` : ''}`;
          console.log(logMsg);
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

      // TODO Phase 4: Optionally pass userId to ChatGPT server for user-scoped operations
      // userId is optional - system works without it
      // const server = createChatGptMcpServer(userId);
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

  // Handle GET requests for ChatGPT server-to-client notifications via SSE (PROTECTED)
  app.get('/chatgpt_mcp', getAuthMiddleware(), async (req: express.Request, res: express.Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !chatgptTransports[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }

    const transport = chatgptTransports[sessionId];
    await transport.handleRequest(req, res);
  });

  // Handle DELETE requests for ChatGPT session termination (PROTECTED)
  app.delete('/chatgpt_mcp', getAuthMiddleware(), async (req: express.Request, res: express.Response) => {
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
    console.log('═'.repeat(60));
    console.log('🚀 DataDam MCP Server - HTTP Transport');
    console.log('═'.repeat(60));
    console.log(`📡 Listening: ${HOST}:${PORT}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔒 Authentication: ${requireAuth ? 'ENABLED' : 'DISABLED'}`);

    if (requireAuth) {
      console.log(`🔑 Auth Server: ${process.env.SUPABASE_URL}/auth/v1`);
      console.log(`📋 Metadata: ${process.env.SERVER_URL}/.well-known/oauth-authorization-server`);
    }

    console.log('═'.repeat(60));
    console.log('📍 Endpoints:');
    console.log(`   POST/GET/DELETE /mcp          ${requireAuth ? '🔒 Protected' : '🔓 Open'}`);
    console.log(`   POST/GET/DELETE /chatgpt_mcp  ${requireAuth ? '🔒 Protected' : '🔓 Open'}`);
    console.log(`   GET  /health                  🔓 Public`);
    console.log(`   GET  /                        🔓 Public (usage guide)`);

    if (requireAuth) {
      console.log(`   GET  /.well-known/oauth-authorization-server  🔓 Public (metadata)`);
    }

    console.log('═'.repeat(60));

    if (process.env.NODE_ENV !== 'production') {
      console.log('\n🔍 Available Tools:');
      console.log('   Main MCP Server:');
      console.log('   - datadam_search_personal_data');
      console.log('   - datadam_extract_personal_data');
      console.log('   - datadam_create_personal_data');
      console.log('   - datadam_update_personal_data');
      console.log('   - datadam_delete_personal_data');
      console.log('\n   ChatGPT Server:');
      console.log('   - search (citation-friendly)');
      console.log('   - fetch (document retrieval)');
      console.log('\n📚 Resources:');
      console.log('   - data://categories (personal data categories)');
      console.log('\n💡 Tip: Configure .env file with required credentials');
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
