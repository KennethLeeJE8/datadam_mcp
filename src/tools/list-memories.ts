// List Memories tool

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatErrorMessage, checkAndTruncateResponse } from "../utils/formatting.js";
import { ListMemoriesInputSchema } from "../schemas/index.js";
import { MemoryService } from "../services/memory.js";
import { CHARACTER_LIMIT } from "../constants.js";

export function registerListMemoriesTool(
  server: McpServer,
  supabase: SupabaseClient
): void {
  const memoryService = new MemoryService(supabase);

  server.registerTool(
    "datadam_list_memories",
    {
      title: "List All Memories",
      description: `List all stored memories with pagination and filtering. Browse memories without semantic search.

WHEN TO USE:
- Browse all memories: "Show me all my memories"
- Review specific type: Filter by metadata like source or category
- Pagination: Navigate through large memory sets
- Audit: Review what's been stored

DIFFERENCE FROM SEARCH:
- Lists memories chronologically (newest first)
- No similarity ranking
- Use this for browsing, use search for finding relevant context

Args:
  - user_id (string, optional): User UUID to filter results
  - limit (number, optional): Results per page. Default: 50, Range: 1-100
  - offset (number, optional): Pagination offset. Default: 0
  - filters (object, optional): Metadata filters. Examples: {"source": "conversation"}, {"category": "preferences"}
  - include_deleted (boolean, optional): Include soft-deleted memories. Default: false
  - response_format (string, optional): 'markdown' (default) or 'json'

Returns:
  - For JSON format: {total, count, memories[], offset, has_more}
  - For Markdown format: Numbered list with content, metadata, timestamps
  - Ordered by creation time (newest first)

Examples:
  1. List all: { limit: 10, offset: 0 }
  2. User-specific: { user_id: "uuid-here", limit: 20 }
  3. Filtered: { filters: {"source": "conversation"}, limit: 15 }
  4. With deleted: { include_deleted: true, limit: 50 }
  5. Pagination: { limit: 10, offset: 10 } // Get second page

Error Handling:
  - No memories: Returns empty array with suggestion to add memories
  - Database errors: Returns error with troubleshooting guidance`,
      inputSchema: ListMemoriesInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async ({ user_id, limit = 50, offset = 0, filters, include_deleted = false, response_format = 'markdown' }) => {
      try {
        // List memories
        const memories = await memoryService.listMemories(
          user_id || null,
          limit,
          offset,
          filters || null,
          include_deleted
        );

        if (!memories || memories.length === 0) {
          const suggestion = offset > 0
            ? "No more memories found. Try reducing the offset or use datadam_add_memory to store new memories."
            : "No memories found. Use datadam_add_memory to store your first memory!";

          return {
            content: [{
              type: "text",
              text: formatErrorMessage(
                "No memories found",
                suggestion,
                response_format
              )
            }]
          };
        }

        if (response_format === 'json') {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                total: memories.length,
                count: memories.length,
                offset: offset,
                has_more: memories.length === limit, // If we got exactly limit, there might be more
                memories: memories.map(m => ({
                  id: m.id,
                  memory_text: m.memory_text,
                  metadata: m.metadata,
                  created_at: m.created_at,
                  updated_at: m.updated_at,
                  deleted_at: m.deleted_at || null
                }))
              }, null, 2)
            }]
          };
        } else {
          // Format markdown response
          let text = `Found ${memories.length} ${memories.length === 1 ? 'memory' : 'memories'}`;
          if (offset > 0) {
            text += ` (starting from ${offset})`;
          }
          text += ':\n\n';

          memories.forEach((memory, index) => {
            const displayIndex = offset + index + 1;
            const isDeleted = memory.deleted_at ? ' [DELETED]' : '';
            text += `${displayIndex}. ${memory.memory_text}${isDeleted}\n`;
            text += `   🆔 ID: \`${memory.id}\`\n`;

            if (memory.metadata && Object.keys(memory.metadata).length > 0) {
              text += `   📝 Metadata: ${JSON.stringify(memory.metadata)}\n`;
            }

            const createdDate = new Date(memory.created_at).toLocaleString();
            text += `   🕒 Created: ${createdDate}\n`;

            if (memory.deleted_at) {
              const deletedDate = new Date(memory.deleted_at).toLocaleString();
              text += `   🗑️  Deleted: ${deletedDate}\n`;
            }

            text += '\n';
          });

          if (memories.length === limit) {
            text += `\n💡 More memories may be available. Use offset: ${offset + limit} to see the next page.`;
          }

          // Check if response is too long
          if (text.length > CHARACTER_LIMIT) {
            text = text.substring(0, CHARACTER_LIMIT) + `\n\n⚠️  Response truncated due to length. Use pagination to see more results.`;
          }

          return {
            content: [{
              type: "text",
              text: text
            }]
          };
        }
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: formatErrorMessage(
              `Error listing memories: ${error instanceof Error ? error.message : 'Unknown error'}`,
              "Verify database connection and check Supabase credentials.",
              response_format
            )
          }],
          isError: true
        };
      }
    }
  );
}
