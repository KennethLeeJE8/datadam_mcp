// Extract Personal Data tool

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatErrorMessage, checkAndTruncateResponse } from "../utils/formatting.js";
import { ExtractInputSchema } from "../schemas/index.js";
import { CHARACTER_LIMIT } from "../constants.js";

export function registerExtractTool(
  server: McpServer,
  supabase: SupabaseClient,
  availableCategories: string[],
  fetchAvailableCategories: () => Promise<string[]>
): void {
  server.registerTool(
    "datadam_extract_personal_data",
    {
      title: "List Items by Category/Tags",
      description: `Retrieve items by CATEGORY or TAGS when browsing/listing without specific search terms. Use for "show me all my X" requests or tag-based filtering. Returns complete records.

WHEN TO USE:
- Listing entire category: "all my contacts", "my books"
- Browsing by tag: "family contacts", "work items"
- "Show me my [category]" requests
- Exploring what's in a category
- Tag-based filtering within category

WHEN NOT TO USE:
- Searching for specific person/thing → use datadam_search_personal_data
- Looking for specific datapoint by name → use datadam_search_personal_data
- Need keyword matching → use datadam_search_personal_data

TRIGGER KEYWORDS: "all my [category]", "my [category]", "list my", "show me my", "what [category] do I have", "[tag] [category]", "browse my"

AVAILABLE CATEGORIES: ${availableCategories.length > 0 ? availableCategories.join(', ') : 'Categories will be available once data is added'}

Args:
  - category (string, required): Exact category name. Available categories: ${availableCategories.length > 0 ? availableCategories.join(', ') : 'none yet'}
  - tags (string[], optional): Filter within category by tags. Singular forms only. Examples: ['family'], ['work'], ['sci-fi']
  - limit (number, optional): Results per page. Range: 1-100, Default: 50
  - offset (number, optional): Pagination offset for browsing large result sets. Default: 0
  - userId (string, optional): User UUID for multi-user systems
  - filters (object, optional): Additional field-level filters
  - response_format (string, optional): 'markdown' (default, human-readable) or 'json' (machine-readable)

Returns:
  - For JSON format: Structured data with schema: {total, count, results[], has_more, next_offset}
  - For Markdown format: Human-readable numbered list with complete record details
  - Each result includes: id, title, category, tags, full content, classification, created_at, updated_at

Examples:
  1. List all contacts: { category: "contacts", limit: 20 }
  2. Family contacts only: { category: "contacts", tags: ["family"] }
  3. Browse books with pagination: { category: "books", limit: 10, offset: 10 }
  4. JSON output: { category: "interests", response_format: "json" }

Error Handling:
  - No records found: Returns "No personal data found in category: {category}" with optional tag info
  - Invalid category: Returns error with list of available categories
  - Database errors: Returns error message with troubleshooting guidance`,
      inputSchema: ExtractInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async ({ category, tags, userId, filters, limit = 50, offset = 0, response_format = 'markdown' }) => {
      try {
        // Refresh categories before processing
        const latestCategories = await fetchAvailableCategories();
        if (latestCategories.length > 0) {
          availableCategories.length = 0;
          availableCategories.push(...latestCategories);
        }

        // Validate category against latest list
        if (availableCategories.length > 0 && !availableCategories.includes(category)) {
          return {
            content: [{
              type: "text",
              text: `Invalid category "${category}". Available categories: ${availableCategories.join(', ')}`
            }],
            isError: true
          };
        }
        const { data: results, error } = await supabase.rpc('extract_personal_data', {
          p_category: category,
          p_tags: (tags && tags.length > 0) ? tags : null,
          p_user_id: userId || null,
          p_filters: filters || null,
          p_limit: limit,
          p_offset: offset
        });

        if (error) {
          return {
            content: [{
              type: "text",
              text: formatErrorMessage(
                `Database error: ${error.message}`,
                "Check your database connection and ensure the category exists",
                response_format
              )
            }],
            isError: true
          };
        }

        if (!results || results.length === 0) {
          const filterInfo = tags && tags.length > 0
            ? ` in category: ${category} with tags: ${tags.join(', ')}`
            : ` in category: ${category}`;
          return {
            content: [{
              type: "text",
              text: formatErrorMessage(
                `No personal data found${filterInfo}`,
                "Try removing tag filters or using a different category",
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

        // Add extract context to markdown format
        let finalText = truncationResult.text;
        if (response_format === 'markdown' && !truncationResult.wasTruncated) {
          finalText = `Found ${results.length} items with tags [${tags?.join(', ') || 'none'}]:\n\n${truncationResult.text}`;
        } else if (response_format === 'markdown' && truncationResult.wasTruncated) {
          // Truncation message already included in truncationResult.text
          finalText = `Found ${truncationResult.originalCount} items with tags [${tags?.join(', ') || 'none'}] (showing ${truncationResult.truncatedCount}):\n\n${truncationResult.text}`;
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
              `Error extracting personal data: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
