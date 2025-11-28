/**
 * Memory Formatting Utilities Test
 *
 * Tests the new memory-specific formatting functions
 *
 * IMPORTANT: Run `npm run build` first to compile TypeScript!
 *
 * Run: node tests/memory-formatting.test.ts
 */

import assert from 'node:assert/strict';

import { CHARACTER_LIMIT } from '../dist/constants.js';
import {
  checkAndTruncateMemories,
  formatMemoryAsMarkdown,
  formatMemoriesAsMarkdown,
  formatMemoriesAsJSON,
  type Memory,
  type MemorySearchResult,
} from '../dist/utils/formatting.js';

const LIMIT = CHARACTER_LIMIT;

function buildMemories(count: number, textLength: number): Memory[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `memory-${index + 1}`,
    memory_text: `Memory ${index + 1}: ${'x'.repeat(textLength)}`,
    metadata: { source: 'test', index: index + 1 },
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    deleted_at: null,
  }));
}

function buildSearchResults(count: number, textLength: number): MemorySearchResult[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `memory-${index + 1}`,
    memory_text: `Memory ${index + 1}: ${'x'.repeat(textLength)}`,
    similarity: 0.9 - (index * 0.05),
    metadata: { source: 'test', index: index + 1 },
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    deleted_at: null,
  }));
}

function ensureWithinLimit(text: string) {
  assert.ok(
    text.length <= LIMIT,
    `Expected response length (currently ${text.length}) to stay within the ${LIMIT} character cap.`,
  );
}

// Test formatMemoryAsMarkdown - single memory
{
  const memory: Memory = {
    id: 'test-id',
    memory_text: 'I prefer dark mode in all applications',
    metadata: { source: 'conversation', category: 'preferences' },
    created_at: '2024-01-01T12:00:00.000Z',
    updated_at: '2024-01-01T12:00:00.000Z',
    deleted_at: null,
  };

  const result = formatMemoryAsMarkdown(memory, { showIds: true });

  assert.ok(result.includes('I prefer dark mode'), 'Should include memory text');
  assert.ok(result.includes('test-id'), 'Should include ID when showIds is true');
  assert.ok(result.includes('source'), 'Should include metadata');
}

console.log('✓ formatMemoryAsMarkdown single memory test passed');

// Test formatMemoryAsMarkdown - search result with similarity
{
  const searchResult: MemorySearchResult = {
    id: 'test-id',
    memory_text: 'I prefer TypeScript over JavaScript',
    similarity: 0.85,
    metadata: { source: 'conversation' },
    created_at: '2024-01-01T12:00:00.000Z',
    updated_at: '2024-01-01T12:00:00.000Z',
    deleted_at: null,
  };

  const result = formatMemoryAsMarkdown(searchResult, { isSearchResult: true });

  assert.ok(result.includes('85.0%'), 'Should include similarity percentage');
  assert.ok(result.includes('TypeScript'), 'Should include memory text');
}

console.log('✓ formatMemoryAsMarkdown search result test passed');

// Test formatMemoriesAsMarkdown - multiple memories
{
  const memories = buildMemories(3, 20);
  const result = formatMemoriesAsMarkdown(memories, { showIds: true, showMetadata: true });

  assert.ok(result.includes('1. Memory 1:'), 'Should include first memory');
  assert.ok(result.includes('2. Memory 2:'), 'Should include second memory');
  assert.ok(result.includes('3. Memory 3:'), 'Should include third memory');
  assert.ok(result.includes('memory-1'), 'Should include IDs');
  assert.ok(result.includes('source'), 'Should include metadata');
}

console.log('✓ formatMemoriesAsMarkdown multiple memories test passed');

// Test formatMemoriesAsJSON - regular memories
{
  const memories = buildMemories(5, 10);
  const result = formatMemoriesAsJSON(memories, {
    total: 5,
    count: 5,
    hasMore: false,
    nextOffset: 0,
    offset: 0,
  });

  const parsed = JSON.parse(result);
  assert.equal(parsed.total, 5, 'Total should be 5');
  assert.equal(parsed.count, 5, 'Count should be 5');
  assert.equal(parsed.has_more, false, 'has_more should be false');
  assert.ok(Array.isArray(parsed.memories), 'Should have memories array');
  assert.equal(parsed.memories.length, 5, 'Should have 5 memories');
  assert.ok(parsed.memories[0].memory_text, 'Memory should have memory_text field');
}

