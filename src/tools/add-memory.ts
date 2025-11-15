// Add Memory tool

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatSuccessMessage, formatErrorMessage } from "../utils/formatting.js";
import { AddMemoryInputSchema } from "../schemas/index.js";
import { MemoryService } from "../services/memory.js";

export function registerAddMemoryTool(
  server: McpServer,
  supabase: SupabaseClient
): void {
  const memoryService = new MemoryService(supabase);

  server.registerTool(
    "datadam_add_memory",
    {
      title: "Add Semantic Memory",
      description: `Store natural language memories for contextual recall. Automatically generates embeddings for semantic search using OpenAI (or mock embeddings if API key not configured).

WHEN TO USE:
- User shares preferences: "I prefer morning meetings", "I like dark mode"
- Contextual information: "I'm learning TypeScript", "I'm working on a project about AI"
- Inferred insights: "User seems interested in functional programming"
- Conversation context: "We discussed API design patterns"
- Explicit memory requests: "Remember that I use tabs not spaces"

DIFFERENCE FROM STRUCTURED DATA:
- Memories: Conversational, contextual, temporal ("I'm currently learning X")
- Structured Data: Facts, attributes, categories ("Contact: John Smith, email: john@example.com")

EMBEDDING GENERATION:
- Automatically generates OpenAI embeddings if OPENAI_API_KEY is configured
- Falls back to mock embeddings for testing if no API key is present
- Embeddings enable semantic search via datadam_search_memories

Args:
  - memory_text (string, required): Natural language memory content
  - user_id (string, optional): User UUID for multi-user systems
  - metadata (object, optional): Additional context. Common fields:
    * source: "conversation" | "explicit" | "inferred"
    * category: Link to structured category (e.g., "preferences", "interests")
    * tags: Array of tags for organization
    * confidence: 0.0-1.0 score for inferred memories
    * related_data_ids: UUIDs of related structured data
  - response_format (string, optional): 'markdown' (default) or 'json'

Returns:
  - Success message with memory ID and embedding status
  - For JSON format: {success: true, operation: "created", memory_id, message, has_embedding, embedding_type}
  - For Markdown format: "✓ Successfully stored memory: **{memory_text}**"

Examples:
  1. Simple preference: { memory_text: "I prefer dark mode in all applications", metadata: { source: "conversation", category: "preferences" } }
  2. Learning context: { memory_text: "I'm currently learning TypeScript and building an MCP server", metadata: { source: "conversation", tags: ["learning", "typescript", "mcp"] } }
  3. Inferred insight: { memory_text: "User seems to prefer functional programming patterns", metadata: { source: "inferred", confidence: 0.85 } }

Error Handling:
  - Database errors: Returns error with troubleshooting guidance
  - Invalid input: Returns validation error
  - Deduplication: Automatically updates existing memory with same hash
  - Embedding failures: Falls back to storing without embeddings (search will still work with mock embeddings)`,
      inputSchema: AddMemoryInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true, // Due to hash-based deduplication
        openWorldHint: false
      }
    },
    async ({ memory_text, user_id, metadata = {}, response_format = 'markdown' }) => {
      try {
        // Add memory via service (embeddings are auto-generated)
        const memoryId = await memoryService.addMemory(
          memory_text,
          user_id || null,
          null, // Let the service auto-generate embeddings
          {
            ...metadata,
            timestamp: new Date().toISOString()
          }
        );

        const embeddingType = memoryService.isUsingOpenAI() ? 'OpenAI' : 'Mock';

        if (response_format === 'json') {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                success: true,
                operation: "created",
                memory_id: memoryId,
                message: `Successfully stored memory: "${memory_text.substring(0, 50)}${memory_text.length > 50 ? '...' : ''}"`,
                has_embedding: true,
                embedding_type: embeddingType
              }, null, 2)
            }]
          };
        } else {
          const truncatedText = memory_text.length > 100
            ? memory_text.substring(0, 100) + '...'
            : memory_text;

          return {
            content: [{
              type: "text",
              text: `✓ Successfully stored memory: **${truncatedText}**\n\n` +
                   `Memory ID: \`${memoryId}\`\n` +
                   `Embedding: ✓ Generated (${embeddingType})\n` +
                   `Metadata: ${Object.keys(metadata).length > 0 ? JSON.stringify(metadata, null, 2) : 'None'}`
            }]
          };
        }
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: formatErrorMessage(
              `Error adding memory: ${error instanceof Error ? error.message : 'Unknown error'}`,
              "Verify database connection and check Supabase credentials. Ensure pgvector extension is enabled.",
              response_format
            )
          }],
          isError: true
        };
      }
    }
  );
}
