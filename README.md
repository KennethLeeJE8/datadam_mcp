# Datadam Personal Data MCP Server (Streamable HTTP)

Datadam is a Model Context Protocol (MCP) server backed by Supabase. It exposes streamable HTTP endpoints so multiple AI tools can share a single personal database. This guide focuses only on the streamable HTTP setup (no stdio).

Important: There is no auth yet. Do not store sensitive data. OAuth is planned.

## Tools Overview

- How it works
  - MCP clients discover tools automatically once connected. You invoke tools from your AI tool’s UI; results are returned inline.
  - Most server tools expect a `userId` (use your Supabase Auth user UUID). Some clients let you set it via an env field; otherwise pass it as an argument when invoking tools.
  - Categories (e.g., `books`, `contacts`) and optional `tags` help narrow results; you can omit them for broader searches.

- Server tools (at `…/mcp`)
  - search-personal-data: Find records by title and content. Args: `query` (required), `userId` (required), optional `categories`, `tags`, `classification`, `limit`.
  - extract-personal-data: Return items in a category, optionally filtered by `tags`. Great for “my <category>”. Args: `category` (required), optional `tags`, `userId`, `limit`.
  - create-personal-data: Store a new record. Args include `userId`, `category`, `title`, `content`, optional `tags`, `classification`.
  - update-personal-data: Update an existing record. Args: `recordId` plus the fields you want to change.
  - delete-personal-data: Delete records by ID(s). Args: `recordIds` (array), optional `hardDelete` for permanent removal.

- ChatGPT endpoint tools (at `…/chatgpt_mcp`)
  - search: Returns a lightweight `{ results: [{ id, title, url }, …] }` array for citations.
  - fetch: Returns full document content `{ id, title, text, url, metadata }` for a given `id`.

## Quickstart

1) Prepare Supabase
- Create a project in Supabase.
- Create a user in Authentication → Users; copy the UUID for later.
- Load the schema using `psql` and the Transaction Pooler connection string:
  - `psql "<transaction_pooler_string>" -f src/database/schema.sql`
- Insert a profile row for your Auth user:
  - `INSERT INTO profiles (user_id, username, full_name, metadata) VALUES ('<AUTH_USER_UUID>'::uuid, 'your_username', 'Your Name', '{}'::jsonb);`

2) Deploy to Render (HTTP)
- Create a Web Service from this repo (Render auto-detects `render.yaml`).
- Build: `npm install && npm run build`
- Start: `npm start`
- Health check path: `/health`

3) Set environment variables in Render (not in `.env`)
- Required: `SUPABASE_URL`
- One of: `SUPABASE_SERVICE_ROLE_KEY` (full CRUD) or `SUPABASE_ANON_KEY` (read/limited writes)
- `DATABASE_USER_ID` — the Auth user UUID you created
- `NODE_ENV=production`

4) Your public endpoints
- Full MCP: `https://<service>.onrender.com/mcp`
- ChatGPT-specific MCP: `https://<service>.onrender.com/chatgpt_mcp` (exposes `search`, `fetch`)

## Prerequisites

- Accounts: Supabase (required), Render (for hosting)
- CLI: PostgreSQL client `psql`, Node.js + npm (for building before deploy if needed)

## Supabase Setup (Details)

1) Create a user (Auth)
- Supabase Dashboard → Authentication → Users → Add user
- Copy the user UUID (used as `DATABASE_USER_ID`)

2) Load schema with `psql`
- Supabase → Project settings → Database → Connection strings → choose Transaction Pooler (`psql`)
- Run: `psql "<transaction_pooler_string>" -f src/database/schema.sql` (file: src/database/schema.sql)

3) Insert a profile row for that user
- `INSERT INTO profiles (user_id, username, full_name, metadata) VALUES ('<AUTH_USER_UUID>'::uuid, 'your_username', 'Your Name', '{}'::jsonb);`

4) Optional checks
- `select * from profiles where user_id = '<AUTH_USER_UUID>'::uuid;`
- `select * from get_active_categories();`

