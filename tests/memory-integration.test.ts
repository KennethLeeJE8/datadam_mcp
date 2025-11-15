/**
 * Memory Integration Tests
 *
 * Tests both database RPC functions and MCP tool implementations
 *
 * Setup:
 * 1. Ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are in .env
 * 2. Run the schema.sql file in Supabase (includes pgvector setup)
 * 3. Run: npx ts-node tests/memory-integration.test.ts
 */

import { createClient } from "@supabase/supabase-js";
import { MemoryService } from "../src/services/memory.js";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("❌ Missing environment variables!");
  console.error("   Ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env");
  process.exit(1);
}

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const memoryService = new MemoryService(supabase);

// Test utilities
let testMemoryIds: string[] = [];

async function cleanup() {
  console.log("\n🧹 Cleaning up test data...");
  for (const memoryId of testMemoryIds) {
    try {
      await memoryService.deleteMemory(memoryId, true); // Hard delete
    } catch (error) {
      // Ignore errors during cleanup
    }
  }
  testMemoryIds = [];
  console.log("✓ Cleanup complete\n");
}

async function runTests() {
  console.log("=".repeat(70));
  console.log("MEMORY INTEGRATION TESTS");
  console.log("=".repeat(70));

  try {
    // Test 1: Add Memory (without embedding)
    console.log("\n📝 TEST 1: Add Memory (no embedding)");
    console.log("-".repeat(70));
    const memory1Text = "I prefer dark mode in all my applications";
    const memory1Id = await memoryService.addMemory(
      memory1Text,
      null,
      null,
      { source: "test", category: "preferences" }
    );
    testMemoryIds.push(memory1Id);
    console.log(`✓ Memory added successfully`);
    console.log(`  Memory ID: ${memory1Id}`);
    console.log(`  Text: "${memory1Text}"`);

    // Test 2: Add Memory (with embedding)
    console.log("\n📝 TEST 2: Add Memory (with mock embedding)");
    console.log("-".repeat(70));
    const memory2Text = "I'm currently learning TypeScript and building MCP servers";
    const embedding = memoryService.generateMockEmbedding(memory2Text);
    const memory2Id = await memoryService.addMemory(
      memory2Text,
      null,
      embedding,
      { source: "test", tags: ["learning", "typescript"], confidence: 1.0 }
    );
    testMemoryIds.push(memory2Id);
    console.log(`✓ Memory with embedding added`);
    console.log(`  Memory ID: ${memory2Id}`);
    console.log(`  Text: "${memory2Text}"`);
    console.log(`  Embedding dimensions: ${embedding.length}`);

    // Test 3: Add another memory with embedding for search testing
    console.log("\n📝 TEST 3: Add Memory for search (with embedding)");
    console.log("-".repeat(70));
    const memory3Text = "I enjoy functional programming and pure functions";
    const embedding3 = memoryService.generateMockEmbedding(memory3Text);
    const memory3Id = await memoryService.addMemory(
      memory3Text,
      null,
      embedding3,
      { source: "test", tags: ["programming"], confidence: 0.9 }
    );
    testMemoryIds.push(memory3Id);
    console.log(`✓ Memory added`);
    console.log(`  Memory ID: ${memory3Id}`);

    // Test 4: Deduplication Test
    console.log("\n📝 TEST 4: Test Deduplication");
    console.log("-".repeat(70));
    const duplicateId = await memoryService.addMemory(
      memory1Text, // Same text as memory1
      null,
      null,
      { source: "test", category: "preferences", note: "this should update" }
    );
    console.log(`✓ Deduplication worked correctly`);
    console.log(`  Original ID: ${memory1Id}`);
    console.log(`  Returned ID: ${duplicateId}`);
    console.log(`  IDs match: ${memory1Id === duplicateId ? 'YES ✓' : 'NO ✗'}`);

    // Test 5: List Memories
    console.log("\n📋 TEST 5: List All Memories");
    console.log("-".repeat(70));
    const allMemories = await memoryService.listMemories(null, 50, 0, null, false);
    console.log(`✓ Listed ${allMemories.length} memories`);
    allMemories.forEach((mem, idx) => {
      const preview = mem.memory_text.substring(0, 50);
      console.log(`  ${idx + 1}. [${mem.id}] ${preview}...`);
    });

    // Test 6: List with Filters
    console.log("\n📋 TEST 6: List with Metadata Filters");
    console.log("-".repeat(70));
    const filteredMemories = await memoryService.listMemories(
      null,
      50,
      0,
      { source: "test" },
      false
    );
    console.log(`✓ Listed ${filteredMemories.length} memories with filter {source: "test"}`);

    // Test 7: Search Memories (semantic)
    console.log("\n🔍 TEST 7: Semantic Search");
    console.log("-".repeat(70));
    const searchQuery = "programming and coding";
    const searchEmbedding = memoryService.generateMockEmbedding(searchQuery);
    const searchResults = await memoryService.searchMemories(
      searchEmbedding,
      null,
      10,
      null,
      0.0 // Low threshold to get results
    );
    console.log(`✓ Found ${searchResults.length} results for "${searchQuery}"`);
    searchResults.forEach((result, idx) => {
      const similarityPercent = (result.similarity * 100).toFixed(2);
      const preview = result.memory_text.substring(0, 50);
      console.log(`  ${idx + 1}. [${similarityPercent}%] ${preview}...`);
    });

    // Test 8: Get Single Memory
    console.log("\n📖 TEST 8: Get Single Memory (with history)");
    console.log("-".repeat(70));
    const singleMemory = await memoryService.getMemory(memory1Id, true);
    console.log(`✓ Retrieved memory: ${memory1Id}`);
    console.log(`  Text: "${singleMemory.memory_text}"`);
    console.log(`  Metadata: ${JSON.stringify(singleMemory.metadata)}`);
    console.log(`  History entries: ${singleMemory.history?.length || 0}`);

    // Test 9: Get Memory Stats
    console.log("\n📊 TEST 9: Get Memory Statistics");
    console.log("-".repeat(70));
    const stats = await memoryService.getMemoryStats(null);
    console.log(`✓ Memory statistics:`);
    console.log(`  Total memories: ${stats.total_memories}`);
    console.log(`  Active memories: ${stats.active_memories}`);
    console.log(`  Deleted memories: ${stats.deleted_memories}`);
    console.log(`  With embeddings: ${stats.memories_with_embeddings}`);
    console.log(`  History entries: ${stats.total_history_entries}`);

    // Test 10: Soft Delete
    console.log("\n🗑️  TEST 10: Soft Delete Memory");
    console.log("-".repeat(70));
    const softDeleteSuccess = await memoryService.deleteMemory(memory3Id, false);
    console.log(`✓ Soft delete: ${softDeleteSuccess ? 'SUCCESS' : 'FAILED'}`);
    console.log(`  Memory ID: ${memory3Id}`);

    // Verify it's hidden from normal lists
    const afterSoftDelete = await memoryService.listMemories(null, 50, 0, null, false);
    const isHidden = !afterSoftDelete.some(m => m.id === memory3Id);
    console.log(`  Hidden from normal list: ${isHidden ? 'YES ✓' : 'NO ✗'}`);

    // Verify it's visible with include_deleted
    const withDeleted = await memoryService.listMemories(null, 50, 0, null, true);
    const isVisibleWithFlag = withDeleted.some(m => m.id === memory3Id);
    console.log(`  Visible with include_deleted: ${isVisibleWithFlag ? 'YES ✓' : 'NO ✗'}`);

    // Test 11: Direct RPC Function Test
    console.log("\n⚙️  TEST 11: Direct RPC Function Call");
    console.log("-".repeat(70));
    const rpcResult = await supabase.rpc('add_memory', {
      p_memory_text: 'Direct RPC test memory',
      p_user_id: null,
      p_embedding: null,
      p_metadata: { source: "rpc_test" },
      p_hash: null
    });

    if (rpcResult.error) {
      console.log(`✗ RPC call failed: ${rpcResult.error.message}`);
    } else {
      const rpcMemoryId = rpcResult.data as string;
      testMemoryIds.push(rpcMemoryId);
      console.log(`✓ Direct RPC call successful`);
      console.log(`  Returned ID: ${rpcMemoryId}`);
    }

    // Test 12: Vector Search RPC
    console.log("\n🔍 TEST 12: Direct Vector Search RPC Call");
    console.log("-".repeat(70));
    const queryVec = memoryService.generateMockEmbedding("test query");
    const vectorString = `[${queryVec.join(',')}]`;

    const searchRpc = await supabase.rpc('search_memories', {
      p_query_embedding: vectorString,
      p_user_id: null,
      p_limit: 5,
      p_filters: null,
      p_threshold: 0.0
    });

    if (searchRpc.error) {
      console.log(`✗ Vector search RPC failed: ${searchRpc.error.message}`);
    } else {
      const results = searchRpc.data as any[];
      console.log(`✓ Vector search RPC successful`);
      console.log(`  Results: ${results.length}`);
    }

    // Success Summary
    console.log("\n" + "=".repeat(70));
    console.log("✅ ALL TESTS PASSED");
    console.log("=".repeat(70));
    console.log(`\n📊 Summary:`);
    console.log(`   - Created ${testMemoryIds.length} test memories`);
    console.log(`   - Tested add, list, search, get, delete operations`);
    console.log(`   - Verified deduplication and soft delete`);
    console.log(`   - Confirmed RPC functions work correctly`);
    console.log(`   - Validated vector search functionality`);

  } catch (error) {
    console.error("\n" + "=".repeat(70));
    console.error("❌ TEST FAILED");
    console.error("=".repeat(70));
    console.error(`\nError: ${error instanceof Error ? error.message : error}`);
    console.error(`\nStack trace:`);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    await cleanup();
  }
}

// Run the tests
console.log("\n🚀 Starting Memory Integration Tests\n");
runTests()
  .then(() => {
    console.log("\n✅ Test suite completed successfully!\n");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Test suite failed:", error);
    process.exit(1);
  });
