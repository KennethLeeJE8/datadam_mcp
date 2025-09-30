# Datadam Personal Data MCP Server

Datadam is a Model Context Protocol (MCP) server backed by Supabase. It supports both streamable HTTP endpoints and stdio connections, allowing multiple AI tools to share a single personal database.

Important: There is no auth yet. Do not store sensitive data. OAuth is planned.

## Tools Overview

- How it works
  - MCP clients discover tools automatically once connected. You invoke tools from your AI tool’s UI; results are returned inline.
  - Categories group related records (e.g., `books`, `contacts`, `documents`). Use them for discovery and filtering.
  - Tags are optional labels (e.g., `family`, `work`, `sci-fi`) for finer filtering within a category.
  - Records store structured JSON content and metadata; you can search by title/content or list by category.

- Data model
  - Record fields include: `id`, `title`, `category`, `content` (JSON), `tags` (string[]), `classification`, `created_at`, `updated_at`.
  - Categories are maintained in the database and surfaced via the `data://categories` resource.
  - Filtering order: choose a category first, then use `tags` to further narrow results within that category (tags are optional refinements, not replacements).

- Server tools (at `…/mcp`)

| Tool | Title | Purpose | Required | Optional |
| --- | --- | --- | --- | --- |
| `search-personal-data` | Search Personal Data | Find records by title and content; filter by categories/tags. | `query` | `categories`, `tags`, `classification`, `limit`, `userId` |
| `extract-personal-data` | Extract Personal Data by Category | List items in one category, optionally filtered by tags. | `category` | `tags`, `limit`, `offset`, `userId`, `filters` |
| `create-personal-data` | Create Personal Data | Store a new record with category, title, and JSON content. | `category`, `title`, `content` | `tags`, `classification`, `userId` |
| `update-personal-data` | Update Personal Data | Update fields on an existing record by ID. | `recordId` | `title`, `content`, `tags`, `category`, `classification` |
| `delete-personal-data` | Delete Personal Data | Delete one or more records; optional hard delete. | `recordIds` | `hardDelete` |

- ChatGPT endpoint tools (at `…/chatgpt_mcp`)

| Tool | Title | Purpose | Required | Optional |
| --- | --- | --- | --- | --- |
| `search` | Search (ChatGPT) | Return citation-friendly results for a query. | `query` | — |
| `fetch` | Fetch (ChatGPT) | Return full document content by ID. | `id` | — |

## Connection Types

Datadam supports two connection methods:

### HTTP (Streamable)
- **Use case**: Hosted deployments, multiple clients, web-based AI tools
- **Setup**: Deploy to cloud service (e.g., Render), configure clients with URL
- **Environment**: Server-side environment variables in hosting platform
- **Protocol**: HTTP/HTTPS with MCP over streamable transport

### Stdio (Standard Input/Output)
- **Use case**: Local development, single-client setups, desktop AI applications
- **Setup**: Run server.js locally, configure clients to launch the process
- **Environment**: Local environment variables or passed via client config
- **Protocol**: MCP over stdio transport with direct process communication

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
- Required: `SUPABASE_SERVICE_ROLE_KEY` (full CRUD)
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
- If you don't have `psql` installed, download PostgreSQL and the CLI from the official site: [PostgreSQL Downloads](https://www.postgresql.org/download/)

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
- `SUPABASE_SERVICE_ROLE_KEY`
- `NODE_ENV=production`

## Client Configuration Examples

### HTTP Connections

For hosted deployments using streamable HTTP:

Notes
- All examples use streamable HTTP with hosted server URLs
- The server's database credentials belong in hosting platform environment variables, not in clients
  

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
- **Note**: ChatGPT only supports HTTP connections, not stdio
- **Requirement**: Custom connectors require ChatGPT Pro, Business, Enterprise, or Edu subscription
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

### Stdio Connections

For local development using stdio transport:

Notes
- Clone this repository locally and use the `server.js` file
- Environment variables are passed via client configuration or local `.env` file
- The client launches the server process directly