## Render Deployment

- Repo includes `render.yaml` with sane defaults (render.yaml)
- Service type: Web Service
- Build command: `npm install && npm run build`
- Start command: `npm start`
- Health check path: `/health`
- Plan tips: The free tier is fine for testing but can crash or hit limits; use a higher tier (e.g., Standard) for good uptime

Environment (Render dashboard)
- `SUPABASE_URL`
- One of `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_ANON_KEY`
- `DATABASE_USER_ID`
- `NODE_ENV=production`

## Client Configuration Examples (HTTP)

Notes
- All examples use streamable HTTP. No stdio is required.
- The server’s database credentials belong in Render environment variables, not in clients.
- Some tools require a `userId` argument when calling tools like `search-personal-data`. If your client supports passing env to tool calls, you may set a default (e.g., `DATABASE_USER_ID`) in client config; otherwise include `userId` explicitly when invoking tools.

Claude Code (VS Code)
- Settings file may vary by installation; this illustrates the structure expected by Claude Code’s MCP configuration.
```
{
  "mcpServers": {
    "datadam": {
      "type": "http",
      "url": "https://<YOUR_RENDER_URL>/mcp",
      "env": {
        "DEBUG": "true",
        "DATABASE_USER_ID": "<YOUR_DATABASE_USER_ID>"
      }
    }
  }
}
```

Claude Desktop (Custom Connector)
- Open Claude Desktop → Connectors → Add Custom Connector.
- Name: `datadam`
- Type: HTTP
- URL: `https://<YOUR_RENDER_URL>/mcp`
- No local `.env` needed; the server reads credentials from Render.

ChatGPT (Connectors / Deep Research)
- Enable Developer Mode in Settings → Connectors → Advanced → Developer mode.
- Add a custom MCP server using the ChatGPT endpoint:
  - URL: `https://<YOUR_RENDER_URL>/chatgpt_mcp`
- The server implements `search` and `fetch` as required.

Cursor (and similar coding agents)
- Many editors/agents use a similar JSON shape for MCP servers. Adapt paths and UI as needed.
```
{
  "mcpServers": {
    "datadam": {
      "type": "http",
      "url": "https://<YOUR_RENDER_URL>/mcp",
      "env": {
        "DATABASE_USER_ID": "<YOUR_DATABASE_USER_ID>"
      }
    }
  }
}
```

Generic MCP Clients
- If your tool supports MCP over HTTP, configure:
  - Type: `http`
  - URL: `https://<service>.onrender.com/mcp`
  - Optional env (client-side convenience only): `{ "DATABASE_USER_ID": "<uuid>" }`

## Verify

- Health endpoint only
  - Local (if running locally for debugging): `curl http://localhost:3000/health`
  - Hosted (Render): `curl https://<service>.onrender.com/health`

## Endpoints & Tools

- Endpoints
  - `POST/GET/DELETE /mcp` — Streamable HTTP MCP
  - `POST/GET/DELETE /chatgpt_mcp` — ChatGPT‑oriented MCP

- Tools (server)
  - `search-personal-data`, `extract-personal-data`, `create-personal-data`, `update-personal-data`, `delete-personal-data`

- Tools (ChatGPT endpoint)
  - `search`, `fetch`

## Troubleshooting

- Health check fails
  - Verify Render env vars are set; inspect Render logs
  - Confirm Supabase URL/key values

- Empty categories/data
  - Insert data; run `select * from get_active_categories();`

- Client cannot connect
  - Use the `…/mcp` URL (or `…/chatgpt_mcp` for ChatGPT)
  - Check CORS/firewall and that the service is not sleeping (Starter tier)

## Security Notes

- No authentication yet — do not store sensitive data
- Prefer `SUPABASE_ANON_KEY` for read-heavy demos; use `SERVICE_ROLE_KEY` only when necessary and always server-side (Render)
- OAuth and stronger auth are planned

## License

ISC License
