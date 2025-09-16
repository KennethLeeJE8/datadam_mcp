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
            pd.title ILIKE '%' || p_query || '%' 
            OR pd.content::TEXT ILIKE '%' || p_query || '%'
            OR EXISTS (
                SELECT 1 FROM unnest(pd.tags) as tag 
                WHERE tag ILIKE '%' || p_query || '%'
            )
        )
    ORDER BY pd.updated_at DESC
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
    to_tsvector('english', title || ' ' || COALESCE(content::TEXT, ''))
);

CREATE INDEX IF NOT EXISTS idx_personal_data_chatgpt_tags 
ON personal_data USING GIN (tags);

-- Note: pg_trgm extension removed to avoid dependency issues
-- If you want similarity scoring, enable it manually: CREATE EXTENSION IF NOT EXISTS pg_trgm;