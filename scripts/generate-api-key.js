#!/usr/bin/env node

const crypto = require('crypto');

function generateAPIKey() {
  // Generate 32 random bytes and convert to hex (64 character string)
  const apiKey = crypto.randomBytes(32).toString('hex');
  return apiKey;
}

function main() {
  console.log('🔐 Generating secure API key for MCP server...\n');
  
  const apiKey = generateAPIKey();
  
  console.log('✅ API Key generated successfully!\n');
  console.log('Your new API key:');
  console.log(`${apiKey}\n`);
  
  console.log('To use this API key:');
  console.log('1. Add it to your .env file:');
  console.log(`   MCP_API_KEY=${apiKey}\n`);
  console.log('2. Or set it as an environment variable:');
  console.log(`   export MCP_API_KEY=${apiKey}\n`);
  console.log('3. Restart your MCP server\n');
  
  console.log('⚠️  IMPORTANT: Keep this API key secure and never commit it to version control!');
  console.log('💡 Save this key somewhere safe - you\'ll need it to authenticate API requests');
}

if (require.main === module) {
  main();
}

module.exports = { generateAPIKey };