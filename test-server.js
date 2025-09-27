// Simple test script to verify MCP server functionality
const fetch = require('node:fetch');
require('dotenv').config();

const SERVER_URL = 'http://localhost:3000/mcp';
const API_KEY = process.env.MCP_API_KEY;

if (!API_KEY) {
  throw new Error('Missing MCP_API_KEY environment variable for test harness authentication.');
}

async function testMcpServer() {
  console.log('🧪 Testing MCP Server...\n');

  try {
    // Test 1: Initialize connection
    console.log('1. Testing initialization...');
    const initResponse = await fetch(SERVER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {
            roots: {
              listChanged: true
            }
          },
          clientInfo: {
            name: 'test-client',
            version: '1.0.0'
          }
        }
      })
    });

    if (!initResponse.ok) {
      throw new Error(`HTTP ${initResponse.status}: ${initResponse.statusText}`);
    }

    const initData = await initResponse.json();
    console.log('✅ Initialization successful');
    
    const sessionId = initResponse.headers.get('mcp-session-id');
    console.log(`📋 Session ID: ${sessionId}`);

    if (!sessionId) {
      throw new Error('No session ID received');
    }

    // Test 2: List tools
    console.log('\n2. Testing tools/list...');
    const toolsResponse = await fetch(SERVER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'mcp-session-id': sessionId,
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list'
      })
    });

    const toolsData = await toolsResponse.json();
    console.log('✅ Tools list:', toolsData.result?.tools?.map(t => t.name));

    // Test 3: List resources  
    console.log('\n3. Testing resources/list...');
    const resourcesResponse = await fetch(SERVER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'mcp-session-id': sessionId,
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'resources/list'
      })
    });

    const resourcesData = await resourcesResponse.json();
    console.log('✅ Resources list:', resourcesData.result?.resources?.map(r => r.uri));

    // Test 4: Call search-users tool
    console.log('\n4. Testing search-users tool...');
    const toolCallResponse = await fetch(SERVER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'mcp-session-id': sessionId,
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'search-users',
          arguments: {
            query: 'Engineering'
          }
        }
      })
    });

    const toolCallData = await toolCallResponse.json();
    console.log('✅ Tool call result:', toolCallData.result?.content?.[0]?.text?.substring(0, 100) + '...');

    // Test 5: Read user resource
    console.log('\n5. Testing user resource read...');
    const resourceResponse = await fetch(SERVER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'mcp-session-id': sessionId,
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 5,
        method: 'resources/read',
        params: {
          uri: 'users://1'
        }
      })
    });

    const resourceData = await resourceResponse.json();
    console.log('✅ Resource read result:', resourceData.result?.contents?.[0]?.text?.substring(0, 100) + '...');

    console.log('\n🎉 All tests passed! MCP server is working correctly.');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Only run if this script is executed directly
if (require.main === module) {
  testMcpServer();
}

module.exports = { testMcpServer };
