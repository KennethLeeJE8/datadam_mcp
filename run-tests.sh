#!/bin/bash

# Test Runner Script for Memory Integration Tests
#
# This script ensures the project is built before running tests

set -e

echo "📦 Building project..."
npm run build

echo ""
echo "🧪 Running quick smoke test..."
node tests/quick-memory-test.ts

echo ""
echo "🧪 Running comprehensive integration tests..."
node tests/memory-integration.test.ts

echo ""
echo "✅ All tests completed!"
