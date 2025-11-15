# Phase 1: Mem0 Integration - Database Setup Instructions

## Overview
This guide walks you through setting up the database infrastructure for integrating mem0's semantic memory capabilities into your DataDam MCP server. The setup is **idempotent** - you can run it multiple times safely.

## Prerequisites
- Access to your Supabase dashboard
- SQL Editor access
- Existing DataDam database (from schema.sql)

---

## Step 1: Enable pgvector Extension

The pgvector extension enables PostgreSQL to store and query vector embeddings for semantic search.

### Instructions:

1. **Navigate to Supabase SQL Editor**
   - Go to your Supabase project
   - Click on "SQL Editor" in the left sidebar

2. **Run the following SQL command:**

```sql
CREATE EXTENSION IF NOT EXISTS "vector";
```

3. **Verify installation:**

```sql
SELECT * FROM pg_extension WHERE extname = 'vector';
```

You should see a row confirming the vector extension is installed.

### What this does:
- Enables vector data type support (e.g., `vector(1536)` for OpenAI embeddings)
- Provides vector similarity operators (`<=>` for cosine distance)
- Enables vector indexing with IVFFlat algorithm

---

## Step 2: Run the Updated Schema

The schema.sql file has been updated to include:
- `memories` table for storing semantic memories with embeddings
- `memory_history` table for audit trail
- Vector indexes for efficient similarity search
- RPC functions for memory operations (add, search, list, delete)
- Row Level Security (RLS) policies

### Instructions:

1. **Open the schema.sql file** located at:
   ```
   src/database/schema.sql
   ```

2. **Copy the entire contents** of the file

3. **In Supabase SQL Editor:**
   - Create a new query
   - Paste the entire schema
   - Click "Run" or press F9

4. **Wait for completion** (may take 30-60 seconds)

### What gets created:

#### Tables:
- **`memories`** - Stores memory text, embeddings (1536-dim vectors), metadata, and timestamps
  - Supports soft deletion (deleted_at field)
  - Includes hash field for deduplication
  - Links to users via user_id

- **`memory_history`** - Tracks all changes to memories
  - Records ADD, UPDATE, DELETE actions
  - Stores previous and new values
  - Maintains audit trail with timestamps

#### Indexes:
```sql
-- User and filtering
idx_memories_user_id          -- Fast user lookups
idx_memories_deleted_at       -- Filter active memories
idx_memories_metadata         -- JSONB metadata search
idx_memories_hash             -- Deduplication checks

-- Vector search
idx_memories_embedding        -- IVFFlat vector similarity search
                              -- Uses cosine distance
                              -- Lists = 100 for balance
```

#### RPC Functions:
1. **`add_memory()`** - Create or update memories
   - Parameters: memory_text, user_id, embedding, metadata, hash
   - Returns: memory_id (TEXT)
   - Features: Automatic deduplication, history tracking

2. **`search_memories()`** - Semantic search by vector similarity
   - Parameters: query_embedding, user_id, limit, filters, threshold
   - Returns: memories ranked by similarity
   - Features: Filtered by similarity threshold (default 0.1)

3. **`list_memories()`** - List all memories with pagination
   - Parameters: user_id, limit, offset, filters, include_deleted
   - Returns: memories ordered by creation time
   - Features: Supports metadata filtering

4. **`delete_memory()`** - Delete memory (soft or hard)
   - Parameters: memory_id, hard_delete
   - Returns: success boolean
   - Features: Soft delete by default, history tracking

5. **`get_memory()`** - Get single memory with optional history
   - Parameters: memory_id, include_history
   - Returns: complete memory with optional history
   - Features: Includes full audit trail

6. **`get_memory_stats()`** - Get memory statistics
   - Parameters: user_id (optional)
   - Returns: counts and statistics
   - Features: Total, active, deleted, embeddings count

---

## Step 3: Verify the Setup

