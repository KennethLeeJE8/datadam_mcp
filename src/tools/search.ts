// Search Personal Data tool

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { formatErrorMessage, checkAndTruncateResponse } from "../utils/formatting.js";
import { SearchInputSchema } from "../schemas/index.js";
import { CHARACTER_LIMIT } from "../constants.js";

export function registerSearchTool(
  server: McpServer,
  supabase: SupabaseClient,
  availableCategories: string[]
): void {
  server.registerTool(
    "datadam_search_personal_data",
    {
      title: "Search Personal Data by Keyword",
      description: `Search for SPECIFIC datapoints, names, or details across all personal data using keyword matching. Use when looking for a specific person, thing, or piece of information (e.g., "find John's email", "my passport number", "Docker info"). Returns ranked results with context snippets.

WHEN TO USE:
- Searching for specific person: "find John", "who is Sarah"
- Looking for specific datapoint: "my passport number", "email address", "phone number"
- Specific details mentioned: proper nouns, concrete terms
- Cross-category keyword search needed

WHEN NOT TO USE:
- Browsing entire category → use datadam_extract_personal_data instead
- "All my [category]" or "list my [category]" → use datadam_extract_personal_data instead
- No specific search term, just browsing tags → use datadam_extract_personal_data instead

TRIGGER KEYWORDS: "find [specific]", "search [name]", "what's [detail]", "who is", "lookup", "get [specific info]", "tell me about [specific thing]"

AVAILABLE CATEGORIES: ${availableCategories.length > 0 ? availableCategories.join(', ') : 'Categories will be available once data is added'}

Args:
  - query (string, required): Specific search term, name, or datapoint to find
  - categories (string[], optional): Narrow search to specific active categories. Examples: ['contacts'], ['books', 'documents']
  - tags (string[], optional): Filter by tags. Use singular form. Examples: ['family'], ['work', 'urgent']
  - classification (enum, optional): Filter by sensitivity - 'public', 'personal', 'sensitive', or 'confidential'
  - limit (number, optional): Max results. Range: 1-100, Default: 20
  - userId (string, optional): User UUID for multi-user systems
  - response_format (string, optional): 'markdown' (default, human-readable) or 'json' (machine-readable)

Returns:
  - For JSON format: Structured data with schema: {total, count, results[], has_more, next_offset}
  - For Markdown format: Human-readable numbered list with categories, tags, content previews
  - Each result includes: id, title, category, tags, content, classification, created_at, updated_at

Examples:
  1. Find contact: { query: "John email", categories: ["contacts"], limit: 10 }
  2. Find book: { query: "Matt Ridley", categories: ["books", "favorite_authors"] }
  3. Cross-category: { query: "Docker", tags: ["learning"] }
  4. JSON output: { query: "address", response_format: "json" }

Error Handling:
  - No results: Returns "No results found matching '<query>'" with suggestions (try broader terms, check spelling, use datadam_extract_personal_data)
  - Database errors: Returns error message with connection troubleshooting guidance
  - Invalid category: Request will be rejected during schema validation with error showing valid active categories`,
      inputSchema: SearchInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async ({ query, categories, tags, classification, limit = 20, offset = 0, userId, response_format = 'markdown' }) => {
      try {
        // Remove surrounding quotes if present
        const cleanQuery = query.replace(/^["']|["']$/g, '').trim();

        // Detect "my {category}" pattern and auto-categorize if not already specified
        const myPattern = /\bmy\s+(\w+)/gi;
        const matches = cleanQuery.match(myPattern);

        if (matches && (!categories || categories.length === 0)) {
          // Extract potential category from "my X" pattern
          const potentialCategory = matches[0].replace(/\bmy\s+/i, '').toLowerCase();

          // Check if it matches any available categories
          if (availableCategories.includes(potentialCategory)) {
            categories = [potentialCategory];
            console.log(`Auto-detected category from "my ${potentialCategory}" pattern`);
          }
        }

        const { data: results, error } = await supabase.rpc('search_personal_data', {
          p_user_id: userId || null,
          p_search_text: cleanQuery,
          p_categories: (categories && categories.length > 0) ? categories : null,
          p_tags: (tags && tags.length > 0) ? tags : null,
          p_classification: classification || null,
          p_limit: limit,
          p_offset: offset
        });

        if (error) {
          return {
            content: [{
              type: "text",
              text: formatErrorMessage(
                `Database error: ${error.message}`,
                "Check your database connection and ensure Supabase is configured correctly",
                response_format
              )
            }],
            isError: true
          };
        }

        if (!results || results.length === 0) {
          const suggestion = "Try:\n- Using broader search terms\n- Checking spelling\n- Removing category filters\n- Using datadam_extract_personal_data to browse categories";
          return {
            content: [{
              type: "text",
              text: formatErrorMessage(
                `No results found matching query: "${query}"`,
                suggestion,
                response_format
              )
            }]
          };
        }

        // Format response with character limit checking
        const truncationResult = checkAndTruncateResponse(
          results,
          CHARACTER_LIMIT,
          response_format,
          offset,
          results.length,
          results.length === limit,
          offset + results.length,
          { showIds: true }
        );

        // Add search context to markdown format
        let finalText = truncationResult.text;
        if (response_format === 'markdown' && !truncationResult.wasTruncated) {
          finalText = `Found ${results.length} items matching "${query}":\n\n${truncationResult.text}`;
        } else if (response_format === 'markdown' && truncationResult.wasTruncated) {
          // Truncation message already included in truncationResult.text
          finalText = `Found ${truncationResult.originalCount} items matching "${query}" (showing ${truncationResult.truncatedCount}):\n\n${truncationResult.text}`;
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
              `Error searching personal data: ${error instanceof Error ? error.message : 'Unknown error'}`,
              "Please try again or contact support if the issue persists",
              response_format
            )
          }],
          isError: true
        };
      }
    }
  );
}
