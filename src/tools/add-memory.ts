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
      description: `Store conversational memories for semantic search. Captures preferences, learning, interests, and conversation context.

Use for:
- Preferences and opinions: "I prefer dark mode", "I like morning meetings"
- Current learning: "I'm learning TypeScript", "I use Docker"
- Conversation context: "We discussed API patterns"
- Temporal states: "I'm working on X project"
- Interests: "I'm interested in functional programming"

Note: For definitive identity facts (name, email, address, job title, contacts), use datadam_create_personal_data instead.

Args:
  - memory_text (string, required): Natural language memory content
  - user_id (string, optional): User UUID for multi-user systems
  - metadata (object, optional): Additional context. Fields: source, category, tags, confidence, related_data_ids
  - response_format (string, optional): 'markdown' (default) or 'json'

Returns:
  - Success message with memory ID
  - For JSON format: {success: true, operation: "created", memory_id, message, has_embedding, embedding_type}
  - For Markdown format: "✓ Successfully stored memory: **{memory_text}**"

Examples:
  1. Learning: { memory_text: "I'm currently learning TypeScript and building an MCP server", metadata: { source: "conversation", tags: ["learning", "typescript"] } }
  2. Preference: { memory_text: "I prefer morning meetings because I'm more productive early", metadata: { source: "explicit", category: "preferences" } }
  3. Context: { memory_text: "We discussed API design patterns and REST experience", metadata: { source: "conversation" } }

Error Handling:
  - Database errors: Returns error with troubleshooting guidance
  - Invalid input: Returns validation error
  - Deduplication: Automatically updates existing memory with same hash`,
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
