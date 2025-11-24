// List Memories tool

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatErrorMessage, checkAndTruncateMemories } from "../utils/formatting.js";
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

        // Format response with character limit checking
        const truncationResult = checkAndTruncateMemories(
          memories,
          CHARACTER_LIMIT,
          response_format,
          offset,
          {
            total: memories.length,
            hasMore: memories.length === limit,
            nextOffset: offset + memories.length
          },
          { showIds: true, showMetadata: true }
        );

        // Add list context to markdown format
        let finalText = truncationResult.text;
        if (response_format === 'markdown' && !truncationResult.wasTruncated) {
          const countText = `Found ${memories.length} ${memories.length === 1 ? 'memory' : 'memories'}`;
          const offsetText = offset > 0 ? ` (starting from ${offset})` : '';
          const moreText = memories.length === limit ? `\n\n💡 More memories may be available. Use offset: ${offset + limit} to see the next page.` : '';
          finalText = `${countText}${offsetText}:\n\n${truncationResult.text}${moreText}`;
        } else if (response_format === 'markdown' && truncationResult.wasTruncated) {
          // Truncation message already included in truncationResult.text
          const countText = `Found ${truncationResult.originalCount} ${truncationResult.originalCount === 1 ? 'memory' : 'memories'} (showing ${truncationResult.truncatedCount})`;
          const offsetText = offset > 0 ? ` (starting from ${offset})` : '';
          finalText = `${countText}${offsetText}:\n\n${truncationResult.text}`;
        }

        return {
          content: [{
            type: "text",
            text: finalText
          }]
        };
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
