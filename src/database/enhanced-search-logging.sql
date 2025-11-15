-- Enhanced Search Query Logging
-- This adds detailed search analytics beyond the basic data_access_log

-- ========================================
-- 1. Create Search Query Log Table
-- ========================================

DROP TABLE IF EXISTS search_query_log CASCADE;

CREATE TABLE search_query_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Query details
  query_text TEXT,                          -- The actual search query
  query_embedding vector(1536),             -- Optional: store embedding for analysis

  -- User context
  user_id UUID,

  -- Search parameters
  limit_requested INTEGER,
  threshold FLOAT,
  filters JSONB,

  -- Results
  results_count INTEGER,                    -- How many results returned
  result_memory_ids TEXT[],                 -- IDs of returned memories
  top_similarity_scores FLOAT[],            -- Top 5 similarity scores

  -- Performance metrics
  search_duration_ms INTEGER,               -- Time to execute search
  embedding_duration_ms INTEGER,            -- Time to generate query embedding

  -- Cost tracking (optional)
  openai_tokens_used INTEGER,               -- Tokens for embedding generation
  openai_cost_usd DECIMAL(10, 8),          -- Estimated cost

  -- Context
  ip_address INET,
  user_agent TEXT,
  session_id TEXT,                          -- Optional session tracking

  -- Metadata
  metadata JSONB DEFAULT '{}',              -- Additional context
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for analytics
CREATE INDEX idx_search_log_user_id ON search_query_log(user_id);
CREATE INDEX idx_search_log_created_at ON search_query_log(created_at);
CREATE INDEX idx_search_log_query_text ON search_query_log USING gin(to_tsvector('english', query_text));
CREATE INDEX idx_search_log_results_count ON search_query_log(results_count);

-- Optional: Index on embeddings for clustering analysis
CREATE INDEX idx_search_log_embedding ON search_query_log USING ivfflat (query_embedding vector_cosine_ops) WITH (lists = 100);

COMMENT ON TABLE search_query_log IS 'Detailed analytics for search queries including query text, results, and performance metrics';


-- ========================================
-- 2. Update search_memories Function
-- ========================================

DROP FUNCTION IF EXISTS search_memories(vector, UUID, INTEGER, JSONB, FLOAT);

CREATE OR REPLACE FUNCTION search_memories(
  p_query_embedding vector(1536),
  p_user_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 10,
  p_filters JSONB DEFAULT NULL,
  p_threshold FLOAT DEFAULT 0.1,
  p_query_text TEXT DEFAULT NULL,              -- NEW: optional query text
  p_session_id TEXT DEFAULT NULL                -- NEW: optional session ID
)
RETURNS TABLE (
  id TEXT,
  memory_text TEXT,
  metadata JSONB,
  similarity FLOAT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_start_time TIMESTAMPTZ;
  v_end_time TIMESTAMPTZ;
  v_duration_ms INTEGER;
  v_results_count INTEGER;
  v_result_ids TEXT[];
  v_top_scores FLOAT[];
BEGIN
  v_start_time := clock_timestamp();

  -- Execute search and collect results
  CREATE TEMP TABLE temp_search_results AS
  SELECT
    m.id,
    m.memory_text,
    m.metadata,
    1 - (m.embedding <=> p_query_embedding) AS similarity,
    m.created_at,
    m.updated_at
  FROM memories m
  WHERE
    m.deleted_at IS NULL
    AND (p_user_id IS NULL OR m.user_id = p_user_id)
    AND m.embedding IS NOT NULL
    AND (p_filters IS NULL OR m.metadata @> p_filters)
    AND (1 - (m.embedding <=> p_query_embedding)) >= p_threshold
  ORDER BY m.embedding <=> p_query_embedding
  LIMIT p_limit;

  v_end_time := clock_timestamp();
  v_duration_ms := EXTRACT(MILLISECONDS FROM (v_end_time - v_start_time))::INTEGER;

  -- Collect analytics
  SELECT COUNT(*) INTO v_results_count FROM temp_search_results;
  SELECT array_agg(id ORDER BY similarity DESC) INTO v_result_ids FROM temp_search_results;
  SELECT array_agg(similarity ORDER BY similarity DESC) FILTER (WHERE similarity IS NOT NULL)
    INTO v_top_scores FROM (SELECT similarity FROM temp_search_results ORDER BY similarity DESC LIMIT 5) sub;

  -- Log to enhanced search log
  INSERT INTO search_query_log (
    query_text,
    query_embedding,
    user_id,
    limit_requested,
    threshold,
    filters,
    results_count,
    result_memory_ids,
    top_similarity_scores,
    search_duration_ms,
    ip_address,
    user_agent,
    session_id
  ) VALUES (
    p_query_text,
    NULL,  -- Don't store embedding by default (large storage)
    p_user_id,
    p_limit,
    p_threshold,
    p_filters,
    v_results_count,
    v_result_ids,
    v_top_scores,
    v_duration_ms,
    inet_client_addr(),
    'search_memories_function',
    p_session_id
  );

  -- Also log to original audit log for compatibility
  INSERT INTO data_access_log (
    user_id, operation, table_name, record_id,
    changes, ip_address, user_agent
  ) VALUES (
    p_user_id, 'READ', 'memories', NULL,
    jsonb_build_object(
      'operation_type', 'vector_search',
      'query_text', p_query_text,
      'limit', p_limit,
      'filters', p_filters,
      'threshold', p_threshold,
      'results_count', v_results_count,
      'duration_ms', v_duration_ms
    ),
    inet_client_addr(), 'search_memories_function'
  );

  -- Return results
  RETURN QUERY SELECT * FROM temp_search_results;

  DROP TABLE temp_search_results;
END;
$$;


-- ========================================
-- 3. Analytics Views
-- ========================================

-- Popular search queries
CREATE OR REPLACE VIEW popular_search_queries AS
SELECT
  query_text,
  COUNT(*) as query_count,
  AVG(results_count) as avg_results,
  AVG(search_duration_ms) as avg_duration_ms,
  MIN(created_at) as first_searched,
  MAX(created_at) as last_searched
FROM search_query_log
WHERE query_text IS NOT NULL
GROUP BY query_text
ORDER BY query_count DESC;

-- Zero-result searches (queries that found nothing)
CREATE OR REPLACE VIEW zero_result_searches AS
SELECT
  query_text,
  COUNT(*) as zero_result_count,
  MAX(created_at) as last_occurrence
FROM search_query_log
WHERE results_count = 0
  AND query_text IS NOT NULL
GROUP BY query_text
ORDER BY zero_result_count DESC;

-- Search performance metrics
CREATE OR REPLACE VIEW search_performance_stats AS
SELECT
  DATE(created_at) as search_date,
  COUNT(*) as total_searches,
  COUNT(DISTINCT user_id) as unique_users,
  AVG(results_count) as avg_results,
  AVG(search_duration_ms) as avg_duration_ms,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY search_duration_ms) as median_duration_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY search_duration_ms) as p95_duration_ms,
  SUM(CASE WHEN results_count = 0 THEN 1 ELSE 0 END) as zero_result_count
