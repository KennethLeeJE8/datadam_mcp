# Datadam Personal Data MCP Server
<<<<<<< Updated upstream
# Personal Data MCP Server

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

Happy to help if you have any problems w the setup! Shoot me a message or send me an email at kennethleeje8@gmail.com :)

1) Prepare Supabase
- Create a project in Supabase.
- Load the schema using `psql` and the Transaction Pooler connection string:
  - `psql "<transaction_pooler_string>" -f src/database/schema.sql`

2) Deploy to Render (HTTP)
- Create a Web Service from this repo (Render auto-detects `render.yaml`).
- Build: `npm install && npm run build`
- Start: `npm start`
- Health check path: `/health`
A Model Context Protocol (MCP) server that provides secure access to your personal data stored in a Supabase database. This server connects to a personal data management system and allows you to search and explore your data categories through MCP.
=======
# DataDam Personal Data MCP Server

DataDam is a Model Context Protocol (MCP) server backed by Supabase. It supports both streamable HTTP endpoints and stdio connections, allowing multiple AI tools to share a single personal database.
>>>>>>> Stashed changes

## Available Tools

- **search-personal-data** - Search through personal data by title and content for a specific user
- **extract-personal-data** - Extract groups of similar entries by tags from user profiles  
- **create-personal-data** - Automatically capture and store personal data mentioned in conversations
- **update-personal-data** - Update existing personal data records with new information
- **delete-personal-data** - Delete personal data records with GDPR compliance options

<<<<<<< Updated upstream
## Installation

1. Clone this repository:
   ```bash
   git clone <repository-url>
   cd datadam_mcp
   ```
=======
- How it works
  - MCP clients discover tools automatically once connected. 
  - Your AI tool will invoke the neccessary tools in your console/command line. 
  - More information on how each tool works can be found [here](#tool-details)
  - Categories group related records (e.g., `books`, `contacts`, `documents`). All datapoints are assigned to a category.
  - Tags are optional labels (e.g., `family`, `work`, `sci-fi`) for finer filtering within a category.
  - Records store structured JSON content and metadata; you can search by title/content or list by category.

- Data model
  - Categories are maintained in the database and surfaced via the `data://categories` resource, which are static at the moment. 
  - Filtering order: choose a category first, then use `tags` to further narrow results within that category (tags are optional refinements, not replacements).
>>>>>>> Stashed changes

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and add your Supabase credentials:
   - `SUPABASE_URL` - Your Supabase project URL
   - `SUPABASE_SERVICE_ROLE_KEY` - Your Supabase service role key
   - `DATABASE_USER_ID` - Your user UUID from the auth.users table

4. Build the TypeScript code:
   ```bash
   npm run build
   ```

<<<<<<< Updated upstream
## Usage
=======
ChatGPT only allows 2 tools and GET tools, so you cannot create data within ChatGPT. But you can use other AIs listed here to create data in your DataDam

| Tool | Title | Purpose | Required | Optional |
| --- | --- | --- | --- | --- |
| `search` | Search (ChatGPT) | Return citation-friendly results for a query. | `query` | — |
| `fetch` | Fetch (ChatGPT) | Return full document content by ID. | `id` | — |
>>>>>>> Stashed changes

### Claude Desktop Integration

<<<<<<< Updated upstream
To use this MCP server with Claude Desktop, add the following configuration to your Claude Desktop config file at `/Users/kenne/Library/Application Support/Claude/claude_desktop_config.json`:

=======
DataDam supports two connection methods:

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

Happy to help if you have any problems w the setup! Shoot me a message or send me an email at kennethleeje8@gmail.com :)

## Prerequisites

- Accounts: Supabase (required), Render (for hosting)
- CLI: PostgreSQL client `psql`, Node.js + npm (for building before deploy if needed)

## Supabase Setup (Details)

1) Create a user (Auth)
- Supabase Dashboard → Authentication → Users → Add user
- Copy the user UUID for later (optional user scoping)

2) Load schema with `psql`
- Supabase → Project settings → Database → Connection strings → choose Transaction Pooler (`psql`)
- Run: `psql "<transaction_pooler_string>" -f src/database/schema.sql` in sql (file: src/database/schema.sql)
- If you don't have `psql` installed, download PostgreSQL and the CLI from the official site: [PostgreSQL Downloads](https://www.postgresql.org/download/)

3) You should see your Supabase table editor view populated with tables. 

## Render Deployment

Feel free to use any hosting platfrom, this is personal preference. 

- Repo includes `render.yaml` with sane defaults (render.yaml)
- Service type: Web Service
- Build command: `npm install && npm run build`
- Start command: `npm start`
- Health check path: `/health`
- Plan tips: The free tier is fine for testing but can crash or hit limits; use a higher tier (e.g., Standard) for good uptime

