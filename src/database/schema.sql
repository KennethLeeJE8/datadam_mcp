-- SUPABASE SETUP INSTRUCTIONS:
--
-- STEP 1: Run this SQL script in your Supabase SQL Editor
--   The following are handled automatically by this script:
--   ✅ Tables creation with constraints and indexes
--   ✅ Row Level Security (RLS) policies
--   ✅ RPC functions for MCP operations
--   ✅ Triggers and helper functions
--   ✅ Sample data insertion
--
-- STEP 2: Supabase URL and Service Role Key
--   Make sure you fill out SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Core user profiles with metadata support
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE,
  full_name TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Flexible personal data storage with dynamic fields
CREATE TABLE IF NOT EXISTS personal_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  title TEXT NOT NULL,
  content JSONB NOT NULL,
  tags TEXT[],
  classification TEXT DEFAULT 'personal' CHECK (classification IN ('public', 'personal', 'sensitive', 'confidential')),
  is_encrypted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_accessed TIMESTAMPTZ DEFAULT NOW()
);

-- Audit trail for compliance and security
CREATE TABLE IF NOT EXISTS data_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  operation TEXT NOT NULL CHECK (operation IN ('CREATE', 'READ', 'UPDATE', 'DELETE')),
  table_name TEXT NOT NULL,
  record_id UUID,
  changes JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Category registry system for dynamic data discovery
CREATE TABLE IF NOT EXISTS category_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_name TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT FALSE,
  item_count INTEGER DEFAULT 0,
  first_activation TIMESTAMPTZ,
  last_modified TIMESTAMPTZ DEFAULT NOW(),
  
  -- Trigger words for AI agents to know when to query this category
  trigger_words TEXT[] DEFAULT '{}',
  
  -- Contextual hints about when to query this category
  query_hint TEXT,
  
  -- Example queries for this category
  example_queries TEXT[] DEFAULT '{}',
  
  -- Minimum items required to activate category (usually 1)
  min_items_for_activation INTEGER DEFAULT 1,
  
  -- JSON field for additional metadata
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add category column to personal_data table
ALTER TABLE personal_data 
ADD COLUMN IF NOT EXISTS category TEXT 
REFERENCES category_registry(category_name);

-- Error logging tables for comprehensive error tracking and monitoring
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Main error logs table
CREATE TABLE IF NOT EXISTS error_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    level VARCHAR(20) NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error', 'critical')),
    message TEXT NOT NULL,
    category VARCHAR(50),
    context JSONB,
    error_details JSONB,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    hostname VARCHAR(255),
    process_id INTEGER,
    correlation_id VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Error alerts table for critical issues requiring immediate attention
CREATE TABLE IF NOT EXISTS error_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    level VARCHAR(20) NOT NULL DEFAULT 'error',
    message TEXT NOT NULL,
    context JSONB,
    timestamp TIMESTAMPTZ NOT NULL,
    correlation_id VARCHAR(255),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'acknowledged', 'resolved', 'suppressed')),
    acknowledged_at TIMESTAMPTZ,
    acknowledged_by VARCHAR(255),
    resolved_at TIMESTAMPTZ,
    resolved_by VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Error monitoring metrics table for tracking patterns and trends
CREATE TABLE IF NOT EXISTS error_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_type VARCHAR(50) NOT NULL,
    metric_name VARCHAR(100) NOT NULL,
    metric_value DECIMAL,
    labels JSONB,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Error recovery attempts table for tracking recovery strategies
CREATE TABLE IF NOT EXISTS error_recovery_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    error_correlation_id VARCHAR(255) NOT NULL,
    recovery_strategy VARCHAR(100) NOT NULL,
    attempt_number INTEGER NOT NULL DEFAULT 1,
    status VARCHAR(20) DEFAULT 'attempted' CHECK (status IN ('attempted', 'succeeded', 'failed', 'skipped')),
    error_details JSONB,
    recovery_context JSONB,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    duration_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Mem0 Integration: Memories table for semantic memory storage
-- Stores conversational memories with vector embeddings for semantic search
CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    user_id UUID,
    memory_text TEXT NOT NULL,
    embedding vector(1536),
    metadata JSONB DEFAULT '{}',
    hash TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,

    -- Metadata fields for filtering and organization
    -- The metadata JSONB can contain:
    -- - category: link to structured data categories
    -- - tags: array of tags for organization
    -- - source: where the memory came from (conversation, explicit, inferred)
    -- - confidence: how confident the system is about this memory
    -- - related_data_ids: UUIDs of related personal_data records
    CONSTRAINT memories_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Memory history table for tracking changes to memories over time
-- Implements audit trail and version control for memories
CREATE TABLE IF NOT EXISTS memory_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    memory_id TEXT NOT NULL,
    previous_value TEXT,
    new_value TEXT,
    action TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ,
    is_deleted INTEGER DEFAULT 0,

    CONSTRAINT memory_history_memory_id_fkey FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE
);

-- Update constraint to include new action types for semantic deduplication
ALTER TABLE memory_history DROP CONSTRAINT IF EXISTS memory_history_action_check;
ALTER TABLE memory_history ADD CONSTRAINT memory_history_action_check
    CHECK (action IN ('ADD', 'UPDATE', 'UPDATE_SEMANTIC', 'UPDATE_HASH', 'DELETE'));

-- Enhanced Search Query Logging Table
-- Detailed analytics for search queries including query text, results, and performance metrics
CREATE TABLE IF NOT EXISTS search_query_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Query details
  query_text TEXT,
  query_embedding vector(1536),

  -- User context
  user_id UUID,

  -- Search parameters
  limit_requested INTEGER,
  threshold FLOAT,
  filters JSONB,

  -- Results
  results_count INTEGER,
  result_memory_ids TEXT[],
  top_similarity_scores FLOAT[],

  -- Performance metrics
  search_duration_ms INTEGER,
  embedding_duration_ms INTEGER,

  -- Cost tracking (optional)
  openai_tokens_used INTEGER,
  openai_cost_usd DECIMAL(10, 8),

  -- Context
  ip_address INET,
  user_agent TEXT,
  session_id TEXT,

  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);
