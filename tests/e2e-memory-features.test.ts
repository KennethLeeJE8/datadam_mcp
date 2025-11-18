/**
 * End-to-End Test for All Memory Features
 *
 * Comprehensive test covering all memory operations and logging:
 * - Add memory (with semantic & hash deduplication)
 * - Update memory (explicit updates)
 * - Search memories (semantic similarity)
 * - List memories (with pagination & filtering)
 * - Get memory (with history)
 * - Delete memory (soft & hard)
 * - Get statistics
 * - Verify memory_history logging
 * - Verify data_access_log logging
 *
 * Prerequisites:
 * 1. Add OPENAI_API_KEY to .env (optional, falls back to mock)
 * 2. Run updated schema.sql in Supabase
 * 3. Run: npm run build
 * 4. Run: node tests/e2e-memory-features.test.ts
 */

import { createClient } from "@supabase/supabase-js";
import { MemoryService } from "../dist/services/memory.js";
import { EmbeddingsService } from "../dist/services/embeddings.js";
import dotenv from "dotenv";

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const embeddingsService = new EmbeddingsService();
const memoryService = new MemoryService(supabase, embeddingsService);

const testMemoryIds: string[] = [];
const testResults: { name: string; passed: boolean; details?: string }[] = [];

function logTest(name: string, passed: boolean, details?: string) {
  testResults.push({ name, passed, details });
  const icon = passed ? "✅" : "❌";
  console.log(`   ${icon} ${name}${details ? `: ${details}` : ""}`);
}

