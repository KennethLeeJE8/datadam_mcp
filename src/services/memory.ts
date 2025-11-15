// Memory service for semantic memory management
// Integrates with Supabase RPC functions for memory operations

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Memory, MemorySearchResult } from "../types.js";
import { EmbeddingsService } from "./embeddings.js";
import crypto from "crypto";

/**
 * Memory Service
 * Handles semantic memory operations using Supabase RPC functions
 */
export class MemoryService {
  private embeddingsService: EmbeddingsService;

  constructor(
    private supabase: SupabaseClient,
    embeddingsService?: EmbeddingsService
  ) {
    this.embeddingsService = embeddingsService || new EmbeddingsService();
  }

  /**
   * Add a new memory
   * @param memoryText - The memory content
   * @param userId - Optional user ID
   * @param embedding - Optional vector embedding (1536 dimensions). If not provided, will be auto-generated
   * @param metadata - Optional metadata (source, category, tags, etc.)
   * @returns Memory ID
   */
  async addMemory(
    memoryText: string,
    userId?: string | null,
    embedding?: number[] | null,
    metadata: Record<string, any> = {}
  ): Promise<string> {
    // Generate hash for deduplication
    const hash = this.generateHash(memoryText, userId);

    // Auto-generate embedding if not provided
    let finalEmbedding = embedding;
    if (!finalEmbedding) {
      try {
        finalEmbedding = await this.embeddingsService.generateEmbedding(memoryText);
      } catch (error) {
        console.warn('Failed to generate embedding, storing without embedding:', error);
      }
    }

    // Convert embedding array to pgvector format if available
    const embeddingVector = finalEmbedding ? `[${finalEmbedding.join(',')}]` : null;

    const { data, error } = await this.supabase.rpc('add_memory', {
      p_memory_text: memoryText,
      p_user_id: userId || null,
      p_embedding: embeddingVector,
      p_metadata: metadata,
      p_hash: hash
    });

    if (error) {
      throw new Error(`Failed to add memory: ${error.message}`);
    }

    return data as string;
  }

  /**
   * Search memories by text query (auto-generates embedding)
   * @param queryText - Natural language search query
   * @param userId - Optional user ID to filter results
   * @param limit - Maximum number of results
   * @param filters - Optional metadata filters
   * @param threshold - Minimum similarity threshold (0.0 - 1.0)
   * @returns Array of memory search results with similarity scores
   */
  async searchMemoriesByText(
    queryText: string,
    userId?: string | null,
    limit: number = 10,
    filters?: Record<string, any> | null,
    threshold: number = 0.1
  ): Promise<MemorySearchResult[]> {
    // Generate embedding for query
    const queryEmbedding = await this.embeddingsService.generateEmbedding(queryText);

    // Search with generated embedding
    return this.searchMemories(queryEmbedding, userId, limit, filters, threshold);
  }

  /**
   * Search memories by semantic similarity
   * @param queryEmbedding - Query vector embedding (1536 dimensions)
   * @param userId - Optional user ID to filter results
   * @param limit - Maximum number of results
   * @param filters - Optional metadata filters
   * @param threshold - Minimum similarity threshold (0.0 - 1.0)
   * @returns Array of memory search results with similarity scores
   */
  async searchMemories(
    queryEmbedding: number[],
    userId?: string | null,
    limit: number = 10,
    filters?: Record<string, any> | null,
    threshold: number = 0.1
  ): Promise<MemorySearchResult[]> {
    if (queryEmbedding.length !== 1536) {
      throw new Error('Query embedding must be 1536 dimensions');
    }

    // Convert embedding array to pgvector format
    const embeddingVector = `[${queryEmbedding.join(',')}]`;

    const { data, error } = await this.supabase.rpc('search_memories', {
      p_query_embedding: embeddingVector,
      p_user_id: userId || null,
      p_limit: limit,
      p_filters: filters || null,
      p_threshold: threshold
    });

    if (error) {
      throw new Error(`Failed to search memories: ${error.message}`);
    }

    return (data || []) as MemorySearchResult[];
  }

