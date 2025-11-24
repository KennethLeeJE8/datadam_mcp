// Search Memories tool

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatErrorMessage, checkAndTruncateMemories } from "../utils/formatting.js";
import { SearchMemoriesInputSchema } from "../schemas/index.js";
import { MemoryService } from "../services/memory.js";
import { CHARACTER_LIMIT } from "../constants.js";

export function registerSearchMemoriesTool(
  server: McpServer,
  supabase: SupabaseClient
): void {
  const memoryService = new MemoryService(supabase);

  server.registerTool(
    "datadam_search_memories",
    {
      title: "Search Memories Semantically",
      description: `Search stored memories using semantic similarity. Automatically generates embeddings for your query using OpenAI (or mock embeddings if API key not configured). Finds contextually relevant memories even without exact keyword matches.

WHEN TO USE:
- Finding preferences: "What do you know about my preferences?"
- Contextual recall: "What have we discussed about TypeScript?"
- Insight discovery: "What programming languages do I use?"
- Broad queries: "Tell me about my work setup"

DIFFERENCE FROM KEYWORD SEARCH:
- Semantic search finds conceptually similar memories using vector similarity
- Keyword search (datadam_search_personal_data) finds exact matches in structured data
- Use this for conversational queries, use keyword search for specific facts

EMBEDDING GENERATION:
- Automatically generates OpenAI embeddings for your query if OPENAI_API_KEY is configured
- Falls back to mock embeddings for testing if no API key is present
- Compares query embedding against stored memory embeddings using cosine similarity

Args:
  - query (string, required): Natural language search query
  - user_id (string, optional): User UUID to filter results
  - limit (number, optional): Max results. Default: 10, Range: 1-100
  - filters (object, optional): Metadata filters. Examples: {"source": "conversation"}, {"category": "preferences"}
  - threshold (number, optional): Minimum similarity (0.0-1.0). Default: 0.1. Higher = stricter matching
  - response_format (string, optional): 'markdown' (default) or 'json'

Returns:
  - For JSON format: {total, results[], threshold_used, query}
  - For Markdown format: Numbered list with similarity scores, content, metadata
  - Each result includes: memory_text, similarity score, metadata, timestamps

Examples:
  1. Preference query: { query: "What are my meeting preferences?", threshold: 0.3 }
  2. Filtered search: { query: "programming", filters: {"category": "interests"}, limit: 5 }
  3. User-specific: { query: "tools I use", user_id: "uuid-here" }
  4. Strict matching: { query: "dark mode preferences", threshold: 0.5 }

Error Handling:
  - No results: Returns empty array with suggestions
  - Database errors: Returns error with troubleshooting guidance
  - Invalid filters: Returns validation error`,
      inputSchema: SearchMemoriesInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async ({ query, user_id, limit = 10, filters, threshold = 0.1, response_format = 'markdown' }) => {
      try {
        // Use searchMemoriesByText which auto-generates embeddings
        const results = await memoryService.searchMemoriesByText(
          query,
          user_id || null,
          limit,
          filters || null,
          threshold
        );

        if (!results || results.length === 0) {
          const suggestion = "Try:\n- Lowering the similarity threshold\n- Using broader search terms\n- Checking if memories exist with datadam_list_memories\n- Adding more memories with datadam_add_memory";
          return {
            content: [{
              type: "text",
              text: formatErrorMessage(
                `No memories found for query: "${query}"`,
                suggestion,
                response_format
              )
            }]
          };
        }

        // Format response with character limit checking
        const truncationResult = checkAndTruncateMemories(
          results,
          CHARACTER_LIMIT,
          response_format,
          0, // offset is always 0 for search
          {
            total: results.length,
            threshold,
            query
          },
          { isSearchResult: true, showMetadata: true }
        );

        // Add search context to markdown format
        let finalText = truncationResult.text;
        if (response_format === 'markdown' && !truncationResult.wasTruncated) {
          finalText = `Found ${results.length} ${results.length === 1 ? 'memory' : 'memories'} matching "${query}":\n\n${truncationResult.text}`;
        } else if (response_format === 'markdown' && truncationResult.wasTruncated) {
          // Truncation message already included in truncationResult.text
          finalText = `Found ${truncationResult.originalCount} ${truncationResult.originalCount === 1 ? 'memory' : 'memories'} matching "${query}" (showing ${truncationResult.truncatedCount}):\n\n${truncationResult.text}`;
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
              `Error searching memories: ${error instanceof Error ? error.message : 'Unknown error'}`,
              "Verify database connection and ensure memories have embeddings. Check that pgvector extension is enabled.",
              response_format
            )
          }],
          isError: true
        };
      }
    }
  );
}
