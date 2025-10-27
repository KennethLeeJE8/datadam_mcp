# DataDam Personal Data MCP Server

DataDam is a Model Context Protocol (MCP) server backed by Supabase. It supports both streamable HTTP endpoints and stdio connections, allowing multiple AI tools to share a single personal database.

Important: There is no auth yet. Do not store sensitive data. OAuth is planned.

## 🚀 Quick Links

- **[Quickstart Setup](#quickstart)** - Get started in minutes
- **[Client Configuration](#client-configuration-examples)** - Connect your AI tool (Claude, ChatGPT, Cursor, etc.)
- **[Tool Details](#tool-details)** - Learn how to use each tool
- **[Troubleshooting](#troubleshooting)** - Common issues and solutions

---

## How to Use DataDam

**The Problem:** Your AI forgets everything between conversations. You waste 10-20 minutes every time re-explaining context that should already be known.

**The Solution:** DataDam is a **persistent memory layer** that decouples your personal information from your AI tool's unstable memory. Mention something once, and it's remembered forever across all conversations.

---

### Example 1: Book Recommendations

**❌ WITHOUT DataDam:**
```
You: "Recommend a book for me?"

AI: "What genres do you like? What have you read? Any favorite authors?"

You: "I like sci-fi, I've read Project Hail Mary, The Martian, Children of Time,
     Ender's Game... I prefer hard sci-fi with good character development, nothing
     too militaristic, I read about 50 books a year so I've probably read most
     popular ones..."

[15 minutes of typing the same preferences you've typed 20 times before]
```

**✅ WITH DataDam:**
```
You: "Recommend a book for me?"

AI: [Automatically retrieves: 50+ books you've read, favorite genres (hard sci-fi),
    preferred themes (character development), dislikes (militaristic), reading pace]

    "Based on your love of hard sci-fi like Project Hail Mary and your preference
    for character-driven stories, try 'A Memory Called Empire' by Arkady Martine.
    It's got the political intrigue of Dune with deep character development,
    and you haven't read it yet."

You: [0 minutes of setup. Instant, personalized answer.]
```

**Time saved:** 15 minutes → 0 minutes

---

### Example 2: Travel Planning

**❌ WITHOUT DataDam:**
```
You: "Help me plan a trip to Japan"

AI: "Great! What's your travel style? Budget? Dietary restrictions?
     Physical limitations? Preferred activities?"

You: "I'm vegetarian with shellfish allergy, prefer boutique hotels around
     $200/night, I have a knee injury so nothing too strenuous, I love
     historical sites and temples, I prefer shoulder seasons..."

[20 minutes re-explaining details you've shared in 10 previous conversations]
```

**✅ WITH DataDam:**
```
You: "Help me plan a trip to Japan"

AI: [Automatically retrieves: vegetarian + shellfish allergy, $200/night budget,
    knee injury, loves temples/historical sites, prefers shoulder seasons]

    "Perfect! I'm thinking late April (shoulder season). I'll focus on:
    - Kyoto temples (you'll love them based on your Thailand temple experience)
    - Boutique ryokans around ¥25,000/night (your $200 budget)
    - Knee-friendly itinerary with rest days between heavy walking
    - Restaurants with vegetarian options + no shellfish risk

    Sound good?"

You: [0 minutes explaining. Your AI already knows your constraints.]
```

**Time saved:** 20 minutes → 0 minutes

---

### The Core Difference

| Without DataDam | With DataDam |
|----------------|--------------|
| ❌ Repeat yourself every conversation | ✅ Mention once, remember forever |
| ❌ 10-20 min setup per conversation | ✅ 0 min setup, instant context |
| ❌ Memory resets when chat resets | ✅ Persistent memory across all chats |
| ❌ Context lost when switching AI tools | ✅ Same context across all AI tools |
| ❌ Generic, one-size-fits-all responses | ✅ Deeply personalized responses |

---

### How It Works

Just **talk naturally** - DataDam works invisibly in the background:

1. **First mention:** "My friend Sarah works at Microsoft (sarah.chen@microsoft.com)"
   → DataDam proactively stores this in `contacts`

2. **Weeks later:** "Email my Microsoft friend, Sarah, about the project"
   → DataDam retrieves Sarah's info automatically

3. **No commands needed** - Your AI handles all the storage and retrieval

### Available Categories

- **contacts** - People, emails, relationships
- **books** - Reading history and preferences
- **interests** - Hobbies, skills, topics you care about
- **digital_products** - Tools and technologies you use
- **basic_information** - Personal details and background
- **favorite_authors** - Authors you love

This is based off of personal interests and use, feel free to suggest categories to add.

---

## Tools Overview

- How it works
  - Your AI tool will invoke the neccessary tools in your console/command line upon needing personal information.
  - It will also fill out the parameters of the call itself
  - Categories group related records (e.g., `books`, `contacts`, `basic_information`). All datapoints are assigned to a category.
  - Tags are used as an optional refinement to narrow down results within each category
  - More information on how each tool works can be found [here](#tool-details)

- Data model
  - Categories are maintained in the database and surfaced via the `data://categories` resource, which are static at the moment. 
  - Filtering order: choose a category first, then use `tags` to further narrow results within that category (tags are optional refinements, not replacements).

- Server tools (at `…/mcp`)

| Tool | Title | Purpose | Required | Optional |
| --- | --- | --- | --- | --- |
| `datadam_search_personal_data` | Search Personal Data | Find records by title and content; filter by categories/tags. | `query` | `categories`, `tags`, `classification`, `limit`, `userId` |
| `datadam_extract_personal_data` | Extract Personal Data by Category | List items in one category, optionally filtered by tags. | `category` | `tags`, `limit`, `offset`, `userId`, `filters` |
| `datadam_create_personal_data` | Create Personal Data | Store a new record with category, title, and JSON content. | `category`, `title`, `content` | `tags`, `classification`, `userId` |
| `datadam_update_personal_data` | Update Personal Data | Update fields on an existing record by ID. | `recordId` | `title`, `content`, `tags`, `category`, `classification` |
| `datadam_delete_personal_data` | Delete Personal Data | Delete one or more records; optional hard delete. | `recordIds` | `hardDelete` |

- ChatGPT endpoint tools (at `…/chatgpt_mcp`)

| Tool | Title | Purpose | Required | Optional |
| --- | --- | --- | --- | --- |
| `search` | Search (ChatGPT) | Return citation-friendly results for a query. | `query` | — |
| `fetch` | Fetch (ChatGPT) | Return full document content by ID. | `id` | — |

## Connection Types

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

## Prerequisites

- **Homebrew**: Package Manager for MacOS and Linux - [Homebrew](https://brew.sh/)
- **Git**: Version control system - [Download Git](https://git-scm.com/downloads)
- **Node.js + npm**: JavaScript runtime and package manager - [Download Node.js](https://nodejs.org/en/download)
- **Accounts**: Supabase (required), Render (for hosting)

## Quickstart

### **Installation**

**1.** Clone this repository:
   ```bash
   git clone https://github.com/KennethLeeJE8/datadam_mcp.git && cd datadam_mcp
   ```

**2.** Install dependencies:
   ```bash
   npm install
   ```

**3.** Build the TypeScript code:
   ```bash
   npm run build
   ```

Happy to help if you have any problems w the setup! Shoot me a message or send me an email at kennethleeje8@gmail.com :)

### **Supabase Setup**

**1.** Create a Supabase account
- Go to [Supabase Sign Up](https://supabase.com/dashboard/sign-up) to create your account
- **Important**: Remember your password - you'll need it for the database connection later
- Create a new project and wait for it to finish setting up

**2.** Load the database schema in Supabase SQL Editor:
- Copy the entire contents of [src/database/schema.sql](./src/database/schema.sql) 
- Supabase Dashboard → SQL Editor → New query
- Paste the copied schema code into the editor
- Click "Run" to execute the schema

**3.** You should see your Supabase table editor view populated with tables in "Table Editor".

✅ **Supabase setup is complete!** Your database is ready to use.

### **Choose Your Connection Type**

Select the connection method based on your AI tools and subscription tiers:

- **Option A: Stdio (Standard Input/Output)**
  - Use for: Coding agents (Cursor, Windsurf, etc.), Claude Desktop (Free tier)
  - Next step: Continue to [Local Testing](#local-testing) section below

- **Option B: HTTP Streamable**
  - Use for: ChatGPT Plus or higher, Claude Pro or higher, Coding agents (Cursor, Windsurf, etc.)
  - Next step: Skip to [Render Deployment](#render-deployment-only-for-streamable-http-server) section

### **Local Testing**

**1.** Set up environment variables by cloning the .env file:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and add your Supabase credentials:

   **To find your SUPABASE_URL:**
   - Supabase Dashboard → Project Settings → Data API → Project URL

   **To find your SUPABASE_SERVICE_ROLE_KEY:**
   - Supabase Dashboard → Project Settings → API Keys → service_role (click "Reveal" to copy)

**2.** Test the connection with the MCP Inspector:
   ```bash
   npm run inspector:stdio
   ```
   - **Transport**: Select "stdio"
   - **Arguments**: Enter "server.js"
   - Click "Connect"

**3.** Verify the setup:
   - **Verify**: The inspector should connect and show available tools, confirming Supabase database connection
   - **Test**: Go to the Tools tab and click "List Tools" → find "extract_personal_data_tool" → enter "interests" for categories → click "Run Tool" to verify database connectivity
   - You should see a datapoint on "MCP (Model Context Protocol)"

### **Render Deployment (Only for Streamable HTTP Server)**

Feel free to use any hosting platform, this is personal preference.

**1.** Create a Render account at [Render](https://dashboard.render.com/register) or sign in if you have an existing account


**2.** [![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/KennethLeeJE8/datadam_mcp)

You'll be prompted to fill in the required environment variables:
- Ensure that branch is `main`
- `SUPABASE_URL` - Get from: Supabase Dashboard → Project Settings → API → Project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Get from: Supabase Dashboard → Project Settings → API → Project API keys → service_role (click "Reveal" to copy)

Ensure that the environment variables are filled out correctly, otherwise the deployment will fail. 

### **Verify HTTP Connections**
- Health endpoint: `curl http://{render_url}/health`

### **Verify HTTP Tools**
- **Test**: 
Go back to the Command Line and run:
  ```bash
  npm run inspector:http
  ```
   - **Server URL**: Enter `http://<YOUR_RENDER_URL>/mcp`
   - **Transport**: Select "HTTP"
   - Click "Connect"
- **Verify**: The inspector should connect and show available tools, confirming Supabase database connection
- **Test**: Go to the Tools tab and click "List Tools" → find "extract_personal_data_tool" → enter "interests" for categories → click "Run Tool" to verify database connectivity

## Client Configuration Examples

### **HTTP Connections**

For hosted deployments using streamable HTTP:

Notes
- The server's database credentials belong in hosting platform environment variables, not in clients

Claude Desktop (Custom Connector)
- Open Claude Desktop → Connectors → Add Custom Connector.
- Name: `dataDam`
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
    "dataDam": {
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

### **Stdio Connections**

For local development using stdio transport:

Notes
- Clone this repository locally and use the `server.js` file
- The client launches the server process directly

MCP Client Config:
```json
{
  "mcpServers": {
    "dataDam": {
      "command": "node",
      "args": ["path/to/server.js"],
      "env": {
        "SUPABASE_URL": "your_supabase_url",
        "SUPABASE_SERVICE_ROLE_KEY": "your_service_role_key"
      }
    }
  }
}
```
⚠️ **Important**: Update the path to `server.js` and replace environment variables with your actual Supabase credentials

**Claude Desktop**
- Open Claude Desktop → Settings → Developer → Edit Config
- Add the MCP server configuration

**Claude Code**
- Open your `.claude.json` file in your IDE (use search tool to search for "mcp" if you can't find it)
- Add the MCP server configuration under mcpServers

**Config file locations:**
- **Codex**: `~/.codex/config.toml` (see [docs](https://github.com/openai/codex/blob/main/docs/config.md))
- **Other coding agents**: Similar JSON format in their respective config files

Works w all the coding agents

## Technical Details

- **Framework**: Express.js with TypeScript
- **Database**: Supabase (PostgreSQL) with Row Level Security
- **MCP SDK**: `@modelcontextprotocol/sdk`
- **CORS**: Configured for browser-based clients
- **Environment**: dotenv for configuration management

Categories available:
- interests
- digital_products
- favourite_authors
- basic_information
- contacts
- books

The MCP Server is designed to teach the AI to retrieve personal information it needs to answer your questions. Your AI tool should make tool calls as it needs personal context to give you a better answer.

Tips to use tools:
- Mention DataDam MCP in your prompt to let the AI tool know your want data from it
- Using "my {category_name}" in your query will trigger the AI to use DataDam
- Ensure to use plural form for the categories, such as 'books' instead of book, 'contacts' instead of 'contact


## Tool Details


You can add categories in the category_resgistry table and it will dynamically update in resources. 

### Server tools (at `…/mcp`)
- datadam_search_personal_data
  - Purpose: Find records by title and content; optionally filter by categories and tags.
  - Args: `query` (required); `categories?` string[]; `tags?` string[]; `classification?` one of `public|personal|sensitive|confidential`; `limit?` number (default 20); `userId?` string (UUID).
  - Example:
    ```json
    {
      "query": "John",
      "categories": ["contacts"],
      "limit": 10
    }
    ```

- datadam_extract_personal_data
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

- datadam_create_personal_data
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

- datadam_update_personal_data
  - Purpose: Update fields on an existing record by ID.
  - Args: `recordId` (required string UUID); plus any fields to change: `title?`, `content?`, `tags?`, `category?`, `classification?`.
  - Example:
    ```json
    {
      "recordId": "<UUID>",
      "title": "Emergency Contact – Updated"
    }
    ```

- datadam_delete_personal_data
  - Purpose: Delete one or more records; optional hard delete for permanent removal.
  - Args: `recordIds` (required string[] of UUIDs); `hardDelete?` boolean (default false).
  - Example:
    ```json
    {
      "recordIds": ["<UUID1>", "<UUID2>"],
      "hardDelete": false
    }
    ```

### ChatGPT endpoint tools (at `…/chatgpt_mcp`)
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

MIT License
