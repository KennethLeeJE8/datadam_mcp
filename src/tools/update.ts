// Update Personal Data tool

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatSuccessMessage, formatErrorMessage } from "../utils/formatting.js";
import { UpdateInputSchema } from "../schemas/index.js";

export function registerUpdateTool(
  server: McpServer,
  supabase: SupabaseClient
): void {
  server.registerTool(
    "datadam_update_personal_data",
    {
      title: "Update Existing Personal Data",
      description: `Modify existing personal data records. Requires record UUID from previous search/extract. Use when user shares information that contradicts, corrects, or updates previously stored data.

TRIGGERS (indicating data should be updated):
- Explicit update requests: "update [X]", "change [X]", "modify [X]", "edit [X]", "correct [X]", "fix [X]", "revise [X]"
- Life changes: "I moved to [X]", "My new [X] is...", "I now [verb]...", "I switched to...", "I changed to..."
- Corrections: "actually...", "no, it's...", "I meant...", "correction:", "not [X], [Y]"
- Status changes: "I'm no longer...", "I quit...", "I started...", "I joined..."
- Conflicting information: User shares different information about same topic (e.g., mentions new email when old one exists)
- Self-corrections: "Actually I live in Boston now", "I got a new job at X"

WORKFLOW:
1. User shares update (explicit or implicit)
2. Search/extract to find existing record first
3. If found: apply updates to identified record
4. If not found: use datadam_create_personal_data instead
5. Confirm (don't show UUID to user)

EXAMPLES:
- "Update John's email to new@email.com" → search for John → update with UUID
- "I moved to Boston" → extract basic_information for location → update
- "My new phone is 555-1234" → search for phone in contacts → update
- "Actually I work at Google now" → search for job/company → update

Args:
  - recordId (string, required): UUID of record to update. Obtain from datadam_search_personal_data or datadam_extract_personal_data first
  - updates (object, required): Fields to update. Only include changed fields. Can include: title, content, tags, category, classification
  - conversationContext (string, optional): Conversation context for extracting updates
  - response_format (string, optional): 'markdown' (default, human-readable) or 'json' (machine-readable)

Returns:
  - Success message confirming record update
  - For JSON format: {success: true, operation: "updated", recordId, message}
  - For Markdown format: "✓ Successfully updated record: **{title}**"

Examples:
  1. Update email: { recordId: "<UUID>", updates: { content: { email: "new@email.com" } } }
  2. Update tags: { recordId: "<UUID>", updates: { tags: ["family", "urgent"] } }
  3. Update title: { recordId: "<UUID>", updates: { title: "Emergency Contact – Updated" } }
  4. Multiple fields: { recordId: "<UUID>", updates: { title: "John - CEO", content: { role: "CEO" } } }

Error Handling:
  - Record not found: Returns "Record not found or no changes made: {recordId}" with isError flag
  - Database errors: Returns error with troubleshooting guidance
  - Invalid recordId format: Returns error indicating UUID format required
  - No changes: Returns error if updates object is empty or no fields changed`,
      inputSchema: UpdateInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async ({ recordId, updates, conversationContext, response_format = 'markdown' }) => {
      try {
        // Debug logging
        console.log('Update parameters:', {
          recordId,
          updates: JSON.stringify(updates, null, 2),
          conversationContext
        });

        const { data: result, error } = await supabase.rpc('update_personal_data', {
          p_record_id: recordId,
          p_updates: updates,
          p_conversation_context: conversationContext || null
        });

        console.log('Update result:', { result, error });

        if (error) {
          return {
            content: [{
              type: "text",
              text: formatErrorMessage(
                `Database error: ${error.message}`,
                "Check your database connection and verify the record ID is correct.",
                response_format
              )
            }],
            isError: true
          };
        }

        if (!result) {
          return {
            content: [{
              type: "text",
              text: formatErrorMessage(
                `Record not found or no changes made: ${recordId}`,
                "Verify the record ID exists using datadam_search_personal_data or datadam_extract_personal_data.",
                response_format
              )
            }],
            isError: true
          };
        }

        return {
          content: [{
            type: "text",
            text: formatSuccessMessage('updated', result.title || recordId, result.category, response_format)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: formatErrorMessage(
              `Error updating personal data: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
