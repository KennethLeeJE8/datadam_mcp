/**
 * Quick Memory Test
 *
 * Fast smoke test for memory functionality
 * Run: npx ts-node tests/quick-memory-test.ts
 */

import { createClient } from "@supabase/supabase-js";
import { MemoryService } from "../src/services/memory.js";
import dotenv from "dotenv";

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const memoryService = new MemoryService(supabase);

async function quickTest() {
  console.log("🧪 Quick Memory Test\n");

  try {
    // Add a memory
    console.log("1️⃣  Adding memory...");
    const embedding = memoryService.generateMockEmbedding("I love TypeScript");
    const memoryId = await memoryService.addMemory(
      "I love TypeScript and building MCP servers",
      null,
      embedding,
      { source: "quick_test" }
    );
    console.log(`   ✓ Added memory: ${memoryId}\n`);

    // List memories
    console.log("2️⃣  Listing memories...");
    const memories = await memoryService.listMemories(null, 5);
    console.log(`   ✓ Found ${memories.length} memories\n`);

    // Search memories
    console.log("3️⃣  Searching memories...");
    const searchEmbedding = memoryService.generateMockEmbedding("typescript");
    const results = await memoryService.searchMemories(searchEmbedding, null, 3, null, 0.0);
    console.log(`   ✓ Found ${results.length} results\n`);

    // Get stats
    console.log("4️⃣  Getting stats...");
    const stats = await memoryService.getMemoryStats();
    console.log(`   ✓ Total: ${stats.total_memories}, Active: ${stats.active_memories}\n`);

    // Delete
    console.log("5️⃣  Deleting test memory...");
    await memoryService.deleteMemory(memoryId, true);
    console.log(`   ✓ Deleted\n`);

    console.log("✅ All tests passed!");

  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
  }
}

quickTest();