### 3.1 Check Tables Exist

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('memories', 'memory_history');
```

Expected output: 2 rows (memories, memory_history)

### 3.2 Check Functions Exist

```sql
SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name LIKE '%memory%'
ORDER BY routine_name;
```

Expected output: 6 functions (add_memory, search_memories, list_memories, delete_memory, get_memory, get_memory_stats)

### 3.3 Check Indexes

```sql
SELECT indexname
FROM pg_indexes
WHERE tablename = 'memories'
ORDER BY indexname;
```

Expected output: 6+ indexes including idx_memories_embedding

### 3.4 Test Vector Extension

```sql
-- Create a test vector
SELECT '[1,2,3]'::vector(3);
```

Should return: `[1,2,3]`

### 3.5 Test Memory Functions

```sql
-- Add a test memory
SELECT add_memory(
  'I love TypeScript and building MCP servers',
  NULL,  -- user_id
  NULL,  -- embedding (we'll add via mem0 later)
  '{"source": "test", "category": "preferences"}'::JSONB,
  'test-hash-123'
);

-- List all memories
SELECT * FROM list_memories(NULL, 10, 0, NULL, FALSE);

-- Clean up test
SELECT delete_memory(
  (SELECT id FROM memories WHERE hash = 'test-hash-123' LIMIT 1),
  TRUE  -- hard delete
);
```

---

## Step 4: Understanding the Architecture

### Data Flow:

```
User Message
    ↓
MCP Tool (datadam_add_memory)
    ↓
Mem0 SDK (extracts memory + generates embedding)
    ↓
add_memory() RPC Function
    ↓
PostgreSQL (stores in memories table)
    ↓
memory_history table (audit trail)
```

### Vector Search Flow:

```
User Query
    ↓
MCP Tool (datadam_search_memories)
    ↓
Mem0 SDK (converts query to embedding)
    ↓
search_memories() RPC Function
    ↓
pgvector (cosine similarity search)
    ↓
Ranked results returned
```

### Storage Model:

**Memories Table:**
- `id` (TEXT): Unique identifier
- `user_id` (UUID): Links to user
- `memory_text` (TEXT): The actual memory
- `embedding` (vector(1536)): OpenAI embedding
- `metadata` (JSONB): Flexible metadata
  - source: "conversation" | "explicit" | "inferred"
  - category: Link to structured categories
  - tags: Array of tags
  - confidence: 0.0 - 1.0
  - related_data_ids: UUIDs of related personal_data
- `hash` (TEXT): For deduplication
- `created_at`, `updated_at`, `deleted_at`: Timestamps

---

## Troubleshooting

### Issue: pgvector extension not available

**Solution:**
```sql
-- Check if extension is available
SELECT * FROM pg_available_extensions WHERE name = 'vector';

-- If not available, enable in Supabase Dashboard:
-- Settings → Database → Extensions → Search for "vector" → Enable
```

### Issue: Index creation fails

**Error:** `ERROR: could not create index "idx_memories_embedding"`

**Solution:**
The IVFFlat index requires data to build. It will be created successfully after you add memories with embeddings. You can skip this index initially and create it later:

```sql
-- Create index after adding data (needs at least 100 rows for best results)
CREATE INDEX IF NOT EXISTS idx_memories_embedding
ON memories USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
```

For smaller datasets during development:
```sql
-- Use a simpler index temporarily
CREATE INDEX IF NOT EXISTS idx_memories_embedding_simple
ON memories USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 10);
```

### Issue: Foreign key constraint fails

**Error:** `ERROR: relation "auth.users" does not exist`

**Solution:**
The schema handles this gracefully. If auth.users doesn't exist, the constraint is skipped, and user_id is simply nullable. This is intentional for flexibility.

### Issue: RLS blocking queries

**Error:** `ERROR: new row violates row-level security policy`

**Solution:**
Make sure you're using the service role key, not the anon key:
```typescript
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY  // Not SUPABASE_ANON_KEY!
);
```

---

## Security Considerations

### Row Level Security (RLS)

The schema implements RLS for memories:

1. **Service Role** - Full access (bypasses RLS)
2. **Authenticated Users** - Can only access their own memories
   - Read/Write their own (user_id = auth.uid())
   - Read/Write orphaned memories (user_id IS NULL)
3. **Anonymous** - No access

### Audit Trail

All memory operations are logged in:
- `memory_history` table (memory-specific changes)
- `data_access_log` table (general audit log)

This ensures:
- Full traceability of who did what
- Compliance with data regulations
- Debugging capabilities

---

## Next Steps

After completing Phase 1, you're ready for:

**Phase 2:** Install and configure mem0ai npm package
**Phase 3:** Implement the 4 MCP memory tools
**Phase 4:** Test and integrate

---

## Database Schema Diagram

```
┌─────────────────────────────────────┐
│          memories                    │
├─────────────────────────────────────┤
│ id                TEXT PK            │
│ user_id           UUID               │
│ memory_text       TEXT               │
│ embedding         vector(1536)       │
│ metadata          JSONB              │
│ hash              TEXT                │
│ created_at        TIMESTAMPTZ        │
│ updated_at        TIMESTAMPTZ        │
│ deleted_at        TIMESTAMPTZ        │
└─────────────────────────────────────┘
         │
         │ 1:N
         ▼
┌─────────────────────────────────────┐
│       memory_history                 │
├─────────────────────────────────────┤
│ id                UUID PK            │
│ memory_id         TEXT FK            │
│ previous_value    TEXT               │
│ new_value         TEXT               │
│ action            TEXT               │
│ metadata          JSONB              │
│ created_at        TIMESTAMPTZ        │
│ updated_at        TIMESTAMPTZ        │
│ is_deleted        INTEGER            │
└─────────────────────────────────────┘
```

---

## Summary

✅ **What you've accomplished:**
- Enabled pgvector extension for vector storage
- Created memories and memory_history tables
- Set up vector similarity search indexes
- Implemented 6 RPC functions for memory operations
- Configured Row Level Security policies
- Established audit trail for compliance

✅ **What's working:**
- Idempotent schema (safe to re-run)
- Soft delete support
- Deduplication via hash
- Flexible metadata storage
- Full audit history
- Semantic search ready

🚀 **You're now ready** to proceed with Phase 2: Installing the mem0ai package and implementing the MCP tools!
