/**
 * Mock Embedding Demonstration
 *
 * This test demonstrates how mock embeddings work and their limitations.
 * Uses real-world examples to show embedding generation and search behavior.
 *
 * Test data includes:
 * - Interest in MCP development
 * - Location: Cambridge, MA
 * - Book read: Atomic Habits
 *
 * Setup:
 * 1. Run `npm run build` to compile TypeScript
 * 2. Ensure .env has Supabase credentials
 * 3. Run: node tests/mock-embedding-demo.ts
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

// Force mock embeddings for this demo
const embeddingsService = new EmbeddingsService({
  provider: 'mock',
  enabled: true
});

const memoryService = new MemoryService(supabase, embeddingsService);

// Test memory IDs for cleanup
const testMemoryIds: string[] = [];

// Helper to show vector preview
function showVectorPreview(vec: number[], label: string, size: number = 10) {
  const preview = vec.slice(0, size).map(v => v.toFixed(4)).join(', ');
  console.log(`   ${label}: [${preview}, ...] (${vec.length} dimensions)`);
}

// Helper to calculate cosine similarity manually
function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  magA = Math.sqrt(magA);
  magB = Math.sqrt(magB);

  return dotProduct / (magA * magB);
}

async function runDemo() {
  console.log("=".repeat(80));
  console.log("MOCK EMBEDDING DEMONSTRATION");
  console.log("=".repeat(80));
  console.log();

  try {
    // ========================================
    // PART 1: Understanding Mock Embeddings
    // ========================================
    console.log("📐 PART 1: How Mock Embeddings Work");
    console.log("-".repeat(80));
    console.log();

    console.log("1️⃣  Generating mock embeddings for test phrases:");
    console.log();

    const phrase1 = "I'm interested in MCP development";
    const phrase2 = "I'm interested in MCP development"; // Exact duplicate
    const phrase3 = "I'm interested in MCP development!"; // Tiny difference (punctuation)
    const phrase4 = "MCP development interests me"; // Semantically same, different words

    const emb1 = embeddingsService.generateMockEmbedding(phrase1);
    const emb2 = embeddingsService.generateMockEmbedding(phrase2);
    const emb3 = embeddingsService.generateMockEmbedding(phrase3);
    const emb4 = embeddingsService.generateMockEmbedding(phrase4);

    console.log(`   Text: "${phrase1}"`);
    showVectorPreview(emb1, "Vector", 8);
    console.log();

    console.log(`   Text: "${phrase2}" (EXACT DUPLICATE)`);
    showVectorPreview(emb2, "Vector", 8);
    const sim1_2 = cosineSimilarity(emb1, emb2);
    console.log(`   ✓ Similarity to original: ${(sim1_2 * 100).toFixed(2)}% (IDENTICAL!)`);
    console.log();

    console.log(`   Text: "${phrase3}" (tiny punctuation change)`);
    showVectorPreview(emb3, "Vector", 8);
    const sim1_3 = cosineSimilarity(emb1, emb3);
    console.log(`   ✗ Similarity to original: ${(sim1_3 * 100).toFixed(2)}% (COMPLETELY DIFFERENT!)`);
    console.log();

    console.log(`   Text: "${phrase4}" (same meaning, different words)`);
    showVectorPreview(emb4, "Vector", 8);
    const sim1_4 = cosineSimilarity(emb1, emb4);
    console.log(`   ✗ Similarity to original: ${(sim1_4 * 100).toFixed(2)}% (NO SEMANTIC UNDERSTANDING!)`);
    console.log();

    console.log("📝 Key Insight:");
    console.log("   Mock embeddings are deterministic (same text = same vector) but have");
    console.log("   NO semantic understanding. Even tiny changes create completely different vectors!");
    console.log();

    // ========================================
    // PART 2: Adding Test Memories
    // ========================================
    console.log("\n📚 PART 2: Adding Test Memories to Database");
    console.log("-".repeat(80));
    console.log();

    const testMemories = [
      {
        text: "I'm deeply interested in MCP development and building AI agents",
        metadata: { source: "conversation", category: "interests", tags: ["mcp", "ai", "development"] }
      },
      {
        text: "I live in Cambridge, MA near MIT and Harvard",
        metadata: { source: "conversation", category: "location", tags: ["cambridge", "ma"] }
      },
      {
        text: "I recently finished reading Atomic Habits by James Clear",
        metadata: { source: "conversation", category: "books", tags: ["atomic-habits", "self-improvement"] }
      },
      {
        text: "I prefer using TypeScript for backend development",
        metadata: { source: "conversation", category: "preferences", tags: ["typescript", "programming"] }
      },
      {
        text: "Cambridge weather is unpredictable in spring",
        metadata: { source: "conversation", category: "observations", tags: ["weather", "cambridge"] }
      }
    ];

    console.log(`Adding ${testMemories.length} memories with auto-generated embeddings...\n`);

    for (let i = 0; i < testMemories.length; i++) {
      const mem = testMemories[i];
      console.log(`${i + 1}. Adding: "${mem.text}"`);

      const memoryId = await memoryService.addMemory(
        mem.text,
        null,
        null, // Let service auto-generate embedding
        mem.metadata
      );

      testMemoryIds.push(memoryId);
      console.log(`   ✓ Memory ID: ${memoryId}`);
      console.log(`   ✓ Embedding: Auto-generated (Mock)`);
      console.log(`   ✓ Metadata: ${JSON.stringify(mem.metadata)}`);
      console.log();
    }

    console.log(`✅ Successfully added ${testMemories.length} memories\n`);

    // ========================================
    // PART 3: Semantic Search Tests
    // ========================================
    console.log("\n🔍 PART 3: Testing Semantic Search with Mock Embeddings");
    console.log("-".repeat(80));
    console.log();

    const searchQueries = [
      {
        query: "What are my interests in software development?",
        expectedRelevant: "MCP development",
        description: "Should find MCP development interest"
      },
      {
        query: "Where do I live?",
        expectedRelevant: "Cambridge, MA",
        description: "Should find location info"
      },
      {
        query: "What books have I read about habits?",
        expectedRelevant: "Atomic Habits",
        description: "Should find book reading memory"
      },
      {
        query: "programming languages I use",
        expectedRelevant: "TypeScript",
        description: "Should find TypeScript preference"
      }
    ];

    for (let i = 0; i < searchQueries.length; i++) {
      const { query, expectedRelevant, description } = searchQueries[i];

      console.log(`Search ${i + 1}: "${query}"`);
      console.log(`Expected: ${description}`);
      console.log();

      // Use searchMemoriesByText which auto-generates embeddings
      const results = await memoryService.searchMemoriesByText(
        query,
        null,
        5,
        null,
        0.0 // Very low threshold to see all results
      );

      console.log(`   Results (${results.length} found):`);
      if (results.length === 0) {
        console.log("   ⚠️  No results found!");
      } else {
        results.forEach((result, idx) => {
          const similarityPercent = (result.similarity * 100).toFixed(2);
          const isExpected = result.memory_text.includes(expectedRelevant) ? "✓" : "✗";
          const preview = result.memory_text.substring(0, 60);
          console.log(`   ${idx + 1}. [${similarityPercent}%] ${isExpected} ${preview}...`);
        });

        // Check if most relevant result is what we expect
        const topResult = results[0];
        const isCorrect = topResult.memory_text.includes(expectedRelevant);
        console.log();
        console.log(`   ${isCorrect ? "✅" : "❌"} Top result ${isCorrect ? "IS" : "is NOT"} semantically relevant`);

        if (!isCorrect) {
          console.log(`   ⚠️  Mock embeddings don't understand semantic meaning!`);
          console.log(`      Top result is based on hash similarity, not meaning.`);
        }
      }
      console.log();
    }

    // ========================================
    // PART 4: Demonstrating Hash Patterns
    // ========================================
    console.log("\n🔬 PART 4: Understanding Mock Embedding Patterns");
    console.log("-".repeat(80));
    console.log();

    console.log("Testing similarity between related concepts:\n");

    const concepts = {
      "MCP": "MCP",
      "MCP development": "MCP development",
      "Model Context Protocol": "Model Context Protocol",
      "AI agents": "AI agents",
      "Cambridge": "Cambridge",
      "Cambridge, MA": "Cambridge, MA",
      "Massachusetts": "Massachusetts"
    };

    const conceptEmbeddings: { [key: string]: number[] } = {};

    for (const [key, text] of Object.entries(concepts)) {
      conceptEmbeddings[key] = embeddingsService.generateMockEmbedding(text);
    }

    console.log("Similarity Matrix (Mock Embeddings):");
    console.log();
    console.log("                           MCP    MCP dev  Model CP  AI agnt  Cambrdg  Camb,MA  Mass");
    console.log("-".repeat(90));

    const keys = Object.keys(conceptEmbeddings);
    for (const key1 of keys) {
      const similarities = keys.map(key2 => {
        const sim = cosineSimilarity(conceptEmbeddings[key1], conceptEmbeddings[key2]);
        return (sim * 100).toFixed(0).padStart(6);
      });
      const label = key1.substring(0, 25).padEnd(25);
      console.log(`${label} ${similarities.join('  ')}`);
    }

    console.log();
    console.log("📝 Observations:");
    console.log("   • Diagonal is 100% (same text = same embedding)");
    console.log("   • Related concepts (MCP vs Model Context Protocol) have LOW similarity");
    console.log("   • Mock embeddings are based on SHA-256 hash, not semantic meaning");
    console.log("   • This is why you need OpenAI for real semantic search!");
    console.log();

    // ========================================
    // PART 5: Memory Statistics
    // ========================================
    console.log("\n📊 PART 5: Memory Statistics");
    console.log("-".repeat(80));
    console.log();

    const stats = await memoryService.getMemoryStats(null);

    console.log("Current Memory Statistics:");
    console.log(`   Total memories: ${stats.total_memories}`);
    console.log(`   Active memories: ${stats.active_memories}`);
    console.log(`   Deleted memories: ${stats.deleted_memories}`);
    console.log(`   Memories with embeddings: ${stats.memories_with_embeddings}`);
    console.log(`   History entries: ${stats.total_history_entries}`);
    console.log();

    console.log(`   Embedding type: ${memoryService.isUsingOpenAI() ? 'OpenAI' : 'Mock (Hash-based)'}`);
    console.log();

    // ========================================
    // Summary
    // ========================================
    console.log("\n" + "=".repeat(80));
    console.log("✅ DEMO COMPLETE");
    console.log("=".repeat(80));
    console.log();
    console.log("📋 Summary:");
    console.log("   • Mock embeddings are deterministic and work for testing infrastructure");
    console.log("   • They are based on SHA-256 hashes, not semantic meaning");
    console.log("   • Search results with mock embeddings are essentially random");
    console.log("   • For real semantic search, add OPENAI_API_KEY to your .env file");
    console.log();
    console.log("🔑 To enable OpenAI embeddings:");
    console.log("   1. Get API key from: https://platform.openai.com/api-keys");
    console.log("   2. Add to .env: OPENAI_API_KEY=sk-proj-your-key-here");
    console.log("   3. Restart your MCP server");
    console.log("   4. Re-run this demo to see the difference!");
    console.log();

  } catch (error) {
    console.error("\n❌ Demo failed:");
    console.error(error instanceof Error ? error.message : error);
    if (error instanceof Error && error.stack) {
      console.error("\nStack trace:");
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    // Cleanup
    console.log("🧹 Cleaning up test data...");
    for (const memoryId of testMemoryIds) {
      try {
        await memoryService.deleteMemory(memoryId, true);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
    console.log("✓ Cleanup complete\n");
  }
}

// Run the demo
console.log("\n🚀 Starting Mock Embedding Demonstration\n");
runDemo()
  .then(() => {
    console.log("✅ Demonstration completed successfully!\n");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Demonstration failed:", error);
    process.exit(1);
  });
