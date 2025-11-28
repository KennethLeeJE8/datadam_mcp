// Delete Memory tool

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatSuccessMessage, formatErrorMessage } from "../utils/formatting.js";
import { DeleteMemoryInputSchema } from "../schemas/index.js";
import { MemoryService } from "../services/memory.js";

export function registerDeleteMemoryTool(
  server: McpServer,
  supabase: SupabaseClient
): void {
  const memoryService = new MemoryService(supabase);

  server.registerTool(
    "datadam_delete_memory",
    {
      title: "Delete Memory",
      description: `Delete a stored memory. Supports soft delete (recoverable) and hard delete (permanent).

Use for:
- Remove outdated memory: "Delete that old preference"
- Clean up incorrect memory: "That memory is wrong, delete it"
- User requests deletion: "Remove what you stored about X"

Note: Obtain memory_id from datadam_list_memories or datadam_search_memories first.

Args:
  - memory_id (string, required): Memory ID to delete
  - hard_delete (boolean, optional): Permanent deletion. Default: false (soft delete)
  - response_format (string, optional): 'markdown' (default) or 'json'

Returns:
  - Success message confirming deletion type
  - For JSON format: {success: true, operation: "deleted", memory_id, delete_type}
  - For Markdown format: "✓ Successfully {soft/permanently} deleted memory"

Examples:
  1. Soft delete: { memory_id: "abc-123" }
  2. Hard delete: { memory_id: "abc-123", hard_delete: true }

Error Handling:
  - Memory not found: Returns error indicating memory doesn't exist or already deleted
  - Database errors: Returns error with troubleshooting guidance`,
      inputSchema: DeleteMemoryInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true, // Deletion is destructive
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async ({ memory_id, hard_delete = false, response_format = 'markdown' }) => {
      try {
        // Delete memory
        const success = await memoryService.deleteMemory(memory_id, hard_delete);

        if (!success) {
          return {
            content: [{
              type: "text",
              text: formatErrorMessage(
                `Memory not found: ${memory_id}`,
                "The memory may not exist, or it may already be deleted. Use datadam_list_memories with include_deleted: true to check.",
                response_format
              )
            }],
            isError: true
          };
        }

        const deleteType = hard_delete ? 'permanently deleted' : 'soft deleted (recoverable)';

        if (response_format === 'json') {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                success: true,
                operation: "deleted",
                memory_id: memory_id,
                delete_type: hard_delete ? 'hard' : 'soft',
                message: `Memory ${deleteType}`
              }, null, 2)
            }]
          };
        } else {
          return {
            content: [{
              type: "text",
              text: `✓ Successfully ${deleteType} memory\n\n` +
                   `Memory ID: \`${memory_id}\`\n` +
                   (hard_delete
                     ? '⚠️  This deletion is permanent and cannot be undone.'
                     : '💡 This memory is soft-deleted and can be recovered if needed.')
            }]
          };
        }
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: formatErrorMessage(
              `Error deleting memory: ${error instanceof Error ? error.message : 'Unknown error'}`,
              "Verify the memory ID is correct and check database connection.",
              response_format
            )
          }],
          isError: true
        };
      }
    }
  );
}