FROM search_query_log
GROUP BY DATE(created_at)
ORDER BY search_date DESC;

-- User search behavior
CREATE OR REPLACE VIEW user_search_behavior AS
SELECT
  user_id,
  COUNT(*) as total_searches,
  COUNT(DISTINCT DATE(created_at)) as active_days,
  AVG(results_count) as avg_results_per_search,
  AVG(threshold) as avg_threshold,
  MIN(created_at) as first_search,
  MAX(created_at) as last_search,
  EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at))) / 86400 as days_active
FROM search_query_log
GROUP BY user_id
ORDER BY total_searches DESC;


-- ========================================
-- 4. Cleanup / Retention Policy (Optional)
-- ========================================

-- Function to clean old search logs (keep last 90 days)
CREATE OR REPLACE FUNCTION cleanup_old_search_logs()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  DELETE FROM search_query_log
  WHERE created_at < NOW() - INTERVAL '90 days';

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count;
END;
$$;

-- Optional: Schedule cleanup (requires pg_cron extension)
-- SELECT cron.schedule('cleanup-search-logs', '0 2 * * 0', 'SELECT cleanup_old_search_logs()');


-- ========================================
-- 5. RLS Policies
-- ========================================

ALTER TABLE search_query_log ENABLE ROW LEVEL SECURITY;

-- Service role can do everything
DROP POLICY IF EXISTS "service_role_full_access_search_log" ON search_query_log;
CREATE POLICY "service_role_full_access_search_log" ON search_query_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Users can view their own search history
DROP POLICY IF EXISTS "users_view_own_searches" ON search_query_log;
CREATE POLICY "users_view_own_searches" ON search_query_log
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Users can insert their own searches
DROP POLICY IF EXISTS "users_insert_own_searches" ON search_query_log;
CREATE POLICY "users_insert_own_searches" ON search_query_log
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);


-- ========================================
-- 6. Sample Queries
-- ========================================

-- Most recent searches
-- SELECT query_text, results_count, search_duration_ms, created_at
-- FROM search_query_log
-- ORDER BY created_at DESC
-- LIMIT 20;

-- Searches with poor results (low similarity scores)
-- SELECT query_text, top_similarity_scores[1] as best_score, results_count
-- FROM search_query_log
-- WHERE results_count > 0 AND top_similarity_scores[1] < 0.5
-- ORDER BY created_at DESC;

-- Slow searches (performance issues)
-- SELECT query_text, search_duration_ms, results_count
-- FROM search_query_log
-- WHERE search_duration_ms > 1000
-- ORDER BY search_duration_ms DESC;