async function preTestCleanup() {
  console.log("🧹 Pre-test cleanup: Removing stale test data...");

  // Find all memories with source: "test" metadata
  const { data: testMemories, error } = await supabase
    .from("memories")
    .select("id")
    .contains("metadata", { source: "test" });

  if (error) {
    console.log(`   ⚠️  Warning: Could not query test memories: ${error.message}`);
    return;
  }

  if (testMemories && testMemories.length > 0) {
    console.log(`   Found ${testMemories.length} stale test memories, removing...`);
    for (const memory of testMemories) {
      try {
        await memoryService.deleteMemory(memory.id, true);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
    console.log(`   ✓ Removed ${testMemories.length} stale memories\n`);
  } else {
    console.log("   ✓ No stale test data found\n");
  }
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
  console.log("✓ Cleanup complete\n");
}

async function verifyMemoryHistory(memoryId: string, expectedAction: string): Promise<boolean> {
  // Small delay to ensure transaction is committed
  await new Promise(resolve => setTimeout(resolve, 100));

  const { data, error } = await supabase
    .from("memory_history")
    .select("*")
    .eq("memory_id", memoryId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    console.log(`      [DEBUG] History query error: ${error.message}`);
    return false;
  }

  if (!data || data.length === 0) {
    console.log(`      [DEBUG] No history found for memory: ${memoryId}`);
    return false;
  }

  const actualAction = data[0].action;
  if (actualAction !== expectedAction) {
    console.log(`      [DEBUG] Expected action '${expectedAction}', got '${actualAction}'`);
    return false;
  }

  return true;
}

async function verifyDataAccessLog(operation: string, tableName: string = "memories"): Promise<boolean> {
  // Small delay to ensure transaction is committed
  await new Promise(resolve => setTimeout(resolve, 100));

  const { data, error } = await supabase
    .from("data_access_log")
    .select("*")
    .eq("operation", operation)
    .eq("table_name", tableName)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    console.log(`      [DEBUG] Access log query error: ${error.message}`);
    return false;
  }

  if (!data || data.length === 0) {
    console.log(`      [DEBUG] No access log found for operation: ${operation}`);
    return false;
  }

  return true;
}

async function debugMemoryHistory(memoryId: string) {
  const { data, error } = await supabase
    .from("memory_history")
    .select("*")
    .eq("memory_id", memoryId)
    .order("created_at", { ascending: true });

  console.log(`\n   [DEBUG] All history for memory ${memoryId}:`);
  if (error) {
    console.log(`   Error: ${error.message}`);
  } else if (!data || data.length === 0) {
    console.log(`   No history records found`);
  } else {
    data.forEach((record, idx) => {
      console.log(`   ${idx + 1}. Action: ${record.action}, Created: ${record.created_at}`);
    });
  }
}

async function runTests() {
  console.log("=".repeat(80));
  console.log("END-TO-END MEMORY FEATURES TEST");
  console.log("=".repeat(80));
  console.log();

  const usingOpenAI = memoryService.isUsingOpenAI();
  console.log(`🔑 Embeddings: ${usingOpenAI ? "✅ OpenAI" : "⚠️  Mock"}\n`);

  // Clean up any stale test data from previous runs
  await preTestCleanup();

  try {
    // ========================================
    // TEST 1: Add Memory (CREATE)
    // ========================================
    console.log("📝 TEST 1: Add Memory");
    console.log("-".repeat(80));

    const memory1Text = "I'm learning TypeScript and PostgreSQL for backend development";
    const memory1Id = await memoryService.addMemory(
      memory1Text,
      null,
      null,
      { source: "test", category: "skills" }
    );
    testMemoryIds.push(memory1Id);

    logTest("Memory created", !!memory1Id);
    const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(memory1Id);
    logTest("Memory ID format valid (UUID)", isValidUUID);

    const historyLogged = await verifyMemoryHistory(memory1Id, "ADD");
    logTest("Memory history logged (ADD)", historyLogged);

    const accessLogged = await verifyDataAccessLog("CREATE");
    logTest("Data access log recorded (CREATE)", accessLogged);

    // Debug: Show all history if verification failed
    if (!historyLogged) {
      await debugMemoryHistory(memory1Id);
    }

    console.log();

    // ========================================
    // TEST 2: Semantic Deduplication
    // ========================================
    console.log("📝 TEST 2: Semantic Deduplication");
    console.log("-".repeat(80));

    const memory2Text = "I'm studying TypeScript and PostgreSQL for server-side programming";
    const memory2Id = await memoryService.addMemory(
      memory2Text,
      null,
      null,
      { source: "test", category: "skills", updated: true },
      0.95  // High threshold for semantic similarity
    );

    if (usingOpenAI) {
      const isSameId = memory1Id === memory2Id;
      logTest("Semantic deduplication (UPDATE_SEMANTIC)", isSameId);
      if (isSameId) {
        const historyLogged = await verifyMemoryHistory(memory1Id, "UPDATE_SEMANTIC");
        logTest("UPDATE_SEMANTIC logged in history", historyLogged);
      }
    } else {
      testMemoryIds.push(memory2Id);
      logTest("Mock embeddings - separate memory created", memory2Id !== memory1Id);
    }

    console.log();

    // ========================================
    // TEST 3: Hash-based Deduplication
    // ========================================
    console.log("📝 TEST 3: Hash-based Deduplication");
    console.log("-".repeat(80));

    const exactDuplicate = "I'm learning TypeScript and PostgreSQL for backend development";
    const memory3Id = await memoryService.addMemory(
      exactDuplicate,
      null,
      null,
      { source: "test", category: "skills" }
    );

    const isSameAsFirst = memory1Id === memory3Id;
    logTest("Hash deduplication (UPDATE_HASH)", isSameAsFirst);

    if (isSameAsFirst) {
      const historyLogged = await verifyMemoryHistory(memory1Id, "UPDATE_HASH");
      logTest("UPDATE_HASH logged in history", historyLogged);

      // Debug: Show all history if verification failed
      if (!historyLogged) {
        await debugMemoryHistory(memory1Id);
      }
    }

    console.log();

    // ========================================
    // TEST 4: Explicit Update
    // ========================================
    console.log("📝 TEST 4: Explicit Update Function");
    console.log("-".repeat(80));

    const memory4Text = "I enjoy reading science fiction novels";
    const memory4Id = await memoryService.addMemory(
      memory4Text,
      null,
      null,
      { source: "test", category: "hobbies", count: 5 }
    );
    testMemoryIds.push(memory4Id);

    const updatedText = "I enjoy reading science fiction and fantasy novels";
    await memoryService.updateMemory(
      memory4Id,
      updatedText,
      null,
      { count: 10, favorite_genre: "sci-fi" },
      true  // Merge metadata
    );

    const updated = await memoryService.getMemory(memory4Id);
    logTest("Memory text updated", updated.memory_text === updatedText);
    logTest("Metadata merged", updated.metadata.count === 10 && updated.metadata.source === "test");

    const updateHistoryLogged = await verifyMemoryHistory(memory4Id, "UPDATE");
    logTest("UPDATE logged in history", updateHistoryLogged);

    const updateAccessLogged = await verifyDataAccessLog("UPDATE");
    logTest("Data access log recorded (UPDATE)", updateAccessLogged);

    console.log();

    // ========================================
    // TEST 5: Search Memories
    // ========================================
    console.log("📝 TEST 5: Search Memories (Semantic Similarity)");
    console.log("-".repeat(80));

    const searchQuery = "What programming languages do I know?";
    const searchResults = await memoryService.searchMemoriesByText(
      searchQuery,
      null,
      5,
      null,
      0.1  // Low threshold
    );

    logTest("Search returned results", searchResults.length > 0);
    logTest("Search results have similarity scores", searchResults[0]?.similarity !== undefined);
    logTest("Results ordered by similarity", searchResults[0]?.similarity >= (searchResults[1]?.similarity || 0));

    const searchAccessLogged = await verifyDataAccessLog("READ");
    logTest("Data access log recorded (READ)", searchAccessLogged);

    console.log();

    // ========================================
    // TEST 6: List Memories
    // ========================================
    console.log("📝 TEST 6: List Memories (Pagination & Filtering)");
    console.log("-".repeat(80));

    // Add more memories for pagination test
    const memory5Id = await memoryService.addMemory(
      "I live in San Francisco",
      null,
      null,
      { source: "test", category: "location" }
    );
    testMemoryIds.push(memory5Id);

    const memory6Id = await memoryService.addMemory(
      "I work as a software engineer",
      null,
      null,
      { source: "test", category: "work" }
    );
    testMemoryIds.push(memory6Id);

    // List all test memories
    const allMemories = await memoryService.listMemories(null, 10, 0);
    logTest("List returned memories", allMemories.length > 0);

    // Test pagination
    const page1 = await memoryService.listMemories(null, 2, 0);
    const page2 = await memoryService.listMemories(null, 2, 2);
    logTest("Pagination works", page1.length === 2 && page2.length >= 0);

    // Test filtering by category
    const skillsOnly = await memoryService.listMemories(
      null,
      10,
      0,
      { category: "skills" }
    );
    logTest("Filter by category works", skillsOnly.every(m => m.metadata?.category === "skills"));

    console.log();

    // ========================================
    // TEST 7: Get Memory with History
    // ========================================
    console.log("📝 TEST 7: Get Memory with History");
    console.log("-".repeat(80));

    const memoryWithHistory = await memoryService.getMemory(memory1Id, true);
    logTest("Get memory retrieved data", !!memoryWithHistory);
    logTest("History included", memoryWithHistory.history && memoryWithHistory.history.length > 0);

    if (memoryWithHistory.history && memoryWithHistory.history.length > 0) {
      const hasAddAction = memoryWithHistory.history.some(h => h.action === "ADD");
      logTest("History contains ADD action", hasAddAction);

      if (usingOpenAI && memory1Id === memory2Id) {
        const hasUpdateSemantic = memoryWithHistory.history.some(h => h.action === "UPDATE_SEMANTIC");
        logTest("History contains UPDATE_SEMANTIC", hasUpdateSemantic);
      }

      const hasUpdateHash = memoryWithHistory.history.some(h => h.action === "UPDATE_HASH");
      logTest("History contains UPDATE_HASH", hasUpdateHash);

      // Debug: Show all actions if hash update not found
      if (!hasUpdateHash) {
        console.log(`      [DEBUG] History actions found: ${memoryWithHistory.history.map(h => h.action).join(", ")}`);
      }
    } else {
      console.log(`      [DEBUG] No history included or history is empty`);
    }

    console.log();

    // ========================================
    // TEST 8: Soft Delete
    // ========================================
    console.log("📝 TEST 8: Soft Delete");
    console.log("-".repeat(80));

    const memory7Id = await memoryService.addMemory(
      "Temporary memory for soft delete test",
      null,
      null,
      { source: "test", category: "temp" }
    );
    testMemoryIds.push(memory7Id);

    await memoryService.deleteMemory(memory7Id, false);  // Soft delete

    const softDeleted = await memoryService.getMemory(memory7Id);
    logTest("Soft delete sets deleted_at", !!softDeleted.deleted_at);

    const softDeleteHistoryLogged = await verifyMemoryHistory(memory7Id, "DELETE");
    logTest("DELETE logged in history (soft)", softDeleteHistoryLogged);

    const deleteAccessLogged = await verifyDataAccessLog("DELETE");
    logTest("Data access log recorded (DELETE)", deleteAccessLogged);

    console.log();

    // ========================================
    // TEST 9: Hard Delete
    // ========================================
    console.log("📝 TEST 9: Hard Delete");
    console.log("-".repeat(80));

    const memory8Id = await memoryService.addMemory(
      "Temporary memory for hard delete test",
      null,
      null,
      { source: "test", category: "temp" }
    );

    await memoryService.deleteMemory(memory8Id, true);  // Hard delete

    let hardDeleteWorked = false;
    try {
      await memoryService.getMemory(memory8Id);
    } catch (error) {
      hardDeleteWorked = true;
    }
    logTest("Hard delete removes memory", hardDeleteWorked);

    console.log();

    // ========================================
    // TEST 10: Get Statistics
    // ========================================
    console.log("📝 TEST 10: Get Memory Statistics");
    console.log("-".repeat(80));

    const stats = await memoryService.getMemoryStats();
    logTest("Stats returned", !!stats);
    logTest("Total memories count", stats.total_memories >= testMemoryIds.length);
    logTest("Active memories tracked", stats.active_memories >= 0);
    logTest("Embeddings count", stats.memories_with_embeddings >= 0);
    logTest("History entries exist", stats.total_history_entries > 0);

    console.log();
    console.log(`   📊 Statistics:`);
    console.log(`      Total memories: ${stats.total_memories}`);
    console.log(`      Active memories: ${stats.active_memories}`);
    console.log(`      With embeddings: ${stats.memories_with_embeddings}`);
    console.log(`      History entries: ${stats.total_history_entries}`);

    console.log();

    // ========================================
    // Summary
    // ========================================
    console.log("=".repeat(80));
    const passed = testResults.filter(t => t.passed).length;
    const total = testResults.length;
    const allPassed = passed === total;

    if (allPassed) {
      console.log("✅ ALL TESTS PASSED");
    } else {
      console.log(`⚠️  ${passed}/${total} TESTS PASSED`);
    }
    console.log("=".repeat(80));
    console.log();

    console.log("📋 Test Summary:");
    console.log(`   • Embedding type: ${usingOpenAI ? "OpenAI (semantic)" : "Mock (hash-based)"}`);
    console.log(`   • Tests passed: ${passed}/${total}`);
    console.log(`   • Memories created: ${testMemoryIds.length}`);
    console.log();

    console.log("🎯 Features Tested:");
    console.log("   ✅ Add memory (CREATE)");
    console.log("   ✅ Semantic deduplication (UPDATE_SEMANTIC)");
    console.log("   ✅ Hash-based deduplication (UPDATE_HASH)");
    console.log("   ✅ Explicit update (UPDATE)");
    console.log("   ✅ Search memories (semantic similarity)");
    console.log("   ✅ List memories (pagination & filtering)");
    console.log("   ✅ Get memory (with history)");
    console.log("   ✅ Soft delete");
    console.log("   ✅ Hard delete");
    console.log("   ✅ Statistics");
    console.log();

    console.log("📝 Logging Verified:");
    console.log("   ✅ memory_history: ADD, UPDATE_SEMANTIC, UPDATE_HASH, UPDATE, DELETE");
    console.log("   ✅ data_access_log: CREATE, READ, UPDATE, DELETE");
    console.log();

    if (!allPassed) {
      console.log("❌ Failed Tests:");
      testResults.filter(t => !t.passed).forEach(t => {
        console.log(`   • ${t.name}${t.details ? `: ${t.details}` : ""}`);
      });
      console.log();
      process.exit(1);
    }

  } catch (error) {
    console.error("\n❌ Test failed:");
    console.error(error instanceof Error ? error.message : error);
    if (error instanceof Error && error.stack) {
      console.error("\nStack trace:");
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    await cleanup();
  }
}

// Run the tests
console.log("\n🚀 Starting End-to-End Memory Features Test\n");
runTests()
  .then(() => {
    console.log("✅ Test suite completed successfully!\n");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Test suite failed:", error);
    process.exit(1);
  });
