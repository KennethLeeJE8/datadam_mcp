-- Quick fix: Update add_memory function to support semantic deduplication
-- Run this in Supabase SQL Editor

-- Step 1: Drop old function (all possible signatures)
DROP FUNCTION IF EXISTS add_memory(TEXT, UUID, vector(1536), JSONB, TEXT);
DROP FUNCTION IF EXISTS add_memory(TEXT, UUID, vector, JSONB, TEXT);
DROP FUNCTION IF EXISTS add_memory CASCADE;

-- Step 2: Create new function with semantic deduplication support
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
  IF p_embedding IS NOT NULL THEN
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

    IF semantic_duplicate.id IS NOT NULL THEN
      UPDATE memories
      SET
        memory_text = p_memory_text,
        embedding = p_embedding,
        metadata = p_metadata,
        hash = p_hash,
        updated_at = NOW()
      WHERE id = semantic_duplicate.id;

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

      INSERT INTO data_access_log (
        user_id, operation, table_name, record_id,
        changes, ip_address, user_agent
      ) VALUES (
        p_user_id, 'UPDATE', 'memories', semantic_duplicate.id,
        jsonb_build_object(
          'previous_text', semantic_duplicate.memory_text,
          'new_text', p_memory_text,
          'similarity', semantic_duplicate.similarity,
          'dedup_method', 'semantic'
        ),
        inet_client_addr(), current_setting('application_name', true)
      );

      RETURN semantic_duplicate.id;
    END IF;
  END IF;

  -- Step 2: Hash-based deduplication
  IF p_hash IS NOT NULL THEN
    SELECT id INTO existing_memory_id
    FROM memories
    WHERE hash = p_hash
      AND user_id = p_user_id
      AND deleted_at IS NULL
    LIMIT 1;

    IF existing_memory_id IS NOT NULL THEN
      UPDATE memories
      SET
        memory_text = p_memory_text,
        embedding = COALESCE(p_embedding, embedding),
        metadata = p_metadata,
        updated_at = NOW()
      WHERE id = existing_memory_id;

      INSERT INTO memory_history (
        memory_id, previous_value, new_value, action, metadata
      ) VALUES (
        existing_memory_id, NULL, p_memory_text, 'UPDATE_HASH', p_metadata
      );

      INSERT INTO data_access_log (
        user_id, operation, table_name, record_id,
        changes, ip_address, user_agent
      ) VALUES (
        p_user_id, 'UPDATE', 'memories', existing_memory_id,
        jsonb_build_object('new_text', p_memory_text, 'dedup_method', 'hash'),
        inet_client_addr(), current_setting('application_name', true)
      );

      RETURN existing_memory_id;
    END IF;
  END IF;

  -- Step 3: Create new memory
  new_memory_id := 'mem_' || substr(md5(random()::text || clock_timestamp()::text), 1, 24);

  INSERT INTO memories (
    id, user_id, memory_text, embedding, metadata, hash, created_at, updated_at
  ) VALUES (
    new_memory_id, p_user_id, p_memory_text, p_embedding, p_metadata, p_hash, NOW(), NOW()
  );

  INSERT INTO memory_history (
    memory_id, previous_value, new_value, action, metadata
  ) VALUES (
    new_memory_id, NULL, p_memory_text, 'ADD', p_metadata
  );

  INSERT INTO data_access_log (
    user_id, operation, table_name, record_id,
    changes, ip_address, user_agent
  ) VALUES (
    p_user_id, 'INSERT', 'memories', new_memory_id,
    jsonb_build_object('memory_text', p_memory_text, 'metadata', p_metadata),
    inet_client_addr(), current_setting('application_name', true)
  );

  RETURN new_memory_id;
END;
$$;

-- Verify it worked
SELECT 'SUCCESS: add_memory function updated with 6 parameters' as status;
