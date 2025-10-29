// Delete Personal Data tool

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatErrorMessage } from "../utils/formatting.js";
import { DeleteInputSchema } from "../schemas/index.js";

export function registerDeleteTool(
  server: McpServer,
  supabase: SupabaseClient
): void {
  server.registerTool(
    "datadam_delete_personal_data",
    {
      title: "Delete Personal Data Records",
      description: `Remove personal data records. Requires record UUID(s) from previous search/extract. Use when user explicitly wants to delete information.

TRIGGER KEYWORDS: "delete [X]", "remove [X]", "erase [X]", "forget [X]", "get rid of [X]", "clear [X]", "I don't want [X] anymore"

DELETION TYPES:
- Soft Delete (default): Marks as deleted, recoverable. Use for most cases.
- Hard Delete: Permanent removal. Use ONLY for GDPR "right to be forgotten" requests.

WORKFLOW:
1. User requests deletion
2. If UUID unknown: search/extract to find record(s) first
3. Confirm if bulk or hard delete
4. Delete with appropriate type
5. Confirm (don't show UUIDs)

SAFETY: Always confirm before bulk deletes (3+ records) or hard deletes. Default to soft delete unless GDPR request.

Args:
  - recordIds (string[], required): Array of record UUIDs to delete. Obtain from search/extract first. Examples: ['uuid1'], ['uuid1', 'uuid2']
  - hardDelete (boolean, optional): Permanent deletion flag. Default: false (soft delete, recoverable). Set true ONLY for GDPR compliance
  - response_format (string, optional): 'markdown' (default, human-readable) or 'json' (machine-readable)

Returns:
  - Success message confirming deletion with count and type
  - For JSON format: {success: true, operation: "deleted" | "permanently deleted", count, requested_count, message}
  - For Markdown format: "✓ Successfully {soft/permanently} deleted {count} personal data record(s)"
  - Partial success: Indicates if some records couldn't be deleted

Examples:
  1. Soft delete one: { recordIds: ["uuid1"] }
  2. Soft delete multiple: { recordIds: ["uuid1", "uuid2", "uuid3"] }
  3. Hard delete (GDPR): { recordIds: ["uuid1"], hardDelete: true }
  4. JSON output: { recordIds: ["uuid1"], response_format: "json" }

Error Handling:
  - No records deleted: Returns "No records were {deleted/permanently deleted}. Records may not exist or were already deleted"
  - Partial deletion: Returns "Partially successful: {deleted} {count} of {requested} requested record(s)"
  - Database errors: Returns error with troubleshooting guidance
  - Invalid UUIDs: Returns error indicating UUID format required`,
      inputSchema: DeleteInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async ({ recordIds, hardDelete = false, response_format = 'markdown' }) => {
      try {
        const { data: result, error } = await supabase.rpc('delete_personal_data', {
          p_record_ids: recordIds,
          p_hard_delete: hardDelete
        });

        if (error) {
          return {
            content: [{
              type: "text",
              text: formatErrorMessage(
                `Database error: ${error.message}`,
                "Check your database connection and verify the record IDs are correct.",
                response_format
              )
            }],
            isError: true
          };
        }

        const deletedCount = result || 0;
        const requestedCount = recordIds.length;
        const deleteType = hardDelete ? 'permanently deleted' : 'soft deleted';
        const operation = hardDelete ? 'deleted' : 'deleted';

        if (deletedCount === 0) {
          return {
            content: [{
              type: "text",
              text: formatErrorMessage(
                `No records were ${deleteType}. Records may not exist or were already deleted.`,
                "Verify the record IDs using datadam_search_personal_data or datadam_extract_personal_data.",
                response_format
              )
            }],
            isError: true
          };
        }

        if (deletedCount < requestedCount) {
          const message = `Partially successful: ${deleteType} ${deletedCount} of ${requestedCount} requested record(s). Some records may not exist or were already deleted.`;
          if (response_format === 'json') {
            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  success: true,
                  operation: deleteType,
                  count: deletedCount,
                  requested_count: requestedCount,
                  message: message
                }, null, 2)
              }]
            };
          }
          return {
            content: [{
              type: "text",
              text: `⚠️ ${message}`
            }]
          };
        }

        const message = `Successfully ${deleteType} ${deletedCount} personal data record(s)`;
        if (response_format === 'json') {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                success: true,
                operation: deleteType,
                count: deletedCount,
                message: message
              }, null, 2)
            }]
          };
        }
        return {
          content: [{
            type: "text",
            text: `✓ ${message}`
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: formatErrorMessage(
              `Error deleting personal data: ${error instanceof Error ? error.message : 'Unknown error'}`,
              "Please try again or contact support if the issue persists.",
              response_format
            )
          }],
          isError: true
        };
      }
    }
  );
}
