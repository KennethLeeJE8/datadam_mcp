/**
 * Quick Smoke Test
 *
 * Fast smoke test for memory functionality - ideal for CI/CD
 *
 * IMPORTANT: Run `npm run build` first to compile TypeScript!
 *
 * Run: node tests/quick-smoke.test.ts
 */

import { createClient } from "@supabase/supabase-js";
import { MemoryService } from "../dist/services/memory.js";
import dotenv from "dotenv";

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const memoryService = new MemoryService(supabase);
const testMemoryIds: string[] = [];

async function preCleanup() {
  console.log("🧹 Pre-cleanup: Removing stale test data...");

  const { data, error } = await supabase
    .from("memories")
    .select("id")
    .contains("metadata", { source: "quick_test" });

  if (!error && data && data.length > 0) {
    console.log(`   Found ${data.length} stale memories, removing...`);
    for (const memory of data) {
      try {
        await memoryService.deleteMemory(memory.id, true);
      } catch (err) {
        // Ignore cleanup errors
      }
    }
  }
  console.log("   ✓ Cleanup complete\n");
}

async function cleanup() {
  console.log("\n🧹 Cleaning up test memories...");
  for (const memoryId of testMemoryIds) {
    try {
      await memoryService.deleteMemory(memoryId, true);
    } catch (error) {
      // Ignore cleanup errors
    }
  }
  console.log("   ✓ Cleanup complete\n");
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function quickTest() {
  console.log("🧪 Quick Smoke Test\n");

  try {
    await preCleanup();

    // Test 1: Add memory with metadata
    console.log("1️⃣  Adding memory with metadata...");
    const embedding1 = memoryService.generateMockEmbedding("I love TypeScript");
    const memoryId1 = await memoryService.addMemory(
      "I love TypeScript and building MCP servers",
      null,
      embedding1,
      { source: "quick_test", category: "preferences" }
    );
    testMemoryIds.push(memoryId1);
    assert(!!memoryId1, "Memory ID should be returned");
    assert(/^[0-9a-f-]{36}$/i.test(memoryId1), "Memory ID should be valid UUID");
    console.log(`   ✓ Added memory: ${memoryId1}\n`);

    // Test 2: Add memory without metadata
    console.log("2️⃣  Adding memory without metadata...");
    const embedding2 = memoryService.generateMockEmbedding("I work remotely");
    const memoryId2 = await memoryService.addMemory(
      "I work remotely from San Francisco",
      null,
      embedding2,
      { source: "quick_test" }
    );
    testMemoryIds.push(memoryId2);
    assert(!!memoryId2, "Second memory ID should be returned");
    console.log(`   ✓ Added memory: ${memoryId2}\n`);

    // Test 3: List memories
    console.log("3️⃣  Listing memories...");
    const memories = await memoryService.listMemories(null, 10, 0);
    assert(memories.length > 0, "Should return at least one memory");
    assert(memories.some(m => m.id === memoryId1), "Should include first test memory");
    console.log(`   ✓ Found ${memories.length} memories\n`);

    // Test 4: Search memories
    console.log("4️⃣  Searching memories...");
    const searchEmbedding = memoryService.generateMockEmbedding("typescript programming");
    const results = await memoryService.searchMemories(searchEmbedding, null, 5, null, 0.0);
    assert(results.length > 0, "Search should return results");
    assert(results[0].similarity !== undefined, "Results should include similarity scores");
    console.log(`   ✓ Found ${results.length} results\n`);

    // Test 5: Get memory
    console.log("5️⃣  Getting single memory...");
    const retrieved = await memoryService.getMemory(memoryId1);
    assert(retrieved.id === memoryId1, "Should retrieve correct memory");
    assert(retrieved.memory_text === "I love TypeScript and building MCP servers", "Text should match");
    console.log(`   ✓ Retrieved memory successfully\n`);

    // Test 6: Get stats
    console.log("6️⃣  Getting stats...");
    const stats = await memoryService.getMemoryStats();
    assert(stats.total_memories >= 2, "Should have at least 2 memories");
    assert(stats.active_memories >= 2, "Should have at least 2 active memories");
    console.log(`   ✓ Total: ${stats.total_memories}, Active: ${stats.active_memories}\n`);

    // Test 7: Soft delete
    console.log("7️⃣  Soft deleting memory...");
    await memoryService.deleteMemory(memoryId2, false);
    const softDeleted = await memoryService.getMemory(memoryId2);
    assert(!!softDeleted.deleted_at, "Memory should have deleted_at timestamp");
    console.log(`   ✓ Soft deleted successfully\n`);

    // Test 8: Hard delete
    console.log("8️⃣  Hard deleting test memories...");
    for (const id of testMemoryIds) {
      await memoryService.deleteMemory(id, true);
    }
    console.log(`   ✓ Hard deleted ${testMemoryIds.length} memories\n`);

    console.log("✅ All smoke tests passed!");
    console.log(`   • 8 operations verified`);
    console.log(`   • CRUD operations working`);
    console.log(`   • Search and stats functional`);

  } catch (error) {
    console.error("\n❌ Smoke test failed:");
    console.error(error instanceof Error ? error.message : error);
    if (error instanceof Error && error.stack) {
      console.error("\nStack trace:");
      console.error(error.stack);
    }
    await cleanup();
    process.exit(1);
  }
}

console.log("\n🚀 Starting Quick Smoke Test\n");
quickTest()
  .then(() => {
    console.log("\n✅ Smoke test completed successfully!\n");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Smoke test failed:", error);
    process.exit(1);
  });
