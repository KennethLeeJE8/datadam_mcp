/**
 * Mock Embedding Unit Test (No Database Required)
 *
 * This test demonstrates mock embedding behavior without requiring Supabase.
 * Shows how embeddings are generated from hashes and their limitations.
 *
 * Run: node tests/mock-embedding-unit-test.ts
 * (No .env or database setup required!)
 */

import { EmbeddingsService } from "../dist/services/embeddings.js";

// Helper to show vector preview
function showVectorPreview(vec: number[], label: string, size: number = 10) {
  const preview = vec.slice(0, size).map(v => v.toFixed(4)).join(', ');
  console.log(`   ${label}: [${preview}, ...] (${vec.length} dimensions)`);
}

// Helper to calculate cosine similarity
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

// Helper to show similarity score
function showSimilarity(text1: string, text2: string, emb1: number[], emb2: number[], expected: string) {
  const sim = cosineSimilarity(emb1, emb2);
  const percent = (sim * 100).toFixed(2);
  const match = sim > 0.9 ? "✓ MATCH" : sim > 0.5 ? "~ PARTIAL" : "✗ DIFFERENT";

  console.log(`\n   Comparing:`);
  console.log(`      Text 1: "${text1}"`);
  console.log(`      Text 2: "${text2}"`);
  console.log(`   Similarity: ${percent}% ${match}`);
  console.log(`   Expected: ${expected}`);
}