  /**
   * Check if embeddings service is using OpenAI
   */
  isUsingOpenAI(): boolean {
    return this.embeddingsService.isUsingOpenAI();
  }

  /**
   * List all memories for a user
   * @param userId - Optional user ID
   * @param limit - Maximum number of results
   * @param offset - Pagination offset
   * @param filters - Optional metadata filters
   * @param includeDeleted - Include soft-deleted memories
   * @returns Array of memories
   */
  async listMemories(
    userId?: string | null,
    limit: number = 50,
    offset: number = 0,
    filters?: Record<string, any> | null,
    includeDeleted: boolean = false
  ): Promise<Memory[]> {
    const { data, error } = await this.supabase.rpc('list_memories', {
      p_user_id: userId || null,
      p_limit: limit,
      p_offset: offset,
      p_filters: filters || null,
      p_include_deleted: includeDeleted
    });

    if (error) {
      throw new Error(`Failed to list memories: ${error.message}`);
    }

    return (data || []) as Memory[];
  }

  /**
   * Delete a memory
   * @param memoryId - Memory ID to delete
   * @param hardDelete - Permanent deletion if true, soft delete if false
   * @returns Success status
   */
  async deleteMemory(
    memoryId: string,
    hardDelete: boolean = false
  ): Promise<boolean> {
    const { data, error } = await this.supabase.rpc('delete_memory', {
      p_memory_id: memoryId,
      p_hard_delete: hardDelete
    });

    if (error) {
      throw new Error(`Failed to delete memory: ${error.message}`);
    }

    return data as boolean;
  }

  /**
   * Get a single memory by ID
   * @param memoryId - Memory ID
   * @param includeHistory - Include memory history
   * @returns Memory with optional history
   */
  async getMemory(
    memoryId: string,
    includeHistory: boolean = false
  ): Promise<Memory & { history?: any[] }> {
    const { data, error } = await this.supabase.rpc('get_memory', {
      p_memory_id: memoryId,
      p_include_history: includeHistory
    });

    if (error) {
      throw new Error(`Failed to get memory: ${error.message}`);
    }

    if (!data || (Array.isArray(data) && data.length === 0)) {
      throw new Error(`Memory not found: ${memoryId}`);
    }

    // RPC returns array, take first element
    return Array.isArray(data) ? data[0] : data;
  }

  /**
   * Get memory statistics
   * @param userId - Optional user ID
   * @returns Memory statistics
   */
  async getMemoryStats(userId?: string | null): Promise<{
    total_memories: number;
    active_memories: number;
    deleted_memories: number;
    total_history_entries: number;
    memories_with_embeddings: number;
  }> {
    const { data, error } = await this.supabase.rpc('get_memory_stats', {
      p_user_id: userId || null
    });

    if (error) {
      throw new Error(`Failed to get memory stats: ${error.message}`);
    }

    // RPC returns array, take first element
    return Array.isArray(data) ? data[0] : data;
  }

  /**
   * Generate hash for memory deduplication
   * @param memoryText - Memory content
   * @param userId - User ID
   * @returns SHA256 hash
   */
  private generateHash(memoryText: string, userId?: string | null): string {
    const content = `${userId || 'null'}:${memoryText.trim().toLowerCase()}`;
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Helper: Generate mock embedding for testing
   * @param text - Text to generate embedding for
   * @returns Mock 1536-dimensional embedding
   */
  generateMockEmbedding(text: string): number[] {
    // Generate deterministic mock embedding based on text
    const hash = crypto.createHash('sha256').update(text).digest();
    const embedding: number[] = [];

    for (let i = 0; i < 1536; i++) {
      // Use hash bytes to generate consistent values
      const byteIndex = i % hash.length;
      embedding.push((hash[byteIndex] / 255) * 2 - 1); // Normalize to [-1, 1]
    }

    return embedding;
  }
}

/**
 * Initialize memory service with Supabase client
 * @param supabase - Supabase client instance
 * @returns MemoryService instance
 */
export function createMemoryService(supabase: SupabaseClient): MemoryService {
  return new MemoryService(supabase);
}
