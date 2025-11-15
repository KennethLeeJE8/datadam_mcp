-- View Search Query Logs with Query Text
-- Run this in Supabase SQL Editor after updating to the new schema

-- 1. Recent searches with query text
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

-- 2. Most popular search queries
SELECT
  changes->>'query_text' as query_text,
  COUNT(*) as search_count,
  MIN(created_at) as first_searched,
  MAX(created_at) as last_searched
FROM data_access_log
WHERE table_name = 'memories'
  AND operation = 'READ'
  AND changes->>'operation_type' = 'vector_search'
  AND changes->>'query_text' IS NOT NULL
GROUP BY changes->>'query_text'
ORDER BY search_count DESC
LIMIT 20;

-- 3. Searches by user
SELECT
  user_id,
  COUNT(*) as search_count,
  COUNT(DISTINCT changes->>'query_text') as unique_queries,
  array_agg(DISTINCT changes->>'query_text' ORDER BY changes->>'query_text')
    FILTER (WHERE changes->>'query_text' IS NOT NULL) as queries_used
FROM data_access_log
WHERE table_name = 'memories'
  AND operation = 'READ'
  AND changes->>'operation_type' = 'vector_search'
GROUP BY user_id
ORDER BY search_count DESC;

-- 4. Daily search volume with query examples
SELECT
  DATE(created_at) as search_date,
  COUNT(*) as total_searches,
  COUNT(DISTINCT user_id) as unique_users,
  COUNT(DISTINCT changes->>'query_text') as unique_queries,
  array_agg(DISTINCT changes->>'query_text' ORDER BY changes->>'query_text')
    FILTER (WHERE changes->>'query_text' IS NOT NULL)
    LIMIT 5 as example_queries
FROM data_access_log
WHERE table_name = 'memories'
  AND operation = 'READ'
  AND changes->>'operation_type' = 'vector_search'
GROUP BY DATE(created_at)
ORDER BY search_date DESC
LIMIT 30;

-- 5. Search patterns by threshold
SELECT
  (changes->>'threshold')::float as threshold_used,
  COUNT(*) as usage_count,
  array_agg(DISTINCT changes->>'query_text' ORDER BY changes->>'query_text')
    FILTER (WHERE changes->>'query_text' IS NOT NULL)
    LIMIT 3 as example_queries
FROM data_access_log
WHERE table_name = 'memories'
  AND operation = 'READ'
  AND changes->>'operation_type' = 'vector_search'
GROUP BY (changes->>'threshold')::float
ORDER BY usage_count DESC;
