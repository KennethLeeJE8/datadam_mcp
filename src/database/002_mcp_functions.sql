-- MCP Server Functions for Personal Data Management
-- These functions provide the core CRUD operations for personal data

-- Drop existing functions first
DROP FUNCTION IF EXISTS search_personal_data(UUID, TEXT, TEXT[], TEXT[], TEXT, INTEGER, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS extract_personal_data(TEXT, TEXT[], UUID, JSONB, INTEGER, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS create_personal_data(UUID, TEXT, TEXT, JSONB, TEXT[], TEXT) CASCADE;
DROP FUNCTION IF EXISTS update_personal_data(UUID, JSONB, TEXT) CASCADE;
DROP FUNCTION IF EXISTS delete_personal_data(UUID[], BOOLEAN) CASCADE;

-- Function to search personal data by text and filters
CREATE OR REPLACE FUNCTION search_personal_data(
  p_user_id UUID,
  p_search_text TEXT,
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
BEGIN
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
    AND pd.user_id = p_user_id
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
  p_user_id UUID,
  p_category TEXT,
  p_title TEXT,
  p_content JSONB,
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
    WHERE id = record_id AND (p_hard_delete OR deleted_at IS NULL);

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
        CASE WHEN p_hard_delete THEN 'HARD_DELETE' ELSE 'SOFT_DELETE' END,
        'personal_data', 
        record_id,
        jsonb_build_object(
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
GRANT EXECUTE ON FUNCTION search_personal_data(UUID, TEXT, TEXT[], TEXT[], TEXT, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION extract_personal_data(TEXT, TEXT[], UUID, JSONB, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION create_personal_data(UUID, TEXT, TEXT, JSONB, TEXT[], TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION update_personal_data(UUID, JSONB, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION delete_personal_data(UUID[], BOOLEAN) TO service_role;

-- Grant permissions to authenticated users
GRANT EXECUTE ON FUNCTION search_personal_data(UUID, TEXT, TEXT[], TEXT[], TEXT, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION extract_personal_data(TEXT, TEXT[], UUID, JSONB, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION create_personal_data(UUID, TEXT, TEXT, JSONB, TEXT[], TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION update_personal_data(UUID, JSONB, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_personal_data(UUID[], BOOLEAN) TO authenticated;