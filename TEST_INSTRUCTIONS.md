# Memory Integration Test Instructions

## Quick Start

### Prerequisites

1. **Complete Phase 1 Database Setup**
   - Enable pgvector extension in Supabase
   - Run the `schema.sql` file
   - Verify tables exist (see PHASE1_SETUP_INSTRUCTIONS.md)

2. **Set Environment Variables**

Create a `.env` file in the project root:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

**IMPORTANT:** Use the **Service Role Key**, not the Anon Key!

To find these in Supabase:
- Go to Project Settings → API
- Copy `Project URL` → SUPABASE_URL
- Copy `service_role` secret → SUPABASE_SERVICE_ROLE_KEY

3. **Install Dependencies**

```bash
npm install
```

---

## Running Tests

### Method 1: Using the Test Script (Recommended)

```bash
# Builds and runs all tests
./run-tests.sh
```

This will:
1. Build the TypeScript code (`npm run build`)
2. Run quick smoke test
3. Run comprehensive integration tests

### Method 2: Manual Execution

```bash
# Step 1: Build the project
npm run build

# Step 2: Run quick test (30 seconds)
node tests/quick-memory-test.ts

# Step 3: Run full integration tests (1-2 minutes)
node tests/memory-integration.test.ts
```

---

## Expected Output

### Quick Test Success:
```
🧪 Quick Memory Test

1️⃣  Adding memory...
   ✓ Added memory: abc-123-def-456

2️⃣  Listing memories...
   ✓ Found 1 memories

3️⃣  Searching memories...
   ✓ Found 1 results

4️⃣  Getting stats...
   ✓ Total: 1, Active: 1

5️⃣  Deleting test memory...
   ✓ Deleted

✅ All tests passed!
```

### Integration Test Success:
```
======================================================================
MEMORY INTEGRATION TESTS
======================================================================

📝 TEST 1: Add Memory (no embedding)
----------------------------------------------------------------------
✓ Memory added successfully
  Memory ID: abc-123-def-456
  Text: "I prefer dark mode in all my applications"

[... 11 more tests ...]

======================================================================
✅ ALL TESTS PASSED
======================================================================

📊 Summary:
   - Created 3 test memories
   - Tested add, list, search, get, delete operations
   - Verified deduplication and soft delete
   - Confirmed RPC functions work correctly
   - Validated vector search functionality

🧹 Cleaning up test data...
✓ Cleanup complete
```

---

## Common Issues & Solutions

### ❌ Error: "supabaseUrl is required"

**Problem:** Missing or incorrect environment variables

**Solution:**
```bash
# Check .env file exists
ls -la .env

# Verify contents (should show your URL and key)
cat .env

# Make sure format is correct:
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJxxx...
```

### ❌ Error: "Cannot find module"

**Problem:** Project not built

**Solution:**
```bash
npm run build
```

### ❌ Error: "Function does not exist: add_memory"

**Problem:** Database schema not installed

**Solution:**
1. Go to Supabase SQL Editor
2. Run the entire `src/database/schema.sql` file
3. Verify functions exist:
   ```sql
   SELECT routine_name
   FROM information_schema.routines
   WHERE routine_name LIKE '%memory%';
   ```

### ❌ Error: "column 'embedding' does not exist"

**Problem:** pgvector extension not enabled

**Solution:**
```sql
-- Run in Supabase SQL Editor
CREATE EXTENSION IF NOT EXISTS "vector";

-- Verify it worked
SELECT * FROM pg_extension WHERE extname = 'vector';
```

### ❌ Error: "permission denied"

**Problem:** Using anon key instead of service role key

**Solution:**
- Get the **service_role** key from Supabase Settings → API
- Update `.env` with the correct key

### ❌ Tests hang or timeout

**Problem:** Network issues or database not responding

**Solution:**
```bash
# Check Supabase status
curl https://status.supabase.com/

# Verify connection
node -e "import('dotenv').then(d => { d.default.config(); console.log('URL:', process.env.SUPABASE_URL?.substring(0, 30) + '...'); });"
```

---

## What the Tests Verify

### Database Layer ✅
- [x] RPC function: `add_memory()` creates memories
- [x] RPC function: `search_memories()` finds similar memories
- [x] RPC function: `list_memories()` paginates correctly
- [x] RPC function: `delete_memory()` handles soft/hard delete
- [x] RPC function: `get_memory()` retrieves with history
- [x] RPC function: `get_memory_stats()` returns accurate counts
- [x] Vector similarity search works
- [x] Metadata filtering functions
- [x] Deduplication prevents duplicates
- [x] Soft delete hides but preserves data

### Service Layer ✅
- [x] MemoryService class instantiates
- [x] Hash generation is consistent
- [x] Mock embeddings generate 1536 dimensions
- [x] Error handling works
- [x] Type conversions are correct

---

## Test Data Cleanup

All tests automatically clean up their test data, so you won't have leftover test memories in your database.

If cleanup fails, you can manually delete test data:

```sql
-- Delete test memories
DELETE FROM memories WHERE metadata->>'source' = 'test';
DELETE FROM memories WHERE metadata->>'source' = 'quick_test';
DELETE FROM memories WHERE metadata->>'source' = 'rpc_test';

-- Verify cleanup
SELECT COUNT(*) FROM memories WHERE metadata->>'source' IN ('test', 'quick_test', 'rpc_test');
```

---

## Understanding Test Results

### Mock Embeddings

The tests use **deterministic mock embeddings** instead of real OpenAI embeddings. This means:

- ✅ Tests run without OpenAI API costs
- ✅ Embeddings are consistent for the same text
- ✅ Vector search functionality is verified
- ⚠️  Similarity scores are not semantically meaningful

**For production:** You'll need to integrate real OpenAI embeddings (Phase 3).

### Similarity Scores

When you see results like `[85.23% match]`, this is based on mock embeddings. Real OpenAI embeddings would provide semantically meaningful similarity scores.

---

## Next Steps After Tests Pass

1. ✅ Tests pass → Your database setup is correct
2. ✅ Tools are registered → Ready to use in MCP clients
3. 🔜 Try the tools via MCP Inspector
4. 🔜 Test with your MCP client (Claude Desktop, etc.)
5. 🔜 (Future) Integrate real OpenAI embeddings for production

---

## Getting Help

If tests still fail after trying these solutions:

1. Check the full error message
2. Verify each prerequisite is complete
3. Look for similar issues in the troubleshooting sections
4. Ensure Supabase project is active (not paused)

---

## Test Architecture

```
Test Files
├── quick-memory-test.ts        → Fast smoke test (5 operations)
└── memory-integration.test.ts  → Comprehensive test suite (12 tests)

Both import from
↓
dist/services/memory.js         → Compiled MemoryService
↓
Calls Supabase RPC functions
↓
PostgreSQL with pgvector        → Database operations
```

---

## Environment Variable Template

Copy this to your `.env` file:

```bash
# Supabase Configuration
# Get these from: https://app.supabase.com/project/_/settings/api

SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Optional: For future OpenAI integration (Phase 3)
# OPENAI_API_KEY=sk-...
```

---

## Success Checklist

Before running tests, verify:

- [ ] `.env` file exists with correct values
- [ ] Supabase project is active
- [ ] pgvector extension is enabled
- [ ] schema.sql has been run successfully
- [ ] `npm install` completed
- [ ] `npm run build` succeeds

Then run:
```bash
./run-tests.sh
```

If all tests pass: **🎉 Your mem0 integration is working correctly!**