CREATE INDEX IF NOT EXISTS idx_personal_data_user_id ON personal_data(user_id);
CREATE INDEX IF NOT EXISTS idx_personal_data_tags ON personal_data USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_personal_data_content ON personal_data USING GIN(content);
CREATE INDEX IF NOT EXISTS idx_personal_data_classification ON personal_data(classification);
CREATE INDEX IF NOT EXISTS idx_personal_data_deleted_at ON personal_data(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_personal_data_category ON personal_data(category);
CREATE INDEX IF NOT EXISTS idx_access_log_user_operation ON data_access_log(user_id, operation);
CREATE INDEX IF NOT EXISTS idx_access_log_timestamp ON data_access_log(created_at);
CREATE INDEX IF NOT EXISTS idx_access_log_table_name ON data_access_log(table_name);
CREATE INDEX IF NOT EXISTS idx_category_registry_active ON category_registry(is_active);
CREATE INDEX IF NOT EXISTS idx_category_registry_name ON category_registry(category_name);
CREATE INDEX IF NOT EXISTS idx_category_registry_modified ON category_registry(last_modified);
CREATE INDEX IF NOT EXISTS idx_category_registry_trigger_words ON category_registry USING GIN(trigger_words);
CREATE INDEX IF NOT EXISTS idx_error_logs_timestamp ON error_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_level ON error_logs(level);
CREATE INDEX IF NOT EXISTS idx_error_logs_category ON error_logs(category);
CREATE INDEX IF NOT EXISTS idx_error_logs_correlation_id ON error_logs(correlation_id);
CREATE INDEX IF NOT EXISTS idx_error_logs_context_user_id ON error_logs USING GIN ((context->>'userId') gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_error_alerts_status ON error_alerts(status);
CREATE INDEX IF NOT EXISTS idx_error_alerts_timestamp ON error_alerts(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_error_alerts_level ON error_alerts(level);
CREATE INDEX IF NOT EXISTS idx_error_metrics_type_name ON error_metrics(metric_type, metric_name);
CREATE INDEX IF NOT EXISTS idx_error_metrics_timestamp ON error_metrics(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_error_recovery_correlation_id ON error_recovery_attempts(error_correlation_id);
CREATE INDEX IF NOT EXISTS idx_error_recovery_strategy ON error_recovery_attempts(recovery_strategy);
CREATE INDEX IF NOT EXISTS idx_error_recovery_status ON error_recovery_attempts(status);

-- Mem0 memory indexes for efficient querying and vector search
CREATE INDEX IF NOT EXISTS idx_memories_user_id ON memories(user_id);
CREATE INDEX IF NOT EXISTS idx_memories_deleted_at ON memories(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memories_metadata ON memories USING GIN(metadata);
CREATE INDEX IF NOT EXISTS idx_memories_hash ON memories(hash);
CREATE INDEX IF NOT EXISTS idx_memories_embedding ON memories USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_memory_history_memory_id ON memory_history(memory_id);
CREATE INDEX IF NOT EXISTS idx_memory_history_created_at ON memory_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memory_history_action ON memory_history(action);

-- Search query log indexes for analytics
CREATE INDEX IF NOT EXISTS idx_search_log_user_id ON search_query_log(user_id);
CREATE INDEX IF NOT EXISTS idx_search_log_created_at ON search_query_log(created_at);
CREATE INDEX IF NOT EXISTS idx_search_log_query_text ON search_query_log USING gin(to_tsvector('english', query_text));
CREATE INDEX IF NOT EXISTS idx_search_log_results_count ON search_query_log(results_count);
CREATE INDEX IF NOT EXISTS idx_search_log_embedding ON search_query_log USING ivfflat (query_embedding vector_cosine_ops) WITH (lists = 100);

-- Row Level Security Policies
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_access_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE category_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE error_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE error_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE error_recovery_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_history ENABLE ROW LEVEL SECURITY;

-- Allow service role to bypass RLS for admin operations
DROP POLICY IF EXISTS "service_role_full_access_profiles" ON profiles;
CREATE POLICY "service_role_full_access_profiles" ON profiles
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_full_access_personal_data" ON personal_data;
CREATE POLICY "service_role_full_access_personal_data" ON personal_data
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_full_access_audit_log" ON data_access_log;
CREATE POLICY "service_role_full_access_audit_log" ON data_access_log
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_full_access_error_logs" ON error_logs;
CREATE POLICY "service_role_full_access_error_logs" ON error_logs
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_full_access_error_alerts" ON error_alerts;
CREATE POLICY "service_role_full_access_error_alerts" ON error_alerts
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_full_access_error_metrics" ON error_metrics;
CREATE POLICY "service_role_full_access_error_metrics" ON error_metrics
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_full_access_error_recovery_attempts" ON error_recovery_attempts;
CREATE POLICY "service_role_full_access_error_recovery_attempts" ON error_recovery_attempts
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_full_access_category_registry" ON category_registry;
CREATE POLICY "service_role_full_access_category_registry" ON category_registry
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_full_access_memories" ON memories;
CREATE POLICY "service_role_full_access_memories" ON memories
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_full_access_memory_history" ON memory_history;
CREATE POLICY "service_role_full_access_memory_history" ON memory_history
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Profiles policies
-- Note: These policies assume auth.uid() matches user_id

DROP POLICY IF EXISTS "users_can_view_own_profile" ON profiles;
CREATE POLICY "users_can_view_own_profile" ON profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_can_update_own_profile" ON profiles;
CREATE POLICY "users_can_update_own_profile" ON profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_can_insert_own_profile" ON profiles;
CREATE POLICY "users_can_insert_own_profile" ON profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Personal data policies
DROP POLICY IF EXISTS "users_can_crud_own_data" ON personal_data;
CREATE POLICY "users_can_crud_own_data" ON personal_data
  FOR ALL TO authenticated
  USING (user_id = auth.uid());

-- Audit log policies
DROP POLICY IF EXISTS "users_can_view_own_logs" ON data_access_log;
CREATE POLICY "users_can_view_own_logs" ON data_access_log
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "users_can_insert_audit_logs" ON data_access_log;
CREATE POLICY "users_can_insert_audit_logs" ON data_access_log
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Category registry policies
DROP POLICY IF EXISTS "users_can_read_categories" ON category_registry;
CREATE POLICY "users_can_read_categories" ON category_registry
  FOR SELECT TO authenticated
  USING (true);

-- Memory policies
DROP POLICY IF EXISTS "users_can_crud_own_memories" ON memories;
CREATE POLICY "users_can_crud_own_memories" ON memories
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR user_id IS NULL);

DROP POLICY IF EXISTS "users_can_view_own_memory_history" ON memory_history;
CREATE POLICY "users_can_view_own_memory_history" ON memory_history
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memories m
      WHERE m.id = memory_history.memory_id
      AND (m.user_id = auth.uid() OR m.user_id IS NULL)
    )
  );

DROP POLICY IF EXISTS "users_can_insert_memory_history" ON memory_history;
CREATE POLICY "users_can_insert_memory_history" ON memory_history
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Create triggers for updating timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_personal_data_updated_at ON personal_data;
CREATE TRIGGER update_personal_data_updated_at
    BEFORE UPDATE ON personal_data
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_memories_updated_at ON memories;
CREATE TRIGGER update_memories_updated_at
    BEFORE UPDATE ON memories
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();

-- Drop old data_type function if it exists
DROP FUNCTION IF EXISTS get_data_type_stats();

-- Note: All functions have been moved to their appropriate sections after table creation

-- Note: search_personal_data function is defined in 002_mcp_functions.sql section below
-- This duplicate definition has been removed to avoid conflicts

-- RPC function for bulk operations on personal data
CREATE OR REPLACE FUNCTION bulk_update_personal_data_tags(
  p_user_id UUID,
  p_record_ids UUID[],
  p_tags_to_add TEXT[] DEFAULT NULL,
  p_tags_to_remove TEXT[] DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER := 0;
  record_id UUID;
BEGIN
  FOREACH record_id IN ARRAY p_record_ids
  LOOP
    UPDATE personal_data 
    SET 
      tags = CASE 
        WHEN p_tags_to_add IS NOT NULL THEN 
          array(SELECT DISTINCT unnest(tags || p_tags_to_add))
        ELSE tags
      END,
      tags = CASE
        WHEN p_tags_to_remove IS NOT NULL THEN
          array(SELECT unnest(tags) EXCEPT SELECT unnest(p_tags_to_remove))
        ELSE tags
      END,
      updated_at = NOW()
    WHERE id = record_id AND user_id = p_user_id AND deleted_at IS NULL;
    
    IF FOUND THEN
      updated_count := updated_count + 1;
    END IF;
  END LOOP;
  
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC function for soft delete with audit trail
CREATE OR REPLACE FUNCTION soft_delete_personal_data(
  p_user_id UUID,
  p_record_id UUID,
  p_deletion_reason TEXT DEFAULT 'User requested deletion'
)
RETURNS BOOLEAN AS $$
DECLARE
  record_exists BOOLEAN := FALSE;
BEGIN
  -- Check if record exists and belongs to user
  SELECT EXISTS(
    SELECT 1 FROM personal_data 
    WHERE id = p_record_id AND user_id = p_user_id AND deleted_at IS NULL
  ) INTO record_exists;
  
  IF NOT record_exists THEN
    RETURN FALSE;
  END IF;
  
  -- Soft delete the record
  UPDATE personal_data 
  SET 
    deleted_at = NOW(),
    content = jsonb_set(
      content, 
      '{deletion_metadata}', 
      jsonb_build_object(
        'deleted_at', NOW(),
        'reason', p_deletion_reason
      )
    )
  WHERE id = p_record_id AND user_id = p_user_id;
  
  -- Log the deletion
  INSERT INTO data_access_log (
    user_id, operation, table_name, record_id, 
    changes, ip_address, user_agent
  ) VALUES (
    p_user_id, 'DELETE', 'personal_data', p_record_id,
    jsonb_build_object('reason', p_deletion_reason),
    inet_client_addr(), 'soft_delete_function'
  );
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC function for GDPR-compliant hard delete
CREATE OR REPLACE FUNCTION hard_delete_user_data(
  p_user_id UUID,
  p_confirmation_token TEXT
)
RETURNS JSONB AS $$
DECLARE
  deleted_counts JSONB;
  profile_count INTEGER;
  personal_data_count INTEGER;
  audit_log_count INTEGER;
BEGIN
  -- Simple confirmation check (in production, this should be more robust)
  IF p_confirmation_token != 'CONFIRM_HARD_DELETE_' || p_user_id::text THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid confirmation token'
    );
  END IF;
  
  -- Count records before deletion
  SELECT COUNT(*) INTO profile_count FROM profiles WHERE user_id = p_user_id;
  SELECT COUNT(*) INTO personal_data_count FROM personal_data WHERE user_id = p_user_id;
  SELECT COUNT(*) INTO audit_log_count FROM data_access_log WHERE user_id = p_user_id;
  
  -- Delete all user data
  DELETE FROM data_access_log WHERE user_id = p_user_id;
  DELETE FROM personal_data WHERE user_id = p_user_id;
  DELETE FROM profiles WHERE user_id = p_user_id;
  
  -- Return deletion summary
  RETURN jsonb_build_object(
    'success', true,
    'deleted_counts', jsonb_build_object(
      'profiles', profile_count,
      'personal_data', personal_data_count,
      'audit_logs', audit_log_count
    ),
    'deleted_at', NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC function for data export (GDPR compliance)
CREATE OR REPLACE FUNCTION export_user_data(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'export_timestamp', NOW(),
    'user_id', p_user_id,
    'profiles', (
      SELECT jsonb_agg(to_jsonb(p.*))
      FROM profiles p
      WHERE p.user_id = p_user_id
    ),
    'personal_data', (
      SELECT jsonb_agg(to_jsonb(pd.*))
      FROM personal_data pd
      WHERE pd.user_id = p_user_id AND pd.deleted_at IS NULL
    ),
    'audit_logs', (
      SELECT jsonb_agg(to_jsonb(al.*))
      FROM data_access_log al
      WHERE al.user_id = p_user_id
    )
  ) INTO result;
  
  -- Log the export operation
  INSERT INTO data_access_log (
    user_id, operation, table_name, changes, ip_address, user_agent
  ) VALUES (
    p_user_id, 'READ', 'data_export', 
    jsonb_build_object('export_type', 'full_user_data'),
    inet_client_addr(), 'export_function'
  );
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Create function to get category statistics (replaced data_type with categories)
CREATE OR REPLACE FUNCTION get_category_distribution_stats()
RETURNS TABLE (
  classification TEXT,
  record_count BIGINT,
  avg_size NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pd.classification,
    COUNT(*) as record_count,
    AVG(octet_length(pd.content::text)) as avg_size
  FROM personal_data pd
  WHERE pd.deleted_at IS NULL
  GROUP BY pd.classification
  ORDER BY record_count DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- <<< END schema.sql

-- >>> BEGIN 002_mcp_functions.sql

-- MCP Server Functions for Personal Data Management
-- These functions provide the core CRUD operations for personal data

-- Drop existing functions first (drop by name to handle signature changes)
DROP FUNCTION IF EXISTS search_personal_data CASCADE;
DROP FUNCTION IF EXISTS extract_personal_data CASCADE;
DROP FUNCTION IF EXISTS create_personal_data CASCADE;
DROP FUNCTION IF EXISTS update_personal_data CASCADE;
DROP FUNCTION IF EXISTS delete_personal_data CASCADE;

-- Function to search personal data by text and filters
CREATE OR REPLACE FUNCTION search_personal_data(
  p_search_text TEXT,
  p_user_id UUID DEFAULT NULL,
  p_categories TEXT[] DEFAULT NULL,
  p_tags TEXT[] DEFAULT NULL,
  p_classification TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  title TEXT,
  content JSONB,
  tags TEXT[],
  category TEXT,
  classification TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result_count INTEGER;
BEGIN
  -- Log the search operation
  INSERT INTO data_access_log (
    user_id, operation, table_name, record_id,
    changes, ip_address, user_agent
  ) VALUES (
    p_user_id, 'READ', 'personal_data', NULL,
    jsonb_build_object(
      'operation_type', 'search',
      'search_text', p_search_text,
      'categories', p_categories,
      'tags', p_tags,
      'classification', p_classification,
      'limit', p_limit,
      'offset', p_offset
    ),
    inet_client_addr(), 'search_personal_data_function'
  );

  RETURN QUERY
  SELECT 
    pd.id,
    pd.user_id,
    pd.title,
    pd.content,
    pd.tags,
    pd.category,
    pd.classification,
    pd.created_at,
    pd.updated_at
  FROM personal_data pd
  WHERE 
    pd.deleted_at IS NULL
    AND (p_user_id IS NULL OR pd.user_id = p_user_id)
    AND (
      p_search_text IS NULL OR
      pd.title ILIKE '%' || p_search_text || '%' OR
      pd.content::TEXT ILIKE '%' || p_search_text || '%'
    )
    AND (p_categories IS NULL OR pd.category = ANY(p_categories))
    AND (p_tags IS NULL OR pd.tags && p_tags)
    AND (p_classification IS NULL OR pd.classification = p_classification)
  ORDER BY pd.updated_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Function to extract personal data by category with optional tags
CREATE OR REPLACE FUNCTION extract_personal_data(
  p_category TEXT,
  p_tags TEXT[] DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_filters JSONB DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  title TEXT,
  content JSONB,
  tags TEXT[],
  category TEXT,
  classification TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Log the extract operation
  INSERT INTO data_access_log (
    user_id, operation, table_name, record_id,
    changes, ip_address, user_agent
  ) VALUES (
    p_user_id, 'READ', 'personal_data', NULL,
    jsonb_build_object(
      'operation_type', 'extract',
      'category', p_category,
      'tags', p_tags,
      'filters', p_filters,
      'limit', p_limit,
      'offset', p_offset
    ),
    inet_client_addr(), 'extract_personal_data_function'
  );

  RETURN QUERY
  SELECT 
    pd.id,
    pd.user_id,
    pd.title,
    pd.content,
    pd.tags,
    pd.category,
    pd.classification,
    pd.created_at,
    pd.updated_at
  FROM personal_data pd
  WHERE 
    pd.deleted_at IS NULL
    AND (p_user_id IS NULL OR pd.user_id = p_user_id)
    AND pd.category = p_category
    AND (p_tags IS NULL OR pd.tags && p_tags)
  ORDER BY pd.updated_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Function to create new personal data record
CREATE OR REPLACE FUNCTION create_personal_data(
  p_category TEXT,
  p_title TEXT,
  p_content JSONB,
  p_user_id UUID DEFAULT NULL,
  p_tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  p_classification TEXT DEFAULT 'personal'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_id UUID;
BEGIN
  INSERT INTO personal_data (
    user_id,
    category,
    title,
    content,
    tags,
    classification
  ) VALUES (
    p_user_id,
    p_category,
    p_title,
    p_content,
    p_tags,
    p_classification
  ) RETURNING id INTO new_id;

  -- Log the creation
  INSERT INTO data_access_log (
    user_id, operation, table_name, record_id,
    changes, ip_address, user_agent
  ) VALUES (
    p_user_id, 'CREATE', 'personal_data', new_id,
    jsonb_build_object(
      'category', p_category,
      'title', p_title,
      'content', p_content,
      'tags', p_tags,
      'classification', p_classification
    ),
    inet_client_addr(), 'create_personal_data_function'
  );

  RETURN new_id;
END;
$$;

-- Function to update personal data record
CREATE OR REPLACE FUNCTION update_personal_data(
  p_record_id UUID,
  p_updates JSONB,
  p_conversation_context TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  update_count INTEGER;
  old_record personal_data%ROWTYPE;
  new_title TEXT;
  new_content JSONB;
  new_tags TEXT[];
  new_classification TEXT;
  new_category TEXT;
BEGIN
  -- Get the current record for logging
  SELECT * INTO old_record FROM personal_data WHERE id = p_record_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Extract update values with proper null handling
  new_title := CASE
    WHEN p_updates ? 'title' THEN (p_updates->>'title')::TEXT
    ELSE old_record.title
  END;

  new_content := CASE
    WHEN p_updates ? 'content' THEN (p_updates->'content')::JSONB
    ELSE old_record.content
  END;

  -- Fix tags handling: preserve existing if not provided, replace if provided
  new_tags := CASE
    WHEN p_updates ? 'tags' AND p_updates->'tags' IS NOT NULL THEN
      (SELECT ARRAY(SELECT jsonb_array_elements_text(p_updates->'tags')))
    ELSE old_record.tags
  END;

  new_classification := CASE
    WHEN p_updates ? 'classification' THEN (p_updates->>'classification')::TEXT
    ELSE old_record.classification
  END;

  new_category := CASE
    WHEN p_updates ? 'category' THEN (p_updates->>'category')::TEXT
    ELSE old_record.category
  END;

  -- Perform the update with explicit values
  UPDATE personal_data
  SET
    title = new_title,
    content = new_content,
    tags = new_tags,
    classification = new_classification,
    category = new_category,
    updated_at = NOW(),
    last_accessed = NOW()
  WHERE id = p_record_id
    AND deleted_at IS NULL;

  GET DIAGNOSTICS update_count = ROW_COUNT;

  -- Log the update
  IF update_count > 0 THEN
    INSERT INTO data_access_log (
      user_id, operation, table_name, record_id,
      changes, ip_address, user_agent
    ) VALUES (
      old_record.user_id, 'UPDATE', 'personal_data', p_record_id,
      jsonb_build_object(
        'updates', p_updates,
        'conversation_context', p_conversation_context,
        'old_values', jsonb_build_object(
          'title', old_record.title,
          'content', old_record.content,
          'tags', old_record.tags,
          'classification', old_record.classification,
          'category', old_record.category
        )
      ),
      inet_client_addr(), 'update_personal_data_function'
    );
  END IF;

  RETURN update_count > 0;
END;
$$;

-- Function to delete personal data records
CREATE OR REPLACE FUNCTION delete_personal_data(
  p_record_ids UUID[],
  p_hard_delete BOOLEAN DEFAULT FALSE
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  affected_count INTEGER := 0;
  record_id UUID;
  old_record personal_data%ROWTYPE;
BEGIN
  FOREACH record_id IN ARRAY p_record_ids
  LOOP
    -- Get the current record for logging
    SELECT * INTO old_record FROM personal_data 
    WHERE id = record_id AND (p_hard_delete = TRUE OR deleted_at IS NULL);

    IF FOUND THEN
      IF p_hard_delete THEN
        -- Permanent deletion
        DELETE FROM personal_data WHERE id = record_id;
      ELSE
        -- Soft deletion
        UPDATE personal_data 
        SET deleted_at = NOW()
        WHERE id = record_id AND deleted_at IS NULL;
      END IF;

      -- Log the deletion
      INSERT INTO data_access_log (
        user_id, operation, table_name, record_id,
        changes, ip_address, user_agent
      ) VALUES (
        old_record.user_id, 
        'DELETE',
        'personal_data', 
        record_id,
        jsonb_build_object(
          'delete_type', CASE WHEN p_hard_delete THEN 'hard' ELSE 'soft' END,
          'hard_delete', p_hard_delete,
          'deleted_record', row_to_json(old_record)
        ),
        inet_client_addr(), 'delete_personal_data_function'
      );

      affected_count := affected_count + 1;
    END IF;
  END LOOP;

  RETURN affected_count;
END;
$$;

-- Grant permissions to service role
GRANT EXECUTE ON FUNCTION search_personal_data(TEXT, UUID, TEXT[], TEXT[], TEXT, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION extract_personal_data(TEXT, TEXT[], UUID, JSONB, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION create_personal_data(TEXT, TEXT, JSONB, UUID, TEXT[], TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION update_personal_data(UUID, JSONB, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION delete_personal_data(UUID[], BOOLEAN) TO service_role;

-- Grant permissions to authenticated users
GRANT EXECUTE ON FUNCTION search_personal_data(TEXT, UUID, TEXT[], TEXT[], TEXT, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION extract_personal_data(TEXT, TEXT[], UUID, JSONB, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION create_personal_data(TEXT, TEXT, JSONB, UUID, TEXT[], TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION update_personal_data(UUID, JSONB, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_personal_data(UUID[], BOOLEAN) TO authenticated;

-- <<< END 002_mcp_functions.sql

-- >>> BEGIN 002b_memory_functions.sql

-- Mem0 Memory Management Functions
-- These functions provide CRUD operations for semantic memories with vector embeddings

-- Drop existing memory functions first
-- Drop existing memory functions for idempotent schema application
DROP FUNCTION IF EXISTS add_memory(TEXT, UUID, vector(1536), JSONB, TEXT, FLOAT);
DROP FUNCTION IF EXISTS add_memory CASCADE;
DROP FUNCTION IF EXISTS search_memories(vector(1536), UUID, INTEGER, JSONB, FLOAT, TEXT);
DROP FUNCTION IF EXISTS search_memories(vector(1536), UUID, INTEGER, JSONB, FLOAT, TEXT, TEXT);
DROP FUNCTION IF EXISTS search_memories CASCADE;
DROP FUNCTION IF EXISTS list_memories CASCADE;
DROP FUNCTION IF EXISTS delete_memory CASCADE;
DROP FUNCTION IF EXISTS get_memory CASCADE;
DROP FUNCTION IF EXISTS get_memory_stats CASCADE;
DROP FUNCTION IF EXISTS update_memory(TEXT, TEXT, vector(1536), JSONB, BOOLEAN);
DROP FUNCTION IF EXISTS update_memory CASCADE;

-- Function to add a new memory with vector embedding
-- This function stores natural language memories and tracks them in history
CREATE OR REPLACE FUNCTION add_memory(
  p_memory_text TEXT,
  p_user_id UUID DEFAULT NULL,
  p_embedding vector(1536) DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::JSONB,
  p_hash TEXT DEFAULT NULL,
  p_semantic_dedup_threshold FLOAT DEFAULT 0.95
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_memory_id TEXT;
  existing_memory_id TEXT;
  semantic_duplicate RECORD;
  similarity_threshold FLOAT;
BEGIN
  -- Step 1: Semantic deduplication (mem0 approach)
  -- If embedding provided, check for semantically similar memories
  IF p_embedding IS NOT NULL THEN
    -- Search for very similar memories (high similarity = likely duplicate)
    SELECT
      id,
      memory_text,
      1 - (embedding <=> p_embedding) AS similarity
    INTO semantic_duplicate
    FROM memories
    WHERE
      deleted_at IS NULL
      AND (p_user_id IS NULL OR user_id = p_user_id)
      AND embedding IS NOT NULL
      AND (1 - (embedding <=> p_embedding)) >= p_semantic_dedup_threshold
    ORDER BY embedding <=> p_embedding
    LIMIT 1;

    -- If very similar memory found, update it instead of creating new (mem0 behavior)
    IF semantic_duplicate.id IS NOT NULL THEN
      UPDATE memories
      SET
        memory_text = p_memory_text,
        embedding = p_embedding,
        metadata = p_metadata,
        hash = p_hash,
        updated_at = NOW()
      WHERE id = semantic_duplicate.id;

      -- Log the semantic update in history
      INSERT INTO memory_history (
        memory_id, previous_value, new_value, action, metadata
      ) VALUES (
        semantic_duplicate.id,
        semantic_duplicate.memory_text,
        p_memory_text,
        'UPDATE_SEMANTIC',
        jsonb_build_object(
          'similarity', semantic_duplicate.similarity,
          'dedup_method', 'semantic',
          'metadata', p_metadata
        )
      );

      RETURN semantic_duplicate.id;
    END IF;
  END IF;

  -- Step 2: Hash-based deduplication (exact match fallback)
  IF p_hash IS NOT NULL THEN
    SELECT id INTO existing_memory_id
    FROM memories
    WHERE hash = p_hash
      AND user_id = p_user_id
      AND deleted_at IS NULL
    LIMIT 1;

    IF existing_memory_id IS NOT NULL THEN
      -- Update existing memory instead of creating duplicate
      UPDATE memories
      SET
        memory_text = p_memory_text,
        embedding = COALESCE(p_embedding, embedding),
        metadata = p_metadata,
        updated_at = NOW()
      WHERE id = existing_memory_id;

      -- Log the hash-based update in history
      INSERT INTO memory_history (
        memory_id, previous_value, new_value, action, metadata
      ) VALUES (
        existing_memory_id, NULL, p_memory_text, 'UPDATE_HASH', p_metadata
      );

      RETURN existing_memory_id;
    END IF;
  END IF;

  -- Create new memory
  INSERT INTO memories (
    user_id,
    memory_text,
    embedding,
    metadata,
    hash
  ) VALUES (
    p_user_id,
    p_memory_text,
    p_embedding,
    p_metadata,
    p_hash
  ) RETURNING id INTO new_memory_id;

  -- Log the creation in history
  INSERT INTO memory_history (
    memory_id, previous_value, new_value, action, metadata
  ) VALUES (
    new_memory_id, NULL, p_memory_text, 'ADD', p_metadata
  );

  -- Log the operation in data access log
  INSERT INTO data_access_log (
    user_id, operation, table_name, record_id,
    changes, ip_address, user_agent
  ) VALUES (
    p_user_id, 'CREATE', 'memories', NULL,
    jsonb_build_object(
      'memory_id', new_memory_id,
      'memory_text', p_memory_text,
      'metadata', p_metadata,
      'has_embedding', p_embedding IS NOT NULL
    ),
    inet_client_addr(), 'add_memory_function'
  );

  RETURN new_memory_id;
END;
$$;

-- Function to update an existing memory by ID
-- Supports updating text, embedding, and metadata (merge or replace)
CREATE OR REPLACE FUNCTION update_memory(
  p_memory_id TEXT,
  p_memory_text TEXT DEFAULT NULL,
  p_embedding vector(1536) DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL,
  p_metadata_merge BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_memory RECORD;
  new_metadata JSONB;
  new_hash TEXT;
BEGIN
  -- Get current memory
  SELECT * INTO current_memory
  FROM memories
  WHERE id = p_memory_id
    AND deleted_at IS NULL;

  IF current_memory IS NULL THEN
    RAISE EXCEPTION 'Memory not found or deleted: %', p_memory_id;
  END IF;

  -- Calculate new hash if text is changing
  IF p_memory_text IS NOT NULL THEN
    new_hash := md5(p_memory_text || COALESCE(current_memory.user_id::TEXT, ''));
  ELSE
    new_hash := current_memory.hash;
  END IF;

  -- Handle metadata merge or replace
  IF p_metadata IS NOT NULL THEN
    IF p_metadata_merge THEN
      new_metadata := current_memory.metadata || p_metadata;
    ELSE
      new_metadata := p_metadata;
    END IF;
  ELSE
    new_metadata := current_memory.metadata;
  END IF;

  -- Update the memory
  UPDATE memories
  SET
    memory_text = COALESCE(p_memory_text, memory_text),
    embedding = COALESCE(p_embedding, embedding),
    metadata = new_metadata,
    hash = new_hash,
    updated_at = NOW()
  WHERE id = p_memory_id;

  -- Log in history
  INSERT INTO memory_history (
    memory_id,
    previous_value,
    new_value,
    action,
    metadata
  ) VALUES (
    p_memory_id,
    current_memory.memory_text,
    COALESCE(p_memory_text, current_memory.memory_text),
    'UPDATE',
    new_metadata
  );

  -- Log in data access log
  INSERT INTO data_access_log (
    user_id, operation, table_name, record_id,
    changes, ip_address, user_agent
  ) VALUES (
    current_memory.user_id, 'UPDATE', 'memories', NULL,
    jsonb_build_object(
      'memory_id', p_memory_id,
      'text_changed', p_memory_text IS NOT NULL,
      'embedding_changed', p_embedding IS NOT NULL,
      'metadata_changed', p_metadata IS NOT NULL
    ),
    inet_client_addr(), 'update_memory_function'
  );

  RETURN jsonb_build_object(
    'memory_id', p_memory_id,
    'updated', true,
    'action', 'UPDATE'
  );
END;
$$;

-- Function to search memories using vector similarity with enhanced logging
-- Returns memories ranked by semantic similarity to the query embedding
CREATE OR REPLACE FUNCTION search_memories(
  p_query_embedding vector(1536),
  p_user_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 10,
  p_filters JSONB DEFAULT NULL,
  p_threshold FLOAT DEFAULT 0.1,
  p_query_text TEXT DEFAULT NULL,
  p_session_id TEXT DEFAULT NULL
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

-- Function to list all memories for a user with pagination
-- Supports filtering by metadata and returns results ordered by creation time
CREATE OR REPLACE FUNCTION list_memories(
  p_user_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0,
  p_filters JSONB DEFAULT NULL,
  p_include_deleted BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  id TEXT,
  memory_text TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Log the list operation
  INSERT INTO data_access_log (
    user_id, operation, table_name, record_id,
    changes, ip_address, user_agent
  ) VALUES (
    p_user_id, 'READ', 'memories', NULL,
    jsonb_build_object(
      'operation_type', 'list',
      'limit', p_limit,
      'offset', p_offset,
      'filters', p_filters,
      'include_deleted', p_include_deleted
    ),
    inet_client_addr(), 'list_memories_function'
  );

  RETURN QUERY
  SELECT
    m.id,
    m.memory_text,
    m.metadata,
    m.created_at,
    m.updated_at,
    m.deleted_at
  FROM memories m
  WHERE
    (p_user_id IS NULL OR m.user_id = p_user_id)
    AND (p_include_deleted OR m.deleted_at IS NULL)
    AND (p_filters IS NULL OR m.metadata @> p_filters)
  ORDER BY m.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Function to delete memory (soft delete by default, hard delete optional)
-- Supports both single and bulk deletion with history tracking
CREATE OR REPLACE FUNCTION delete_memory(
  p_memory_id TEXT,
  p_hard_delete BOOLEAN DEFAULT FALSE
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  old_memory memories%ROWTYPE;
  delete_count INTEGER;
BEGIN
  -- Get the current memory for logging
  SELECT * INTO old_memory FROM memories
  WHERE id = p_memory_id
    AND (p_hard_delete = TRUE OR deleted_at IS NULL);

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF p_hard_delete THEN
    -- Permanent deletion
    DELETE FROM memories WHERE id = p_memory_id;

    -- Mark history as deleted
    UPDATE memory_history
    SET is_deleted = 1, updated_at = NOW()
    WHERE memory_id = p_memory_id;
  ELSE
    -- Soft deletion
    UPDATE memories
    SET deleted_at = NOW()
    WHERE id = p_memory_id AND deleted_at IS NULL;

    -- Log the soft deletion in history
    INSERT INTO memory_history (
      memory_id, previous_value, new_value, action, metadata
    ) VALUES (
      p_memory_id, old_memory.memory_text, NULL, 'DELETE',
      jsonb_build_object('delete_type', 'soft')
    );
  END IF;

  -- Log the deletion in data access log
  INSERT INTO data_access_log (
    user_id, operation, table_name, record_id,
    changes, ip_address, user_agent
  ) VALUES (
    old_memory.user_id, 'DELETE', 'memories', NULL,
    jsonb_build_object(
      'memory_id', p_memory_id,
      'delete_type', CASE WHEN p_hard_delete THEN 'hard' ELSE 'soft' END,
      'memory_text', old_memory.memory_text,
      'metadata', old_memory.metadata
    ),
    inet_client_addr(), 'delete_memory_function'
  );

  RETURN TRUE;
END;
$$;

-- Function to get a single memory by ID
-- Returns complete memory details including history
CREATE OR REPLACE FUNCTION get_memory(
  p_memory_id TEXT,
  p_include_history BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  id TEXT,
  memory_text TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  history JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.memory_text,
    m.metadata,
    m.created_at,
    m.updated_at,
    m.deleted_at,
    CASE
      WHEN p_include_history THEN
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'action', mh.action,
              'previous_value', mh.previous_value,
              'new_value', mh.new_value,
              'metadata', mh.metadata,
              'created_at', mh.created_at
            ) ORDER BY mh.created_at DESC
          )
          FROM memory_history mh
          WHERE mh.memory_id = m.id
        )
      ELSE NULL
    END as history
  FROM memories m
  WHERE m.id = p_memory_id;
END;
$$;

-- Function to get memory statistics
CREATE OR REPLACE FUNCTION get_memory_stats(
  p_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
  total_memories INTEGER,
  active_memories INTEGER,
  deleted_memories INTEGER,
  total_history_entries INTEGER,
  memories_with_embeddings INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::INTEGER as total_memories,
    COUNT(*) FILTER (WHERE deleted_at IS NULL)::INTEGER as active_memories,
    COUNT(*) FILTER (WHERE deleted_at IS NOT NULL)::INTEGER as deleted_memories,
    (SELECT COUNT(*)::INTEGER
     FROM memory_history mh
     WHERE mh.memory_id IN (
       SELECT m.id
       FROM memories m
       WHERE p_user_id IS NULL OR m.user_id = p_user_id
     )
    ) as total_history_entries,
    COUNT(*) FILTER (WHERE embedding IS NOT NULL AND deleted_at IS NULL)::INTEGER as memories_with_embeddings
  FROM memories
  WHERE p_user_id IS NULL OR user_id = p_user_id;
END;
$$;

-- Grant permissions to service role
GRANT EXECUTE ON FUNCTION add_memory(TEXT, UUID, vector(1536), JSONB, TEXT, FLOAT) TO service_role;
GRANT EXECUTE ON FUNCTION update_memory(TEXT, TEXT, vector(1536), JSONB, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION search_memories(vector(1536), UUID, INTEGER, JSONB, FLOAT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION list_memories(UUID, INTEGER, INTEGER, JSONB, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION delete_memory(TEXT, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION get_memory(TEXT, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION get_memory_stats(UUID) TO service_role;

-- Grant permissions to authenticated users
GRANT EXECUTE ON FUNCTION add_memory(TEXT, UUID, vector(1536), JSONB, TEXT, FLOAT) TO authenticated;
GRANT EXECUTE ON FUNCTION update_memory(TEXT, TEXT, vector(1536), JSONB, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION search_memories(vector(1536), UUID, INTEGER, JSONB, FLOAT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION list_memories(UUID, INTEGER, INTEGER, JSONB, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_memory(TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION get_memory(TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION get_memory_stats(UUID) TO authenticated;

-- <<< END 002b_memory_functions.sql

-- >>> BEGIN 003_error_logging.sql

-- Note: Error logging tables have been moved to the top of the schema
-- This section now contains only the error-related functions

-- Function to get error statistics for a given time window
CREATE OR REPLACE FUNCTION get_error_stats(time_window INTERVAL DEFAULT '1 hour')
RETURNS TABLE (
    total_errors BIGINT,
    error_rate DECIMAL,
    errors_by_level JSONB,
    errors_by_category JSONB,
    top_error_messages JSONB
) AS $$
DECLARE
    start_time TIMESTAMPTZ := NOW() - time_window;
BEGIN
    RETURN QUERY
    WITH error_counts AS (
        SELECT 
            COUNT(*) as total,
            level,
            category,
            message
        FROM error_logs 
        WHERE timestamp >= start_time 
        GROUP BY level, category, message
    ),
    level_stats AS (
        SELECT jsonb_object_agg(level, count) as by_level
        FROM (
            SELECT level, COUNT(*) as count
            FROM error_logs 
            WHERE timestamp >= start_time
            GROUP BY level
        ) t
    ),
    category_stats AS (
        SELECT jsonb_object_agg(COALESCE(category, 'uncategorized'), count) as by_category
        FROM (
            SELECT category, COUNT(*) as count
            FROM error_logs 
            WHERE timestamp >= start_time
            GROUP BY category
        ) t
    ),
    top_messages AS (
        SELECT jsonb_agg(
            jsonb_build_object(
                'message', message,
                'count', count
            ) ORDER BY count DESC
        ) as top_msgs
        FROM (
            SELECT message, COUNT(*) as count
            FROM error_logs 
            WHERE timestamp >= start_time
            GROUP BY message
            ORDER BY count DESC
            LIMIT 10
        ) t
    )
    SELECT 
        (SELECT COUNT(*) FROM error_logs WHERE timestamp >= start_time)::BIGINT,
        (SELECT COUNT(*) FROM error_logs WHERE timestamp >= start_time)::DECIMAL / EXTRACT(EPOCH FROM time_window) * 3600,
        COALESCE((SELECT by_level FROM level_stats), '{}'::jsonb),
        COALESCE((SELECT by_category FROM category_stats), '{}'::jsonb),
        COALESCE((SELECT top_msgs FROM top_messages), '[]'::jsonb);
END;
$$ LANGUAGE plpgsql;

-- Function to clean up old error logs (retention policy)
CREATE OR REPLACE FUNCTION cleanup_old_error_logs(retention_days INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
    cutoff_date TIMESTAMPTZ := NOW() - (retention_days || ' days')::INTERVAL;
BEGIN
    DELETE FROM error_logs 
    WHERE timestamp < cutoff_date 
    AND level NOT IN ('error', 'critical');
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Keep critical and error logs longer (90 days)
    DELETE FROM error_logs 
    WHERE timestamp < (NOW() - INTERVAL '90 days')
    AND level IN ('error', 'critical');
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to automatically acknowledge resolved alerts
CREATE OR REPLACE FUNCTION auto_resolve_alerts()
RETURNS INTEGER AS $$
DECLARE
    resolved_count INTEGER;
BEGIN
    UPDATE error_alerts 
    SET 
        status = 'resolved',
        resolved_at = NOW(),
        resolved_by = 'auto-system',
        updated_at = NOW()
    WHERE status = 'pending' 
    AND timestamp < (NOW() - INTERVAL '1 hour')
    AND NOT EXISTS (
        SELECT 1 FROM error_logs 
        WHERE correlation_id = error_alerts.correlation_id 
        AND timestamp >= (NOW() - INTERVAL '30 minutes')
        AND level IN ('error', 'critical')
    );
    
    GET DIAGNOSTICS resolved_count = ROW_COUNT;
    RETURN resolved_count;
END;
$$ LANGUAGE plpgsql;

-- Note: update_updated_at_column function is already defined above
-- This duplicate definition has been removed

DROP TRIGGER IF EXISTS update_error_alerts_updated_at ON error_alerts;
CREATE TRIGGER update_error_alerts_updated_at
    BEFORE UPDATE ON error_alerts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Note: RLS policies have been moved to the top of the schema

-- Note: Service role policies have been moved to the top of the schema

-- Grant permissions
GRANT ALL ON error_logs TO service_role;
GRANT ALL ON error_alerts TO service_role;
GRANT ALL ON error_metrics TO service_role;
GRANT ALL ON error_recovery_attempts TO service_role;
GRANT EXECUTE ON FUNCTION get_error_stats(INTERVAL) TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_old_error_logs(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION auto_resolve_alerts() TO service_role;

-- <<< END 003_error_logging.sql

-- >>> BEGIN 004_category_registry.sql

-- Migration: Add category registry system for dynamic data discovery
-- This enables the MCP server to track which data categories are populated
-- and provide contextual hints to AI agents about when to query the database.

-- Note: category_registry table and category column have been moved to the top of the schema
-- This section now contains only the category-related functions and triggers

-- Create trigger function for automatic category activation/deactivation
CREATE OR REPLACE FUNCTION update_category_counts() 
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Update count and potentially activate category
    UPDATE category_registry 
    SET 
      item_count = item_count + 1,
      is_active = CASE 
        WHEN item_count + 1 >= min_items_for_activation THEN true 
        ELSE is_active 
      END,
      first_activation = CASE 
        WHEN is_active = false AND item_count + 1 >= min_items_for_activation 
        THEN NOW() 
        ELSE first_activation 
      END,
      last_modified = NOW()
    WHERE category_name = NEW.category;
    
    RETURN NEW;
    
  ELSIF TG_OP = 'DELETE' THEN
    -- Update count and potentially deactivate category
    UPDATE category_registry 
    SET 
      item_count = GREATEST(0, item_count - 1),
      is_active = CASE 
        WHEN item_count - 1 < min_items_for_activation THEN false 
        ELSE is_active 
      END,
      last_modified = NOW()
    WHERE category_name = OLD.category;
    
    RETURN OLD;
    
  ELSIF TG_OP = 'UPDATE' THEN
    -- Handle category changes
    IF OLD.category IS DISTINCT FROM NEW.category THEN
      -- Decrease count for old category
      IF OLD.category IS NOT NULL THEN
        UPDATE category_registry 
        SET 
          item_count = GREATEST(0, item_count - 1),
          is_active = CASE 
            WHEN item_count - 1 < min_items_for_activation THEN false 
            ELSE is_active 
          END,
          last_modified = NOW()
        WHERE category_name = OLD.category;
      END IF;
      
      -- Increase count for new category
      IF NEW.category IS NOT NULL THEN
        UPDATE category_registry 
        SET 
          item_count = item_count + 1,
          is_active = CASE 
            WHEN item_count + 1 >= min_items_for_activation THEN true 
            ELSE is_active 
          END,
          first_activation = CASE 
            WHEN is_active = false AND item_count + 1 >= min_items_for_activation 
            THEN NOW() 
            ELSE first_activation 
          END,
          last_modified = NOW()
        WHERE category_name = NEW.category;
      END IF;
    END IF;
    
    RETURN NEW;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic category management
DROP TRIGGER IF EXISTS personal_data_category_update ON personal_data;
CREATE TRIGGER personal_data_category_update
  AFTER INSERT OR UPDATE OR DELETE ON personal_data
  FOR EACH ROW
  EXECUTE FUNCTION update_category_counts();

-- Insert predefined categories with trigger words and contextual hints
INSERT INTO category_registry (
  category_name, 
  display_name, 
  description, 
  trigger_words, 
  query_hint,
  example_queries
) VALUES 
  (
    'basic_information',
    'Basic Information',
    'Personal details like name, email, phone, address',
    ARRAY['personal info', 'contact details', 'basic info', 'profile', 'name', 'email', 'phone', 'address'],
    'Query when user asks about their personal details, contact information, or profile data',
    ARRAY['What''s my email address?', 'Show my contact information', 'What personal details do I have stored?']
  ),
  (
    'books',
    'Books & Reading',
    'Book collection, reading list, favorite books, book reviews',
    ARRAY['books', 'reading', 'favorite books', 'books I''ve read', 'book collection', 'library', 'reading list', 'literature', 'novels', 'authors'],
    'Query when user mentions books, reading preferences, asks for book recommendations, or discusses literary interests',
    ARRAY['What books have I read?', 'Show my favorite books', 'What''s in my reading list?', 'Books by my favorite authors']
  ),
  (
    'favorite_authors',
    'Favorite Authors',
    'Authors you follow, enjoy, and want to track',
    ARRAY['authors', 'writers', 'favorite authors', 'authors I like', 'novelists', 'poets', 'literary authors'],
    'Query when user asks about authors they like, discusses writing styles, or wants author recommendations',
    ARRAY['Who are my favorite authors?', 'Show me authors I follow', 'What authors do I enjoy reading?']
  ),
  (
    'interests',
    'Interests & Hobbies',
    'Personal interests, hobbies, activities you enjoy',
    ARRAY['interests', 'hobbies', 'likes', 'preferences', 'activities', 'favorite things', 'what I enjoy', 'passions'],
    'Query when discussing personal preferences, hobby recommendations, or planning activities',
    ARRAY['What are my interests?', 'Show my hobbies', 'What do I like to do?', 'What are my preferences?']
  ),
  (
    'digital_products',
    'Digital Products & Tools',
    'Software, apps, services, and digital tools you use',
    ARRAY['software', 'apps', 'tools', 'services', 'applications', 'programs', 'digital tools', 'subscriptions', 'platforms'],
    'Query when discussing technology preferences, software recommendations, or digital tool usage',
    ARRAY['What software do I use?', 'Show my digital tools', 'What apps do I have?', 'My technology stack']
  ),
  (
    'contacts',
    'Contacts & Relationships',
    'Friends, family, colleagues, and professional contacts',
    ARRAY['contacts', 'friends', 'family', 'colleagues', 'people', 'relationships', 'connections', 'network'],
    'Query when user needs contact information, asks about relationships, or discusses people in their network',
    ARRAY['Show my contacts', 'Who do I know?', 'Find contact information', 'My professional network']
  ),
  (
    'documents',
    'Documents & Files',
    'Files, papers, records, notes, reports, written materials',
    ARRAY['documents', 'files', 'papers', 'records', 'notes', 'reports', 'written materials', 'docs', 'pdfs'],
    'Query when user mentions files, documents, papers, or written records they have',
    ARRAY['Show my documents', 'Find my files', 'What documents do I have?', 'My saved papers']
  ),
  (
    'preferences',
    'Preferences & Settings',
    'Personal preferences, settings, choices, configurations',
    ARRAY['preferences', 'settings', 'choices', 'options', 'configurations', 'likes', 'dislikes', 'preferred'],
    'Query when user asks about their preferences, settings, or personal choices',
    ARRAY['What are my preferences?', 'My settings', 'What do I prefer?', 'My choices']
  )
ON CONFLICT (category_name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  trigger_words = EXCLUDED.trigger_words,
  query_hint = EXCLUDED.query_hint,
  example_queries = EXCLUDED.example_queries,
  last_modified = NOW();

-- Create function to get active categories with their metadata
CREATE OR REPLACE FUNCTION get_active_categories()
RETURNS TABLE (
  category_name TEXT,
  display_name TEXT,
  description TEXT,
  item_count INTEGER,
  trigger_words TEXT[],
  query_hint TEXT,
  example_queries TEXT[],
  last_modified TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cr.category_name,
    cr.display_name,
    cr.description,
    cr.item_count,
    cr.trigger_words,
    cr.query_hint,
    cr.example_queries,
    cr.last_modified
  FROM category_registry cr
  WHERE cr.is_active = true
  ORDER BY cr.item_count DESC, cr.display_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to get category statistics
CREATE OR REPLACE FUNCTION get_category_stats()
RETURNS TABLE (
  total_categories INTEGER,
  active_categories INTEGER,
  total_items INTEGER,
  categories_json JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::INTEGER as total_categories,
    COUNT(*) FILTER (WHERE is_active = true)::INTEGER as active_categories,
    COALESCE(SUM(item_count), 0)::INTEGER as total_items,
    jsonb_agg(
      jsonb_build_object(
        'name', category_name,
        'display_name', display_name,
        'is_active', is_active,
        'item_count', item_count,
        'trigger_words', trigger_words,
        'query_hint', query_hint
      ) ORDER BY is_active DESC, item_count DESC
    ) as categories_json
  FROM category_registry;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Manual sync of category counts for existing data
WITH category_counts AS (
  SELECT 
    category,
    COUNT(*) as actual_count
  FROM personal_data
  WHERE deleted_at IS NULL AND category IS NOT NULL
  GROUP BY category
)
UPDATE category_registry cr
SET 
  item_count = cc.actual_count,
  is_active = (cc.actual_count >= cr.min_items_for_activation),
  first_activation = CASE 
    WHEN cc.actual_count >= cr.min_items_for_activation AND cr.first_activation IS NULL
    THEN NOW()
    ELSE cr.first_activation
  END,
  last_modified = NOW()
FROM category_counts cc
WHERE cr.category_name = cc.category;

-- Grant permissions for service role
GRANT SELECT, INSERT, UPDATE ON category_registry TO service_role;
GRANT EXECUTE ON FUNCTION get_active_categories() TO service_role;
GRANT EXECUTE ON FUNCTION get_category_stats() TO service_role;

-- Grant read access to authenticated users
GRANT SELECT ON category_registry TO authenticated;
GRANT EXECUTE ON FUNCTION get_active_categories() TO authenticated;
GRANT EXECUTE ON FUNCTION get_category_stats() TO authenticated;

-- <<< END 004_category_registry.sql

-- >>> BEGIN 005_chatgpt_functions.sql

-- ChatGPT-specific database functions for MCP integration
-- These functions are optimized for ChatGPT's search and fetch tool requirements

-- Drop existing functions first
DROP FUNCTION IF EXISTS chatgpt_search_data(TEXT, UUID, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS chatgpt_fetch_data(TEXT) CASCADE;

-- Function to search personal data for ChatGPT with specific output format
CREATE OR REPLACE FUNCTION chatgpt_search_data(
    p_query TEXT,
    p_user_id UUID DEFAULT NULL,
    p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
    id TEXT,
    title TEXT,
    url TEXT
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        pd.id::TEXT as id,
        pd.title::TEXT as title,
        CASE 
            WHEN pd.category = 'documents' THEN 'https://datadam.example.com/document/' || pd.id
            WHEN pd.category = 'contacts' THEN 'https://datadam.example.com/contact/' || pd.id
            WHEN pd.category = 'books' THEN 'https://datadam.example.com/book/' || pd.id
            ELSE 'https://datadam.example.com/item/' || pd.id
        END as url
    FROM personal_data pd
    WHERE 
        pd.deleted_at IS NULL
        AND (p_user_id IS NULL OR pd.user_id = p_user_id)
        AND (
            -- Title search (partial match)
            pd.title ILIKE '%' || p_query || '%'
            -- Category search (exact match first, then partial)
            OR pd.category = LOWER(p_query)
            OR pd.category ILIKE '%' || p_query || '%'
            -- Tag search (exact match first, then partial)
            OR EXISTS (
                SELECT 1 FROM unnest(pd.tags) as tag 
                WHERE tag = LOWER(p_query) OR tag ILIKE '%' || p_query || '%'
            )
        )
    ORDER BY 
        -- Prioritize exact matches
        CASE 
            WHEN pd.category = LOWER(p_query) THEN 1
            WHEN EXISTS (SELECT 1 FROM unnest(pd.tags) as tag WHERE tag = LOWER(p_query)) THEN 2
            WHEN pd.title ILIKE p_query THEN 3
            ELSE 4
        END,
        pd.updated_at DESC
    LIMIT p_limit;
END;
$$;

-- Function to fetch complete document content by ID for ChatGPT
CREATE OR REPLACE FUNCTION chatgpt_fetch_data(
    p_document_id TEXT
)
RETURNS TABLE (
    id TEXT,
    title TEXT,
    text TEXT,
    url TEXT,
    metadata JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    doc_record RECORD;
BEGIN
    -- Fetch the document record
    SELECT pd.* INTO doc_record
    FROM personal_data pd
    WHERE pd.id::TEXT = p_document_id 
    AND pd.deleted_at IS NULL;
    
    -- Return empty if not found
    IF NOT FOUND THEN
        RETURN;
    END IF;
    
    -- Return the formatted result
    RETURN QUERY
    SELECT 
        doc_record.id::TEXT as id,
        doc_record.title::TEXT as title,
        CASE 
            WHEN doc_record.content IS NOT NULL THEN 
                CASE 
                    WHEN jsonb_typeof(doc_record.content) = 'object' THEN 
                        doc_record.content::TEXT
                    ELSE doc_record.content::TEXT
                END
            ELSE 'No content available'
        END as text,
        CASE 
            WHEN doc_record.category = 'documents' THEN 'https://datadam.example.com/document/' || doc_record.id
            WHEN doc_record.category = 'contacts' THEN 'https://datadam.example.com/contact/' || doc_record.id
            WHEN doc_record.category = 'books' THEN 'https://datadam.example.com/book/' || doc_record.id
            ELSE 'https://datadam.example.com/item/' || doc_record.id
        END as url,
        jsonb_build_object(
            'category', COALESCE(doc_record.category, 'uncategorized'),
            'classification', doc_record.classification,
            'tags', COALESCE(doc_record.tags, ARRAY[]::TEXT[]),
            'user_id', doc_record.user_id,
            'created_at', doc_record.created_at,
            'updated_at', doc_record.updated_at
        ) as metadata;
END;
$$;

-- Grant execute permissions for authenticated users and anonymous (ChatGPT) access
GRANT EXECUTE ON FUNCTION chatgpt_search_data(TEXT, UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION chatgpt_fetch_data(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION chatgpt_search_data(TEXT, UUID, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION chatgpt_fetch_data(TEXT) TO anon;

-- Create indexes to optimize ChatGPT search performance
CREATE INDEX IF NOT EXISTS idx_personal_data_chatgpt_search 
ON personal_data USING GIN (
    to_tsvector('english', title || ' ' || COALESCE(category, ''))
);

CREATE INDEX IF NOT EXISTS idx_personal_data_chatgpt_tags 
ON personal_data USING GIN (tags);

-- Note: pg_trgm extension removed to avoid dependency issues
-- If you want similarity scoring, enable it manually: CREATE EXTENSION IF NOT EXISTS pg_trgm;


-- Test data entry for MCP (Model Context Protocol)
-- Only insert if it doesn't already exist (idempotent)
INSERT INTO personal_data (
  user_id,
  category,
  title,
  content,
  tags,
  classification
)
SELECT
  NULL, -- No user ID as requested
  'interests',
  'MCP (Model Context Protocol)',
  '{"description": "A protocol for enabling AI assistants to securely access external tools and data sources", "type": "technology", "domain": "artificial intelligence", "use_cases": ["data access", "tool integration", "secure AI interactions"], "related_concepts": ["AI agents", "tool calling", "protocol design"]}'::JSONB,
  ARRAY['technology', 'protocol', 'ai', 'mcp'],
  'personal'
WHERE NOT EXISTS (
  SELECT 1 FROM personal_data
  WHERE title = 'MCP (Model Context Protocol)'
  AND category = 'interests'
  AND deleted_at IS NULL
);


-- ========================================
-- SEARCH QUERY ANALYTICS VIEWS
-- ========================================
-- Views for analyzing search query patterns and user behavior
-- These views work with the query_text logged in data_access_log

-- Drop existing views for idempotency
DROP VIEW IF EXISTS recent_search_queries CASCADE;
DROP VIEW IF EXISTS popular_search_queries CASCADE;
DROP VIEW IF EXISTS search_queries_by_user CASCADE;
DROP VIEW IF EXISTS daily_search_volume CASCADE;
DROP VIEW IF EXISTS search_patterns_by_threshold CASCADE;

-- View 1: Recent search queries with full details
CREATE OR REPLACE VIEW recent_search_queries AS
SELECT
  id,
  user_id,
  changes->>'query_text' as query_text,
  (changes->>'limit')::int as limit_used,
  (changes->>'threshold')::float as threshold_used,
  changes->>'filters' as filters,
  ip_address,
  created_at
FROM data_access_log
WHERE table_name = 'memories'
  AND operation = 'READ'
  AND changes->>'operation_type' = 'vector_search'
ORDER BY created_at DESC
LIMIT 50;

COMMENT ON VIEW recent_search_queries IS 'Most recent 50 search queries with query text and parameters';

-- View 2: Most popular search queries
CREATE OR REPLACE VIEW popular_search_queries AS
SELECT
  changes->>'query_text' as query_text,
  COUNT(*) as search_count,
  MIN(created_at) as first_searched,
  MAX(created_at) as last_searched,
  COUNT(DISTINCT user_id) as unique_users
FROM data_access_log
WHERE table_name = 'memories'
  AND operation = 'READ'
  AND changes->>'operation_type' = 'vector_search'
  AND changes->>'query_text' IS NOT NULL
GROUP BY changes->>'query_text'
ORDER BY search_count DESC;

COMMENT ON VIEW popular_search_queries IS 'Search queries ranked by frequency with usage statistics';

-- View 3: Search queries grouped by user
CREATE OR REPLACE VIEW search_queries_by_user AS
SELECT
  user_id,
  COUNT(*) as total_searches,
  COUNT(DISTINCT changes->>'query_text') as unique_queries,
  MIN(created_at) as first_search,
  MAX(created_at) as last_search,
  array_agg(DISTINCT changes->>'query_text' ORDER BY changes->>'query_text')
    FILTER (WHERE changes->>'query_text' IS NOT NULL) as all_queries
FROM data_access_log
WHERE table_name = 'memories'
  AND operation = 'READ'
  AND changes->>'operation_type' = 'vector_search'
GROUP BY user_id
ORDER BY total_searches DESC;

COMMENT ON VIEW search_queries_by_user IS 'User search behavior showing total searches and unique queries per user';

-- View 4: Daily search volume with examples
CREATE OR REPLACE VIEW daily_search_volume AS
SELECT
  DATE(created_at) as search_date,
  COUNT(*) as total_searches,
  COUNT(DISTINCT user_id) as unique_users,
  COUNT(DISTINCT changes->>'query_text') as unique_queries,
  AVG((changes->>'limit')::int) as avg_limit,
  AVG((changes->>'threshold')::float) as avg_threshold,
  (array_agg(DISTINCT changes->>'query_text' ORDER BY changes->>'query_text')
    FILTER (WHERE changes->>'query_text' IS NOT NULL))[1:5] as example_queries
FROM data_access_log
WHERE table_name = 'memories'
  AND operation = 'READ'
  AND changes->>'operation_type' = 'vector_search'
GROUP BY DATE(created_at)
ORDER BY search_date DESC;

COMMENT ON VIEW daily_search_volume IS 'Daily search statistics with volume, unique users, and example queries';

-- View 5: Search patterns by threshold
CREATE OR REPLACE VIEW search_patterns_by_threshold AS
SELECT
  (changes->>'threshold')::float as threshold_value,
  COUNT(*) as usage_count,
  COUNT(DISTINCT user_id) as unique_users,
  COUNT(DISTINCT changes->>'query_text') as unique_queries,
  (array_agg(DISTINCT changes->>'query_text' ORDER BY changes->>'query_text')
    FILTER (WHERE changes->>'query_text' IS NOT NULL))[1:3] as example_queries
FROM data_access_log
WHERE table_name = 'memories'
  AND operation = 'READ'
  AND changes->>'operation_type' = 'vector_search'
GROUP BY (changes->>'threshold')::float
ORDER BY usage_count DESC;

COMMENT ON VIEW search_patterns_by_threshold IS 'Search behavior analysis grouped by similarity threshold values';


-- ========================================
-- ENHANCED SEARCH ANALYTICS VIEWS
-- ========================================

-- Popular search queries from enhanced log
CREATE OR REPLACE VIEW enhanced_popular_search_queries AS
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
-- SEARCH LOG CLEANUP FUNCTION
-- ========================================

-- Function to clean old search logs (keep last 90 days)
CREATE OR REPLACE FUNCTION cleanup_old_search_logs(retention_days INTEGER DEFAULT 90)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  DELETE FROM search_query_log
  WHERE created_at < NOW() - (retention_days || ' days')::INTERVAL;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count;
END;
$$;


-- ========================================
-- SEARCH QUERY LOG RLS POLICIES
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
-- USAGE EXAMPLES
-- ========================================

-- Example 1: View recent searches
-- SELECT * FROM recent_search_queries LIMIT 10;

-- Example 2: Find most popular queries
-- SELECT query_text, search_count FROM popular_search_queries LIMIT 10;

-- Example 3: User search behavior
-- SELECT user_id, total_searches, unique_queries FROM search_queries_by_user LIMIT 10;

-- Example 4: Daily trends
-- SELECT search_date, total_searches, unique_users FROM daily_search_volume LIMIT 7;

-- Example 5: Threshold usage
-- SELECT threshold_value, usage_count FROM search_patterns_by_threshold;