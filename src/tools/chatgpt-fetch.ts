// ChatGPT Fetch tool

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ChatGptFetchInputSchema } from "../schemas/index.js";

export function registerChatGptFetchTool(
  server: McpServer,
  supabase: SupabaseClient
): void {
  server.registerTool(
    "fetch",
    {
      title: "Fetch Document by ID",
      description: "Retrieve complete document content by ID including full text, metadata, and all associated information.",
      inputSchema: ChatGptFetchInputSchema
    },
    async ({ id }) => {
      try {
        const { data: results, error } = await supabase.rpc('chatgpt_fetch_data', {
          p_document_id: id
        });

        if (error) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                error: `Database error: ${error.message}`
              })
            }]
          };
        }

        if (!results || results.length === 0) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                error: `Document not found: ${id}`
              })
            }]
          };
        }

        const doc = results[0];

        // Format result according to ChatGPT specification
        const formattedResult = {
          id: doc.id,
          title: doc.title,
          text: doc.text,
          url: doc.url,
          metadata: doc.metadata
        };

        return {
          content: [{
            type: "text",
            text: JSON.stringify(formattedResult)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              error: `Error fetching document: ${error instanceof Error ? error.message : 'Unknown error'}`
            })
          }],
          isError: true
        };
      }
    }
  );
}