Environment (Render dashboard)
- `SUPABASE_URL`
Find it in Project Settings → Data API → Project URL. 
- `SUPABASE_SERVICE_ROLE_KEY`
Find it in Project Settings → API Keys → service_role key.  
- `NODE_ENV=production`

## Client Configuration Examples

### HTTP Connections

For hosted deployments using streamable HTTP:

Notes
- The server's database credentials belong in hosting platform environment variables, not in clients

Claude Desktop (Custom Connector)
- Open Claude Desktop → Connectors → Add Custom Connector.
- Name: `DataDam`
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
    "DataDam": {
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
- The client launches the server process directly

MCP Client Config:
>>>>>>> Stashed changes
```json
{
  "mcpServers": {
    "DataDam": {
      "command": "node",
      "args": ["path/to/server.js"],
      "cwd": "cloned github directory",
      "env": {
        "SUPABASE_URL": "your_supabase_url",
        "SUPABASE_SERVICE_ROLE_KEY": "your_service_role_key"
      }
    }
  }
}
```

<<<<<<< Updated upstream
Replace `INSERT_API_KEY_HERE` with your actual API key for the datadam service.

### Running the Server

#### Development mode (with hot reload):
```bash
npm run dev
```

#### Production mode:
```bash
npm start
```

The server will start on `http://localhost:3000` and display available endpoints and capabilities.

### Testing with MCP Inspector

The MCP Inspector is a testing tool that lets you interact with your MCP server:

1. Start the MCP server in one terminal:
   ```bash
   npm run dev
   ```

2. In another terminal, start the MCP Inspector:
   ```bash
   npm run inspector
   ```
=======
Claude Desktop
- Open Claude Desktop → Settings → Developer → Edit Config
- Add the MCP server configuration

Works w all the coding agents

## Verify

### HTTP Connections
- Health endpoint: `curl http://localhost:3000/health` (for local server)
- Test with inspector: `npm run inspector:http` (requires local server running with `npm run dev`)

### Stdio Connections
- Configure `.env` file with your Supabase credentials
- Run: `npm install` (if not done already)
- Test: `npm run inspector:stdio`
- Verify: The inspector should connect and show available tools, confirming Supabase database connection
>>>>>>> Stashed changes

3. In the MCP Inspector interface:
   - **Server URL**: Enter `http://localhost:3000/mcp`
   - **Transport**: Select "HTTP"
   - Click "Connect"

### Example Interactions

#### Using Resources

1. In MCP Inspector, go to the "Resources" tab
2. You'll see the "Data Categories" resource
3. Click on `data://categories` to see your available personal data categories

#### Using Tools

1. In MCP Inspector, go to the "Tools" tab  
2. Select "search-personal-data" tool
3. Required fields:
   - `query`: Your search term (e.g., "book", "contact", "work")
   - `userId`: Your user UUID (e.g., "399aa002-cb10-40fc-abfe-d2656eea0199")
4. Optional filters:
   - `categories`: ["books"], ["contacts"], etc.
   - `classification`: "personal", "sensitive", etc.
   - `limit`: Number of results (default 20)

## API Endpoints

The server exposes the following HTTP endpoints:

- `POST /mcp` - Client-to-server communication
- `GET /mcp` - Server-to-client notifications (SSE)
- `DELETE /mcp` - Session termination


## Development

### Scripts

- `npm run dev` - Start server in development mode
- `npm run build` - Build TypeScript to JavaScript  
- `npm start` - Start production server
- `npm run inspector` - Launch MCP Inspector for testing


## Technical Details

- **Framework**: Express.js with TypeScript
- **Database**: Supabase (PostgreSQL) with Row Level Security
- **MCP SDK**: `@modelcontextprotocol/sdk`
- **Transport**: Streamable HTTP with session management
- **CORS**: Configured for browser-based clients
- **Environment**: dotenv for configuration management

## Optional: User Setup and Context

If you want to scope data to specific users, you can set up user authentication and profiles:

### User Creation and Profile Setup
- Create a user in Supabase Authentication → Users; copy the UUID for later.
- Insert a profile row for your Auth user:
  - `INSERT INTO profiles (user_id, username, full_name, metadata) VALUES ('<AUTH_USER_UUID>'::uuid, 'your_username', 'Your Name', '{}'::jsonb);`

### Using User Context
- Some tools can scope operations to a particular user by accepting a `userId` argument (UUID from Supabase Auth). This field is optional.
- If your client supports passing environment variables to tool calls, you may set a convenience variable like `DATABASE_USER_ID` in the client's MCP config and have your prompts/tools use it when needed.
- Otherwise, just supply `userId` explicitly in the tool call input when you want to target a specific user.

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
