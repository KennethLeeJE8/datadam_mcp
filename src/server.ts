// MCP Server factory functions

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { supabase, availableCategories, allCategories, fetchAvailableCategories } from "./services/supabase.js";
import { registerCategoriesResource } from "./resources/categories.js";
import { registerSearchTool } from "./tools/search.js";
import { registerExtractTool } from "./tools/extract.js";
import { registerCreateTool } from "./tools/create.js";
import { registerUpdateTool } from "./tools/update.js";
import { registerDeleteTool } from "./tools/delete.js";
import { registerChatGptSearchTool } from "./tools/chatgpt-search.js";
import { registerChatGptFetchTool } from "./tools/chatgpt-fetch.js";
import { registerAddMemoryTool } from "./tools/add-memory.js";
import { registerSearchMemoriesTool } from "./tools/search-memories.js";
import { registerListMemoriesTool } from "./tools/list-memories.js";
import { registerDeleteMemoryTool } from "./tools/delete-memory.js";

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "datadam",
    version: "1.0.0"
  });

  // Register resource
  registerCategoriesResource(server, supabase);

  // Register all tools
  registerSearchTool(server, supabase, availableCategories);
  registerExtractTool(server, supabase, availableCategories, fetchAvailableCategories);
  registerCreateTool(server, supabase, allCategories);
  registerUpdateTool(server, supabase);
  registerDeleteTool(server, supabase);

  // Register memory tools
  registerAddMemoryTool(server, supabase);
  registerSearchMemoriesTool(server, supabase);
  registerListMemoriesTool(server, supabase);
  registerDeleteMemoryTool(server, supabase);

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
