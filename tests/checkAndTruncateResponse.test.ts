import assert from 'node:assert/strict';

import { CHARACTER_LIMIT } from '../src/constants.js';
import { getCategorySchema } from '../src/schemas/index.js';
import { availableCategories } from '../src/services/supabase.js';
import {
  checkAndTruncateResponse,
  type PersonalDataRecord,
} from '../src/utils/formatting.js';

const LIMIT = CHARACTER_LIMIT;

function buildRecords(count: number, contentSize: number): PersonalDataRecord[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `record-${index + 1}`,
    title: `Record ${index + 1}`,
    category: 'documents',
    classification: 'personal',
    content: { note: 'X'.repeat(contentSize) },
    tags: ['demo'],
    created_at: '2024-01-01T00:00:00.000Z',
  }));
}

function ensureWithinLimit(text: string) {
  assert.ok(
    text.length <= LIMIT,
    `Expected response length (currently ${text.length}) to stay within the ${LIMIT} character cap.`,
  );
}

// Markdown responses stay untouched when under the limit
{
  const records = buildRecords(3, 120);
  const result = checkAndTruncateResponse(
    records,
    LIMIT,
    'markdown',
    0,
    records.length,
    false,
    records.length,
    { showIds: true },
  );

  assert.equal(result.wasTruncated, false, 'Expected no truncation for short markdown responses.');
  assert.equal(result.truncatedCount, records.length, 'Truncated count should match original when within limit.');
  assert.ok(result.text.includes('Found 3 record(s)'), 'Formatted markdown should include record count.');
  ensureWithinLimit(result.text);
}

// Markdown responses truncate and include guidance when the full payload would exceed the limit
{
  const records = buildRecords(200, 400);
  const result = checkAndTruncateResponse(
    records,
    LIMIT,
    'markdown',
    0,
    records.length,
    true,
    records.length,
    { showIds: true },
  );

  assert.equal(result.wasTruncated, true, 'Expected truncation when markdown exceeds the limit.');
  assert.ok(result.truncatedCount < records.length, 'Truncation should reduce the number of records.');
  assert.equal(result.originalCount, records.length, 'Original count preserved for guidance messaging.');
  assert.equal(result.hasMore, true, 'Truncated responses should signal more data is available.');
  assert.equal(
    result.nextOffset,
    result.truncatedCount,
    'nextOffset should advance by the truncated count when starting at offset 0.',
  );
  assert.ok(result.text.includes('⚠️ **Response Truncated**'), 'Markdown truncation message should be appended.');
  ensureWithinLimit(result.text);
}

// JSON responses truncate with structured metadata and guidance when the payload would exceed the limit
{
  const records = buildRecords(200, 400);
  const offset = 20;
  const total = records.length + offset;
  const result = checkAndTruncateResponse(
    records,
    LIMIT,
    'json',
    offset,
    total,
    true,
    offset + records.length,
  );

  assert.equal(result.wasTruncated, true, 'Expected truncation when JSON exceeds the limit.');
  assert.ok(result.truncatedCount < records.length, 'Truncation should reduce the number of records.');
  assert.equal(result.originalCount, records.length, 'Original count should reflect the pre-truncated size.');
  assert.equal(
    result.nextOffset,
    offset + result.truncatedCount,
    'nextOffset should advance from the original offset.',
  );
  ensureWithinLimit(result.text);

  const parsed = JSON.parse(result.text);
  assert.equal(parsed.truncated, true, 'JSON payload should set truncated=true when trimming occurs.');
  assert.equal(parsed.count, result.truncatedCount, 'JSON payload count should match truncated count.');
  assert.equal(parsed.next_offset, result.nextOffset, 'JSON payload next_offset should align with truncation result.');
  assert.match(parsed.truncation_message, /Response truncated from/, 'JSON payload should include truncation guidance.');
}

console.log('✓ checkAndTruncateResponse character limit tests passed');

// Category schema enforces active categories only
{
  availableCategories.length = 0;
  availableCategories.push('contacts', 'books');

  const schema = getCategorySchema();

  assert.doesNotThrow(() => schema.parse('contacts'));
  assert.throws(
    () => schema.parse('invalid'),
    /Invalid enum value/,
    'Expected schema to reject inactive categories.',
  );
}

// Category schema fails fast when no active categories are loaded
{
  availableCategories.length = 0;

  const schema = getCategorySchema();

  assert.throws(
    () => schema.parse('contacts'),
    /No active categories available/, 
    'Expected schema to fail when active categories list is empty.',
  );
}

console.log('✓ getCategorySchema active category validation tests passed');
