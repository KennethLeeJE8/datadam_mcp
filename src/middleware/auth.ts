// Authentication middleware for DataDam MCP Server
// Uses mcp-auth library for OAuth 2.1 compliant JWT validation

import { MCPAuth, fetchServerConfig } from 'mcp-auth';
import * as dotenv from 'dotenv';

dotenv.config();

/**
 * Initializes mcp-auth with Supabase as the authorization server
 *
 * Functionality:
 * - Validates JWT tokens from Supabase Auth
 * - Fetches and caches JWKS (public keys) from Supabase
 * - Verifies token signature, expiration, issuer, and audience
 * - Exposes OAuth 2.0 Authorization Server Metadata
 *
 * @returns MCPAuth instance configured for Supabase
 * @throws Error if required environment variables are missing
 */
async function initializeMcpAuth(): Promise<MCPAuth> {
  // Validate required environment variables
  if (!process.env.SUPABASE_URL) {
    throw new Error('SUPABASE_URL environment variable is required for authentication');
  }

  if (!process.env.SERVER_URL) {
    throw new Error('SERVER_URL environment variable is required for authentication');
  }

  console.log('🔐 Initializing mcp-auth with Supabase as authorization server');
  console.log(`   Auth Server: ${process.env.SUPABASE_URL}/auth/v1`);
  console.log(`   Resource: ${process.env.SERVER_URL}/mcp`);

  // Fetch Supabase authorization server configuration
  const serverConfig = await fetchServerConfig(
    `${process.env.SUPABASE_URL}/auth/v1`,
    { type: 'oidc' }
  );

  // Create mcp-auth instance
  const mcpAuth = new MCPAuth({
    server: serverConfig
  });

  console.log('✅ mcp-auth initialized successfully');

  return mcpAuth;
}

// Initialize mcp-auth once (async initialization)
let mcpAuthInstance: MCPAuth | null = null;
let mcpAuthPromise: Promise<MCPAuth> | null = null;

function getMcpAuth(): Promise<MCPAuth> {
  if (mcpAuthInstance) {
    return Promise.resolve(mcpAuthInstance);
  }

  if (!mcpAuthPromise) {
    mcpAuthPromise = initializeMcpAuth().then((instance) => {
      mcpAuthInstance = instance;
      return instance;
    });
  }

  return mcpAuthPromise;
}

/**
 * Express middleware for JWT Bearer token validation
 *
 * IMPORTANT: This middleware REQUIRES a valid JWT token
 *
 * On Success (valid token):
 * - Attaches decoded user info to req.auth
 * - req.auth.subject contains the user ID
 * - Request continues to route handler
 *
 * On Failure (missing, invalid, or expired token):
 * - Returns 401 Unauthorized
 * - Includes WWW-Authenticate header with error details
 * - Request is blocked before reaching route handler
 *
 * Error cases:
 * - Missing Authorization header → 401
 * - Malformed token → 401
 * - Invalid signature → 401
 * - Expired token → 401
 * - Wrong issuer/audience → 401
 *
 * Usage:
 * app.post('/mcp', authMiddleware, async (req, res) => {
 *   const userId = req.auth.subject;  // Guaranteed to exist here
 *   // ... handle request
 * });
 */
export const authMiddleware = async (req: any, res: any, next: any) => {
  const mcpAuth = await getMcpAuth();
  const handler = mcpAuth.bearerAuth('jwt', {
    audience: process.env.SUPABASE_URL
  });
  return handler(req, res, next);
};

/**
 * Express router for OAuth 2.0 Authorization Server Metadata
 *
 * Exposes: GET /.well-known/oauth-authorization-server
 *
 * Returns OAuth 2.0 Authorization Server Metadata (RFC 8414)
 *
 * Purpose:
 * - MCP clients can auto-discover authentication requirements
 * - Indicates authorization endpoints, JWKS URI, etc.
 *
 * Note: This returns a Promise<Router> because mcpAuth needs async initialization,
 * but the delegatedRouter() method itself is synchronous.
 */
export const getMetadataRouter = async () => {
  const mcpAuth = await getMcpAuth();
  return mcpAuth.delegatedRouter();
};
