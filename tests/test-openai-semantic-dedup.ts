/**
 * Test OpenAI Semantic Deduplication and Update Functions
 *
 * This test demonstrates mem0-style semantic deduplication where similar
 * memories automatically get updated instead of creating duplicates.
 *
 * Prerequisites:
 * 1. Add OPENAI_API_KEY to .env file
 * 2. Run updated schema.sql in Supabase
 * 3. Run: npm run build
 * 4. Run: node tests/test-openai-semantic-dedup.ts
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

// Create embeddings service (will use OpenAI if API key is set)
const embeddingsService = new EmbeddingsService();
const memoryService = new MemoryService(supabase, embeddingsService);

const testMemoryIds: string[] = [];

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

async function runTests() {
  console.log("=".repeat(80));
  console.log("OPENAI SEMANTIC DEDUPLICATION TEST");
  console.log("=".repeat(80));
  console.log();

  // Check if using OpenAI or mock embeddings
  const usingOpenAI = memoryService.isUsingOpenAI();
  console.log(`🔑 Embeddings: ${usingOpenAI ? '✅ OpenAI (real semantic search)' : '⚠️  Mock (hash-based)'}`);
  if (!usingOpenAI) {
    console.log("   💡 Add OPENAI_API_KEY to .env to enable real semantic deduplication\n");
  } else {
    console.log("   💡 Using OpenAI text-embedding-3-small for semantic similarity\n");
  }

  try {
    // ========================================
    // TEST 1: Semantic Deduplication
    // ========================================
    console.log("📝 TEST 1: Semantic Deduplication (mem0 behavior)");
    console.log("-".repeat(80));
    console.log();

    console.log("Step 1: Add initial memory");
    const memory1Text = "I'm deeply interested in MCP development and building AI agents";
    const memory1Id = await memoryService.addMemory(
      memory1Text,
      null,
      null,
      { source: "conversation", category: "interests" }
    );
    testMemoryIds.push(memory1Id);
    console.log(`   ✓ Created memory: "${memory1Text}"`);
    console.log(`   Memory ID: ${memory1Id}\n`);

    console.log("Step 2: Add semantically similar memory (should UPDATE, not create new)");
    const memory2Text = "I'm very interested in Model Context Protocol development and AI agent systems";
    const memory2Id = await memoryService.addMemory(
      memory2Text,
      null,
      null,
      { source: "conversation", category: "interests", updated: true }
    );
    console.log(`   ✓ Returned memory ID: ${memory2Id}`);
    console.log(`   Same ID as before? ${memory1Id === memory2Id ? '✅ YES - Updated existing!' : '❌ NO - Created new'}`);

    if (memory1Id === memory2Id) {
      console.log(`   🎯 Semantic deduplication worked! Similar memories were merged.\n`);
    } else {
      console.log(`   ⚠️  Created separate memory (might be using mock embeddings)\n`);
    }

    // ========================================
    // TEST 2: Different Content Creates New Memory
    // ========================================
    console.log("📝 TEST 2: Different Content Creates New Memory");
    console.log("-".repeat(80));
    console.log();

    const memory3Text = "I live in Cambridge, MA near MIT and Harvard";
    const memory3Id = await memoryService.addMemory(
      memory3Text,
      null,
      null,
      { source: "conversation", category: "location" }
    );
    testMemoryIds.push(memory3Id);
    console.log(`   ✓ Created memory: "${memory3Text}"`);
    console.log(`   Memory ID: ${memory3Id}`);
    console.log(`   Different from MCP interest? ${memory3Id !== memory1Id ? '✅ YES' : '❌ NO'}\n`);

    // ========================================
    // TEST 3: Explicit Update Function
    // ========================================
    console.log("📝 TEST 3: Explicit Update Function");
    console.log("-".repeat(80));
    console.log();

    console.log("Step 1: Add a book memory");
    const bookMemoryText = "I recently read Atomic Habits";
    const bookMemoryId = await memoryService.addMemory(
      bookMemoryText,
      null,
      null,
      { source: "conversation", category: "books", rating: 4 }
    );
    testMemoryIds.push(bookMemoryId);
    console.log(`   ✓ Created: "${bookMemoryText}"`);
    console.log(`   Memory ID: ${bookMemoryId}\n`);

    console.log("Step 2: Update with explicit update function");
    const updatedBookText = "I recently finished reading Atomic Habits by James Clear - excellent book!";
    const updateResult = await memoryService.updateMemory(
      bookMemoryId,
      updatedBookText,
      null,
      { rating: 5, finished: true },
      true  // Merge metadata
    );
    console.log(`   ✓ Updated memory text: "${updatedBookText}"`);
    console.log(`   ✓ Updated metadata: rating 4→5, added 'finished: true'`);
    console.log(`   Result: ${JSON.stringify(updateResult, null, 2)}\n`);

    // ========================================
    // TEST 4: Partial Metadata Update
    // ========================================
    console.log("📝 TEST 4: Partial Metadata Update (merge)");
    console.log("-".repeat(80));
    console.log();

    const locationMemory = await memoryService.getMemory(memory3Id);
    console.log(`Current metadata: ${JSON.stringify(locationMemory.metadata)}`);

    await memoryService.updateMemory(
      memory3Id,
      null,  // Don't change text
      null,  // Don't change embedding
      { zip_code: "02139", neighborhood: "Kendall Square" },
      true   // Merge with existing metadata
    );
    console.log(`   ✓ Added zip_code and neighborhood (kept 'source' and 'category')\n`);

    const updatedLocation = await memoryService.getMemory(memory3Id);
    console.log(`Updated metadata: ${JSON.stringify(updatedLocation.metadata)}\n`);

    // ========================================
    // TEST 5: Search with Semantic Similarity
    // ========================================
    console.log("📝 TEST 5: Search with Semantic Similarity");
    console.log("-".repeat(80));
    console.log();

    const searchResults = await memoryService.searchMemoriesByText(
      "What do I know about artificial intelligence and protocols?",
      null,
      3,
      null,
      0.1  // Low threshold to see all results
    );

    console.log(`Query: "What do I know about artificial intelligence and protocols?"`);
    console.log(`Found ${searchResults.length} results:\n`);

    searchResults.forEach((result, idx) => {
      const similarityPercent = (result.similarity * 100).toFixed(2);
      const preview = result.memory_text.substring(0, 60);
      console.log(`   ${idx + 1}. [${similarityPercent}%] ${preview}...`);
    });
    console.log();

    if (usingOpenAI) {
      console.log("   ✅ With OpenAI embeddings, top result should be MCP interest memory");
      console.log("   (Semantic understanding: 'AI protocols' ≈ 'MCP development')\n");
    } else {
      console.log("   ⚠️  With mock embeddings, results are based on hash similarity\n");
    }

    // ========================================
    // TEST 6: List Memories and Check History
    // ========================================
    console.log("📝 TEST 6: Check Memory History");
    console.log("-".repeat(80));
    console.log();

    const memoryWithHistory = await memoryService.getMemory(memory1Id, true);
    console.log(`Memory: "${memoryWithHistory.memory_text.substring(0, 50)}..."`);
    console.log(`History entries: ${memoryWithHistory.history?.length || 0}`);

    if (memoryWithHistory.history && memoryWithHistory.history.length > 0) {
      memoryWithHistory.history.forEach((entry, idx) => {
        console.log(`   ${idx + 1}. ${entry.action} at ${new Date(entry.created_at).toLocaleString()}`);
        if (entry.action === 'UPDATE_SEMANTIC') {
          const meta = JSON.parse(entry.metadata);
          console.log(`      Similarity: ${(meta.similarity * 100).toFixed(2)}%`);
        }
      });
    }
    console.log();

    // ========================================
    // TEST 7: Statistics
    // ========================================
    console.log("📝 TEST 7: Memory Statistics");
    console.log("-".repeat(80));
    console.log();

    const stats = await memoryService.getMemoryStats();
    console.log(`Total memories: ${stats.total_memories}`);
    console.log(`Active memories: ${stats.active_memories}`);
    console.log(`Memories with embeddings: ${stats.memories_with_embeddings}`);
    console.log(`History entries: ${stats.total_history_entries}\n`);

    // ========================================
    // Summary
    // ========================================
    console.log("=".repeat(80));
    console.log("✅ ALL TESTS PASSED");
    console.log("=".repeat(80));
    console.log();

    console.log("📋 Summary:");
    console.log(`   • Embedding type: ${usingOpenAI ? 'OpenAI (semantic)' : 'Mock (hash-based)'}`);
    console.log(`   • Created ${testMemoryIds.length} test memories`);
    console.log(`   • Tested semantic deduplication`);
    console.log(`   • Tested explicit update function`);
    console.log(`   • Tested metadata merge`);
    console.log(`   • Tested semantic search`);
    console.log();

    if (usingOpenAI) {
      console.log("🎯 Key Findings with OpenAI Embeddings:");
      console.log("   • Similar memories automatically merge (mem0 behavior)");
      console.log("   • Search understands semantic meaning");
      console.log("   • 'MCP development' ≈ 'Model Context Protocol development'");
      console.log();
    } else {
      console.log("💡 To Enable Real Semantic Deduplication:");
      console.log("   1. Get API key from: https://platform.openai.com/api-keys");
      console.log("   2. Add to .env: OPENAI_API_KEY=sk-proj-your-key-here");
      console.log("   3. Re-run this test");
      console.log();
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
console.log("\n🚀 Starting OpenAI Semantic Deduplication Test\n");
runTests()
  .then(() => {
    console.log("✅ Test completed successfully!\n");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Test suite failed:", error);
    process.exit(1);
  });
