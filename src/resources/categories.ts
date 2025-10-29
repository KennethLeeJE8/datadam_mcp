// Categories resource for MCP

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Category } from "../types.js";

export function registerCategoriesResource(server: McpServer, supabase: SupabaseClient): void {
  server.registerResource(
    "data-categories",
    "data://categories",
    {
      title: "Data Categories",
      description: "List of available personal data categories with item counts"
    },
    async (uri) => {
      try {
        const { data: categories, error } = await supabase.rpc('get_active_categories');

        if (error) {
          return {
            contents: [{
              uri: uri.href,
              text: `Error fetching categories: ${error.message}`,
              mimeType: "text/plain"
            }]
          };
        }

        if (!categories || categories.length === 0) {
          return {
            contents: [{
              uri: uri.href,
              text: "No data categories found. Add some personal data to see categories here.",
              mimeType: "text/plain"
            }]
          };
        }

        const categoriesList = categories.map((cat: Category) =>
          `${cat.display_name} (${cat.item_count} items)
   Category: ${cat.category_name}
   Description: ${cat.description}
   Keywords: ${cat.trigger_words.join(', ')}
   Query when: ${cat.query_hint}
   Examples: ${cat.example_queries.join(' | ')}`
        ).join('\n\n');

        return {
          contents: [{
            uri: uri.href,
            text: `Available Personal Data Categories:\n\n${categoriesList}`,
            mimeType: "text/plain"
          }]
        };
      } catch (error) {
        return {
          contents: [{
            uri: uri.href,
            text: `Database connection error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            mimeType: "text/plain"
          }]
        };
      }
    }
  );
}
