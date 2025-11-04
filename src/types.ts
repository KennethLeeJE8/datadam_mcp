// TypeScript interfaces for DataDam MCP Server

/**
 * Note: Express Request.auth is defined by mcp-auth library
 *
 * Authentication behavior depends on REQUIRE_AUTH environment variable:
 *
 * REQUIRE_AUTH=true (Authentication REQUIRED):
 * - Valid JWT token MUST be provided in Authorization header
 * - Missing/invalid token → 401 Unauthorized error
 * - Valid token → req.auth populated with:
 *   - req.auth.subject - User ID (from 'sub' claim)
 *   - req.auth.issuer - Token issuer
 *   - req.auth.claims - All JWT claims (sub, email, role, etc.)
 *
 * REQUIRE_AUTH=false (No authentication):
 * - No token required
 * - req.auth is undefined
 * - All tools and database functions work without user context
 *
 * For Supabase tokens, additional claims available in req.auth.claims:
 * - email, phone, role, aal, session_id, is_anonymous
 * - app_metadata, user_metadata, amr
 */

export interface PersonalDataRecord {
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

export interface Category {
  category_name: string;
  display_name: string;
  description: string;
  item_count: number;
  trigger_words: string[];
  query_hint: string;
  example_queries: string[];
  last_modified: string;
}