function runTest() {
  console.log("=".repeat(80));
  console.log("MOCK EMBEDDING UNIT TEST");
  console.log("No database required - pure embedding analysis");
  console.log("=".repeat(80));
  console.log();

  // Force mock embeddings
  const embeddingsService = new EmbeddingsService({
    provider: 'mock',
    enabled: true
  });

  console.log("✓ Using mock embeddings (hash-based, no OpenAI)");
  console.log();

  // ========================================
  // TEST 1: Deterministic Behavior
  // ========================================
  console.log("📐 TEST 1: Deterministic Behavior");
  console.log("-".repeat(80));
  console.log();

  const text1 = "I'm interested in MCP development";
  const emb1a = embeddingsService.generateMockEmbedding(text1);
  const emb1b = embeddingsService.generateMockEmbedding(text1);

  console.log(`Generating embedding for: "${text1}"`);
  showVectorPreview(emb1a, "First generation ", 8);
  showVectorPreview(emb1b, "Second generation", 8);

  const identical = emb1a.every((val, idx) => val === emb1b[idx]);
  console.log(`\n   ✓ ${identical ? "IDENTICAL" : "DIFFERENT"} (same text = same embedding)`);
  console.log(`   Similarity: ${(cosineSimilarity(emb1a, emb1b) * 100).toFixed(2)}%`);

  // ========================================
  // TEST 2: Sensitivity to Changes
  // ========================================
  console.log("\n\n📐 TEST 2: Sensitivity to Tiny Changes");
  console.log("-".repeat(80));

  const tests = [
    {
      text1: "I'm interested in MCP development",
      text2: "I'm interested in MCP development",
      expected: "100% identical (exact same text)"
    },
    {
      text1: "I'm interested in MCP development",
      text2: "I'm interested in MCP development!",
      expected: "~0% (one punctuation mark changes entire hash)"
    },
    {
      text1: "I'm interested in MCP development",
      text2: "I'm interested in mcp development",
      expected: "~0% (case change affects hash)"
    },
    {
      text1: "I'm interested in MCP development",
      text2: "MCP development interests me",
      expected: "~0% (same meaning, different words = different hash)"
    }
  ];

  for (const test of tests) {
    const embA = embeddingsService.generateMockEmbedding(test.text1);
    const embB = embeddingsService.generateMockEmbedding(test.text2);
    showSimilarity(test.text1, test.text2, embA, embB, test.expected);
  }

  // ========================================
  // TEST 3: Real-World Examples
  // ========================================
  console.log("\n\n📚 TEST 3: Real-World Examples with Test Data");
  console.log("-".repeat(80));
  console.log();

  const memories = {
    mcp_interest: "I'm deeply interested in MCP development and building AI agents",
    location: "I live in Cambridge, MA near MIT and Harvard",
    book: "I recently finished reading Atomic Habits by James Clear",
    language: "I prefer using TypeScript for backend development",
    weather: "Cambridge weather is unpredictable in spring"
  };

  console.log("Generating embeddings for 5 test memories:\n");

  const embeddings: { [key: string]: number[] } = {};

  for (const [key, text] of Object.entries(memories)) {
    embeddings[key] = embeddingsService.generateMockEmbedding(text);
    console.log(`${key.padEnd(15)}: "${text.substring(0, 50)}..."`);
  }

  console.log("\n\nSimilarity Matrix (mock embeddings):");
  console.log("-".repeat(80));
  console.log("              mcp_int  location  book     language  weather");
  console.log("-".repeat(80));

  const keys = Object.keys(embeddings);
  for (const key1 of keys) {
    const similarities = keys.map(key2 => {
      const sim = cosineSimilarity(embeddings[key1], embeddings[key2]);
      return (sim * 100).toFixed(0).padStart(7) + "%";
    });
    console.log(`${key1.padEnd(13)} ${similarities.join("  ")}`);
  }

  console.log();
  console.log("📝 Notice: All similarities are essentially random (based on hash collision)");
  console.log("   The diagonal (100%) shows same text = same hash");
  console.log("   Off-diagonal values have no semantic meaning!");

  // ========================================
  // TEST 4: Search Query Similarity
  // ========================================
  console.log("\n\n🔍 TEST 4: Search Query Similarity (Why Mock Fails)");
  console.log("-".repeat(80));
  console.log();

  const queries = [
    {
      query: "What are my interests in software development?",
      relevant: memories.mcp_interest,
      relevantLabel: "MCP interest (SHOULD match)"
    },
    {
      query: "Where do I live?",
      relevant: memories.location,
      relevantLabel: "Location (SHOULD match)"
    },
    {
      query: "What books have I read about habits?",
      relevant: memories.book,
      relevantLabel: "Atomic Habits (SHOULD match)"
    },
    {
      query: "programming languages I use",
      relevant: memories.language,
      relevantLabel: "TypeScript (SHOULD match)"
    }
  ];

  for (const { query, relevant, relevantLabel } of queries) {
    console.log(`Query: "${query}"`);
    const queryEmb = embeddingsService.generateMockEmbedding(query);

    // Calculate similarity to all memories
    const similarities = Object.entries(memories).map(([key, text]) => ({
      key,
      text,
      similarity: cosineSimilarity(queryEmb, embeddings[key])
    })).sort((a, b) => b.similarity - a.similarity);

    console.log(`   Top 3 Results (by mock embedding similarity):`);
    similarities.slice(0, 3).forEach((result, idx) => {
      const isCorrect = result.text === relevant ? "✓" : "✗";
      const percent = (result.similarity * 100).toFixed(2);
      console.log(`      ${idx + 1}. [${percent}%] ${isCorrect} ${result.key}: "${result.text.substring(0, 40)}..."`);
    });

    const topResult = similarities[0];
    const correct = topResult.text === relevant;
    console.log(`   ${correct ? "✅ CORRECT" : "❌ WRONG"} - Expected: ${relevantLabel}`);
    if (!correct) {
      console.log(`      ⚠️  Mock embeddings don't understand semantic meaning!`);
    }
    console.log();
  }

  // ========================================
  // TEST 5: Vector Properties
  // ========================================
  console.log("\n📊 TEST 5: Mock Embedding Vector Properties");
  console.log("-".repeat(80));
  console.log();

  const testVec = embeddingsService.generateMockEmbedding("Test vector");

  console.log("Analyzing vector properties:");
  console.log(`   Dimensions: ${testVec.length}`);

  const magnitude = Math.sqrt(testVec.reduce((sum, v) => sum + v * v, 0));
  console.log(`   Magnitude: ${magnitude.toFixed(4)}`);

  const min = Math.min(...testVec);
  const max = Math.max(...testVec);
  const avg = testVec.reduce((sum, v) => sum + v, 0) / testVec.length;

  console.log(`   Min value: ${min.toFixed(4)}`);
  console.log(`   Max value: ${max.toFixed(4)}`);
  console.log(`   Average: ${avg.toFixed(4)}`);
  console.log(`   Range: [${min.toFixed(4)}, ${max.toFixed(4)}]`);
  console.log();

  // Show the repeating pattern
  console.log("Checking for repeating pattern (SHA-256 has 32 bytes, we need 1536):");
  const pattern1 = testVec.slice(0, 32);
  const pattern2 = testVec.slice(32, 64);
  const pattern3 = testVec.slice(64, 96);

  const match1_2 = pattern1.every((val, idx) => val === pattern2[idx]);
  const match1_3 = pattern1.every((val, idx) => val === pattern3[idx]);

  console.log(`   First 32 values match second 32: ${match1_2 ? "✓ YES" : "✗ NO"}`);
  console.log(`   First 32 values match third 32: ${match1_3 ? "✓ YES" : "✗ NO"}`);
  console.log(`   (Vector repeats 32-byte hash pattern: ${testVec.length / 32} times)`);
  console.log();

  // ========================================
  // Summary
  // ========================================
  console.log("\n" + "=".repeat(80));
  console.log("✅ UNIT TEST COMPLETE");
  console.log("=".repeat(80));
  console.log();
  console.log("📋 Key Findings:");
  console.log("   ✓ Mock embeddings are deterministic (same text = same vector)");
  console.log("   ✓ Vectors are 1536 dimensions (compatible with OpenAI)");
  console.log("   ✓ Values are normalized to roughly [-1, 1]");
  console.log("   ✓ Pattern repeats every 32 values (SHA-256 hash size)");
  console.log();
  console.log("   ✗ Tiny text changes create completely different vectors");
  console.log("   ✗ NO semantic understanding of language");
  console.log("   ✗ Search results are based on hash collision, not meaning");
  console.log("   ✗ Synonyms and related concepts have random similarity");
  console.log();
  console.log("🎯 Conclusion:");
  console.log("   Mock embeddings are PERFECT for:");
  console.log("      • Testing infrastructure without API keys");
  console.log("      • CI/CD pipelines");
  console.log("      • Database storage/retrieval validation");
  console.log("      • Development without OpenAI costs");
  console.log();
  console.log("   Mock embeddings are USELESS for:");
  console.log("      • Actual semantic search");
  console.log("      • Finding related concepts");
  console.log("      • User-facing search features");
  console.log("      • Quality assurance of search relevance");
  console.log();
  console.log("🔑 For real semantic search:");
  console.log("   Add OPENAI_API_KEY to .env and restart your server!");
  console.log();
}

// Run the test
try {
  runTest();
  console.log("✅ Test completed successfully!\n");
  process.exit(0);
} catch (error) {
  console.error("\n❌ Test failed:");
  console.error(error instanceof Error ? error.message : error);
  if (error instanceof Error && error.stack) {
    console.error("\nStack trace:");
    console.error(error.stack);
  }
  process.exit(1);
}