console.log('✓ formatMemoriesAsJSON regular memories test passed');

// Test formatMemoriesAsJSON - search results
{
  const searchResults = buildSearchResults(3, 10);
  const result = formatMemoriesAsJSON(searchResults, {
    total: 3,
    count: 3,
    hasMore: false,
    nextOffset: 0,
    offset: 0,
    threshold: 0.3,
    query: 'test query',
  });

  const parsed = JSON.parse(result);
  assert.equal(parsed.threshold_used, 0.3, 'Should include threshold');
  assert.equal(parsed.query, 'test query', 'Should include query');
  assert.ok(Array.isArray(parsed.results), 'Should have results array (not memories)');
  assert.ok(parsed.results[0].similarity !== undefined, 'Results should have similarity scores');
}

console.log('✓ formatMemoriesAsJSON search results test passed');

// Test checkAndTruncateMemories - markdown stays untouched when under limit
{
  const memories = buildMemories(3, 50);
  const result = checkAndTruncateMemories(
    memories,
    LIMIT,
    'markdown',
    0,
    { total: 3, hasMore: false, nextOffset: 3 },
    { showIds: true }
  );

  assert.equal(result.wasTruncated, false, 'Expected no truncation for short markdown responses');
  assert.equal(result.truncatedCount, memories.length, 'Truncated count should match original when within limit');
  ensureWithinLimit(result.text);
}

console.log('✓ checkAndTruncateMemories markdown under limit test passed');

// Test checkAndTruncateMemories - markdown truncates when over limit
{
  const memories = buildMemories(200, 400);
  const result = checkAndTruncateMemories(
    memories,
    LIMIT,
    'markdown',
    0,
    { total: 200, hasMore: true, nextOffset: 200 },
    { showIds: true }
  );

  assert.equal(result.wasTruncated, true, 'Expected truncation when markdown exceeds the limit');
  assert.ok(result.truncatedCount < memories.length, 'Truncation should reduce the number of memories');
  assert.equal(result.originalCount, memories.length, 'Original count preserved for guidance messaging');
  assert.equal(result.hasMore, true, 'Truncated responses should signal more data is available');
  assert.ok(result.text.includes('⚠️ **Response Truncated**'), 'Markdown truncation message should be appended');
  ensureWithinLimit(result.text);
}

console.log('✓ checkAndTruncateMemories markdown truncation test passed');

// Test checkAndTruncateMemories - JSON truncates with structured metadata
{
  const memories = buildMemories(200, 400);
  const offset = 10;
  const result = checkAndTruncateMemories(
    memories,
    LIMIT,
    'json',
    offset,
    { total: 200, hasMore: true, nextOffset: offset + memories.length },
  );

  assert.equal(result.wasTruncated, true, 'Expected truncation when JSON exceeds the limit');
  assert.ok(result.truncatedCount < memories.length, 'Truncation should reduce the number of memories');
  assert.equal(result.originalCount, memories.length, 'Original count should reflect the pre-truncated size');
  assert.equal(
    result.nextOffset,
    offset + result.truncatedCount,
    'nextOffset should advance from the original offset'
  );
  ensureWithinLimit(result.text);

  const parsed = JSON.parse(result.text);
  assert.equal(parsed.truncated, true, 'JSON payload should set truncated=true when trimming occurs');
  assert.equal(parsed.count, result.truncatedCount, 'JSON payload count should match truncated count');
  assert.equal(parsed.next_offset, result.nextOffset, 'JSON payload next_offset should align with truncation result');
  assert.match(parsed.truncation_message, /Response truncated from/, 'JSON payload should include truncation guidance');
}

console.log('✓ checkAndTruncateMemories JSON truncation test passed');

// Test checkAndTruncateMemories - search results with threshold guidance
{
  const searchResults = buildSearchResults(200, 400);
  const result = checkAndTruncateMemories(
    searchResults,
    LIMIT,
    'markdown',
    0,
    { total: 200, hasMore: true, nextOffset: 200, threshold: 0.3, query: 'test' },
    { isSearchResult: true }
  );

  assert.equal(result.wasTruncated, true, 'Expected truncation for large search results');
  assert.ok(result.text.includes('increase threshold'), 'Should include threshold guidance for search results');
  ensureWithinLimit(result.text);
}

console.log('✓ checkAndTruncateMemories search results truncation test passed');

console.log('\n✅ All memory formatting utility tests passed!');
