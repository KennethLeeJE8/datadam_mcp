// MCP Server factory functions

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { supabase, availableCategories, fetchAvailableCategories } from "./services/supabase.js";
import { registerCategoriesResource } from "./resources/categories.js";
import { registerSearchTool } from "./tools/search.js";
import { registerExtractTool } from "./tools/extract.js";
import { registerCreateTool } from "./tools/create.js";
import { registerUpdateTool } from "./tools/update.js";
import { registerDeleteTool } from "./tools/delete.js";
import { registerChatGptSearchTool } from "./tools/chatgpt-search.js";
import { registerChatGptFetchTool } from "./tools/chatgpt-fetch.js";

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "datadam",
    version: "1.0.0",
    description: "Personal knowledge database that automatically retrieves stored personal context when needed for personalized responses. Captures and stores personal information when user shares details. Triggers on: 'my [anything]', personal questions, preference queries, or when personal context would improve responses."
  });

  // Register resource
  registerCategoriesResource(server, supabase);

  // Register all tools
  registerSearchTool(server, supabase, availableCategories);
  registerExtractTool(server, supabase, availableCategories, fetchAvailableCategories);
  registerCreateTool(server, supabase);
  registerUpdateTool(server, supabase);
  registerDeleteTool(server, supabase);

  return server;
}

export function createChatGptMcpServer(): McpServer {
  const server = new McpServer({
    name: "chatgpt-mcp-server",
    version: "1.0.0"
  });

  // Register ChatGPT-specific tools
  registerChatGptSearchTool(server, supabase);
  registerChatGptFetchTool(server, supabase);

  return server;
}
