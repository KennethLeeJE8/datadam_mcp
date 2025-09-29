# Datadam Personal Data MCP Server (Streamable HTTP)

Datadam is a Model Context Protocol (MCP) server backed by Supabase. It exposes streamable HTTP endpoints so multiple AI tools can share a single personal database. This guide focuses only on the streamable HTTP setup (no stdio).

Important: There is no auth yet. Do not store sensitive data. OAuth is planned.

## Tools Overview

- How it works
  - MCP clients discover tools automatically once connected. You invoke tools from your AI tool’s UI; results are returned inline.
  - Categories group related records (e.g., `books`, `contacts`, `documents`). Use them for discovery and filtering.
  - Tags are optional labels (e.g., `family`, `work`, `sci-fi`) for finer filtering within a category.
  - Records store structured JSON content and metadata; you can search by title/content or list by category.

- Data model
  - Record fields include: `id`, `title`, `category`, `content` (JSON), `tags` (string[]), `classification` (`public` | `personal` | `sensitive` | `confidential`), `created_at`, `updated_at`.
  - Categories are maintained in the database and surfaced via the `data://categories` resource.

- Server tools (at `…/mcp`)

| Tool | Title | Purpose | Required | Optional | Example args |
| --- | --- | --- | --- | --- | --- |
| `search-personal-data` | Search Personal Data | Find records by title and content; filter by categories/tags. | `query` | `categories`, `tags`, `classification`, `limit`, `userId` | `{ "query": "contacts", "categories": ["contacts"], "limit": 10 }` |
| `extract-personal-data` | Extract Personal Data by Category | List items in one category, optionally filtered by tags. | `category` | `tags`, `limit`, `offset`, `userId`, `filters` | `{ "category": "contacts", "tags": ["family"], "limit": 20 }` |
| `create-personal-data` | Create Personal Data | Store a new record with category, title, and JSON content. | `category`, `title`, `content` | `tags`, `classification`, `userId` | `{ "category": "documents", "title": "Passport", "content": {"number": "..."}, "tags": ["important"] }` |
| `update-personal-data` | Update Personal Data | Update fields on an existing record by ID. | `recordId` | `title`, `content`, `tags`, `category`, `classification` | `{ "recordId": "<UUID>", "title": "New Title" }` |
| `delete-personal-data` | Delete Personal Data | Delete one or more records; optional hard delete. | `recordIds` | `hardDelete` | `{ "recordIds": ["<UUID1>", "<UUID2>"], "hardDelete": false }` |

- ChatGPT endpoint tools (at `…/chatgpt_mcp`)

| Tool | Title | Purpose | Required | Optional | Example args |
| --- | --- | --- | --- | --- | --- |
| `search` | Search (ChatGPT) | Return citation-friendly results for a query. | `query` | — | `{ "query": "contacts" }` |
| `fetch` | Fetch (ChatGPT) | Return full document content by ID. | `id` | — | `{ "id": "<DOCUMENT_ID>" }` |

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
- Copy the user UUID for later (optional user scoping)

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
- `NODE_ENV=production`

## Client Configuration Examples (HTTP)

Notes
- All examples use streamable HTTP. No stdio is required.
- The server’s database credentials belong in Render environment variables, not in clients.
  

Claude Code (VS Code)
- Settings file may vary by installation; this illustrates the structure expected by Claude Code’s MCP configuration.
```
{
  "mcpServers": {
    "datadam": {
      "type": "http",
      "url": "https://<YOUR_RENDER_URL>/mcp",
      "env": {
        "DEBUG": "true"
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
      "url": "https://<YOUR_RENDER_URL>/mcp"
    }
  }
}
```

Generic MCP Clients
- If your tool supports MCP over HTTP, configure:
  - Type: `http`
  - URL: `https://<service>.onrender.com/mcp`

## Verify

- Health endpoint only
  - Local (if running locally for debugging): `curl http://localhost:3000/health`
  - Hosted (Render): `curl https://<service>.onrender.com/health`

## Optional: Default User Context

- Some tools can scope operations to a particular user by accepting a `userId` argument (UUID from Supabase Auth). This field is optional.
- If your client supports passing environment variables to tool calls, you may set a convenience variable like `DATABASE_USER_ID` in the client’s MCP config and have your prompts/tools use it when needed.
- Otherwise, just supply `userId` explicitly in the tool call input when you want to target a specific user.

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
