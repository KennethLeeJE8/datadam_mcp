#!/usr/bin/env node

const crypto = require('crypto');

const args = process.argv.slice(2);

function getArgValue(flag) {
  const index = args.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  return args[index + 1];
}

function base64UrlEncode(data) {
  return Buffer.from(data)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

const providedSecret = getArgValue('--secret');
const subject = getArgValue('--subject') || 'mcp-client';
const expiresInDays = Number(getArgValue('--expires-in-days') || 30);

let secret = providedSecret;
if (!secret) {
  secret = crypto.randomBytes(32).toString('hex');
}

if (Number.isNaN(expiresInDays) || expiresInDays <= 0) {
  console.error('Invalid --expires-in-days value. It must be a positive number.');
  process.exit(1);
}

const header = {
  alg: 'HS256',
  typ: 'JWT',
};

const now = Math.floor(Date.now() / 1000);
const payload = {
  sub: subject,
  scope: 'mcp-tools',
  tools: [
    'search-personal-data',
    'extract-personal-data',
    'create-personal-data',
    'update-personal-data',
    'delete-personal-data',
  ],
  iat: now,
  exp: now + expiresInDays * 24 * 60 * 60,
};

const encodedHeader = base64UrlEncode(JSON.stringify(header));
const encodedPayload = base64UrlEncode(JSON.stringify(payload));
const signature = crypto
  .createHmac('sha256', secret)
  .update(`${encodedHeader}.${encodedPayload}`)
  .digest();
const encodedSignature = base64UrlEncode(signature);

const token = `${encodedHeader}.${encodedPayload}.${encodedSignature}`;

console.log('\nGenerated MCP API key (JWT):\n');
console.log(token);
console.log('\nSet this value as MCP_API_KEY on both the server and client environments.');

if (!providedSecret) {
  console.log('\nToken was signed with a randomly generated secret.');
  console.log('Store this secret if you want to be able to regenerate the same token:');
  console.log(secret);
} else {
  console.log(`\nToken was signed with the provided secret: ${providedSecret}`);
}

console.log('\nPayload:');
console.log(JSON.stringify(payload, null, 2));
