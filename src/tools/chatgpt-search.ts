// ChatGPT Search tool

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ChatGptSearchInputSchema } from "../schemas/index.js";

export function registerChatGptSearchTool(
  server: McpServer,
  supabase: SupabaseClient
): void {
  server.registerTool(
    "search",
    {
      title: "Search Personal Data",
      description: `Search through personal data by matching against title, tags, and categories only (not content). Returns citation-friendly results.

ALLOWED CATEGORY FILTERS (fixed set):
- books: Reading, literature, novels, fiction, non-fiction, textbooks, book reviews
- contacts: People, friends, family, colleagues, relationships, networking, contact info
- documents: Files, papers, records, notes, reports, written materials
- basic_information: Personal details, profile info, contact details, general personal data
- digital_products: Software, apps, tools, services, platforms, subscriptions, technology
- preferences: Settings, choices, options, configurations, user preferences
- interests: Hobbies, activities, likes, passions, personal interests
- favorite_authors: Writers, novelists, poets, literary authors

SEARCH STRATEGY: If specific items return no results, try broader category terms. Consider which category would contain the requested information type.`,
      inputSchema: ChatGptSearchInputSchema
    },
    async ({ query }) => {
      try {
        const { data: results, error } = await supabase.rpc('chatgpt_search_data', {
          p_query: query,
          p_user_id: null, // Search across all users for ChatGPT
          p_limit: 10
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
                results: []
              })
            }]
          };
        }

        // Format results according to ChatGPT specification
        const formattedResults = results.map((item: any) => ({
          id: item.id,
          title: item.title,
          url: item.url
        }));

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              results: formattedResults,
              search_info: "Searched in: title, tags, and categories (not content)"
            })
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              error: `Error searching data: ${error instanceof Error ? error.message : 'Unknown error'}`
            })
          }],
          isError: true
        };
      }
    }
  );
}