Claude Desktop
- Open Claude Desktop → Settings → Developer → Edit Config
- Add the following MCP server configuration:
```json
{
  "mcpServers": {
    "datadam": {
      "command": "node",
      "args": ["path/to/server.js"],
      "cwd": "cloned github directory",
      "env": {
        "SUPABASE_URL": "supabase url",
        "SUPABASE_SERVICE_ROLE_KEY": "service key from supabase"
      }
    }
  }
}
```

Coding Agents (Claude Code, Gemini CLI, Cursor etc.)
```json
{
  "mcpServers": {
    "datadam": {
      "command": "node",
      "args": ["./server.js"],
      "cwd": "/absolute/path/to/datadam_mcp",
      "env": {
        "SUPABASE_URL": "your_supabase_url",
        "SUPABASE_SERVICE_ROLE_KEY": "your_service_key"
      }
    }
  }
}
```
## Verify

### HTTP Connections
- Health endpoint only
  - Local (if running locally for debugging): `curl http://localhost:3000/health`
  - Hosted (Render): `curl https://<service>.onrender.com/health`

### Stdio Connections
- Test the stdio server directly:
  - Navigate to project directory: `cd /path/to/datadam_mcp`
  - Set environment variables: `export SUPABASE_URL="your_url"` and `export SUPABASE_SERVICE_ROLE_KEY="your_key"`
  - Run server: `node server.js`
  - Server should connect to Supabase and display available categories

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

## Tool Details

Server tools (at `…/mcp`)
- search-personal-data
  - Purpose: Find records by title and content; optionally filter by categories and tags.
  - Args: `query` (required); `categories?` string[]; `tags?` string[]; `classification?` one of `public|personal|sensitive|confidential`; `limit?` number (default 20); `userId?` string (UUID).
  - Example:
    ```json
    {
      "query": "contacts John",
      "categories": ["contacts"],
      "limit": 10
    }
    ```

- extract-personal-data
  - Purpose: List items in a single category; refine with tags.
  - Args: `category` (required string); `tags?` string[]; `limit?` number (default 50); `offset?` number; `userId?` string (UUID); `filters?` object.
  - Example:
    ```json
    {
      "category": "contacts",
      "tags": ["family"],
      "limit": 20
    }
    ```

- create-personal-data
  - Purpose: Store a new record.
  - Args: `category` (required string); `title` (required string); `content` (required object/JSON); `tags?` string[]; `classification?` (default `personal`); `userId?` string (UUID).
  - Example:
    ```json
    {
      "category": "documents",
      "title": "Passport",
      "content": { "number": "A123...", "country": "US" },
      "tags": ["important"]
    }
    ```

- update-personal-data
  - Purpose: Update fields on an existing record by ID.
  - Args: `recordId` (required string UUID); plus any fields to change: `title?`, `content?`, `tags?`, `category?`, `classification?`.
  - Example:
    ```json
    {
      "recordId": "<UUID>",
      "title": "Emergency Contact – Updated"
    }
    ```

- delete-personal-data
  - Purpose: Delete one or more records; optional hard delete for permanent removal.
  - Args: `recordIds` (required string[] of UUIDs); `hardDelete?` boolean (default false).
  - Example:
    ```json
    {
      "recordIds": ["<UUID1>", "<UUID2>"],
      "hardDelete": false
    }
    ```

ChatGPT endpoint tools (at `…/chatgpt_mcp`)
- search
  - Purpose: Return citation-friendly results for a query.
  - Args: `query` (required string).
  - Example:
    ```json
    { "query": "contacts" }
    ```

- fetch
  - Purpose: Return full document content by ID.
  - Args: `id` (required string UUID).
  - Example:
    ```json
    { "id": "<DOCUMENT_ID>" }
    ```

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
- Use `SUPABASE_SERVICE_ROLE_KEY` (server-side only in Render) for full functionality and the complete toolset.
- OAuth and stronger auth are planned

### Optional: Using the Supabase Anon Key

- If you need read/limited writes only, you can deploy with `SUPABASE_ANON_KEY` instead of the service role key.
- Writes will depend on your Row Level Security (RLS) policies, and some tools (create/update/delete) may fail under anon.

## License

ISC License
