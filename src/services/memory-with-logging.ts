/**
 * Enhanced Memory Service with Search Query Logging
 *
 * This is an enhanced version of MemoryService that logs query text
 * to the search_query_log table for analytics.
 *
 * To use this version:
 * 1. Run enhanced-search-logging.sql in Supabase
 * 2. Replace imports to use this file instead of memory.ts
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import type { Memory, MemorySearchResult, MemoryHistory } from "../types.js";
import { EmbeddingsService } from "./embeddings.js";

export class MemoryServiceWithLogging {
  private embeddingsService: EmbeddingsService;
  private sessionId: string;

  constructor(
    private supabase: SupabaseClient,
    embeddingsService?: EmbeddingsService
  ) {
    this.embeddingsService = embeddingsService || new EmbeddingsService();
    // Generate session ID for tracking related searches
    this.sessionId = createHash('md5')
      .update(`${Date.now()}-${Math.random()}`)
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Search memories by text query with enhanced logging
   * Logs: query text, results count, performance metrics
   */
  async searchMemoriesByText(
    queryText: string,
    userId?: string | null,
    limit: number = 10,
    filters?: Record<string, any> | null,
    threshold: number = 0.1
  ): Promise<MemorySearchResult[]> {
    const embeddingStart = Date.now();

    // Generate embedding for query
    const queryEmbedding = await this.embeddingsService.generateEmbedding(queryText);

    const embeddingDuration = Date.now() - embeddingStart;

    // Search with logging
    return this.searchMemoriesWithLogging(
      queryEmbedding,
      userId,
      limit,
      filters,
      threshold,
      queryText,        // Pass query text for logging
      embeddingDuration // Pass embedding time for analytics
    );
  }

  /**
   * Search memories with enhanced logging support
   * Now accepts query_text and embedding_duration for logging
   */
  async searchMemoriesWithLogging(
    queryEmbedding: number[],
    userId?: string | null,
    limit: number = 10,
    filters?: Record<string, any> | null,
    threshold: number = 0.1,
    queryText?: string,              // NEW: for logging
    embeddingDurationMs?: number     // NEW: for performance tracking
  ): Promise<MemorySearchResult[]> {
    if (queryEmbedding.length !== 1536) {
      throw new Error('Query embedding must be 1536 dimensions');
    }

    // Convert embedding array to pgvector format
    const embeddingVector = `[${queryEmbedding.join(',')}]`;

    // Call enhanced search function with logging parameters
    const { data, error } = await this.supabase.rpc('search_memories', {
      p_query_embedding: embeddingVector,
      p_user_id: userId || null,
      p_limit: limit,
      p_filters: filters || null,
      p_threshold: threshold,
      p_query_text: queryText || null,         // NEW: logs query text
      p_session_id: this.sessionId             // NEW: tracks session
    });

    if (error) {
      throw new Error(`Failed to search memories: ${error.message}`);
    }

    const results = (data || []) as MemorySearchResult[];

    // Optional: Log to console for development
    if (process.env.NODE_ENV === 'development' && queryText) {
      console.log(`🔍 Search: "${queryText}" → ${results.length} results in ${embeddingDurationMs}ms embedding time`);
    }

    return results;
  }

  /**
   * Get search analytics
   */
  async getSearchAnalytics(
    userId?: string | null,
    days: number = 7
  ): Promise<any> {
    const { data, error } = await this.supabase
      .from('search_query_log')
      .select('*')
      .gte('created_at', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString())
      .eq('user_id', userId || null)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to get search analytics: ${error.message}`);
    }

    return data;
  }

  /**
   * Get popular search queries
   */
  async getPopularQueries(limit: number = 10): Promise<any> {
    const { data, error } = await this.supabase
      .from('popular_search_queries')
      .select('*')
      .limit(limit);

    if (error) {
      throw new Error(`Failed to get popular queries: ${error.message}`);
    }

    return data;
  }

  /**
   * Get zero-result searches (queries that found nothing)
   * Useful for improving search or adding missing memories
   */
  async getZeroResultSearches(limit: number = 10): Promise<any> {
    const { data, error } = await this.supabase
      .from('zero_result_searches')
      .select('*')
      .limit(limit);

    if (error) {
      throw new Error(`Failed to get zero-result searches: ${error.message}`);
    }

    return data;
  }

  /**
   * Get search performance stats
   */
  async getSearchPerformanceStats(days: number = 30): Promise<any> {
    const { data, error } = await this.supabase
      .from('search_performance_stats')
      .select('*')
      .gte('search_date', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString())
      .order('search_date', { ascending: false });

    if (error) {
      throw new Error(`Failed to get performance stats: ${error.message}`);
    }

    return data;
  }

  // Note: All other methods (addMemory, deleteMemory, etc.) would be copied
  // from the original MemoryService class
  // Omitted here for brevity - you would copy them from memory.ts
}
