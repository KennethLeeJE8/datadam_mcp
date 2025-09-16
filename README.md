# Personal Data MCP Server

A Model Context Protocol (MCP) server that provides secure access to your personal data stored in a Supabase database. This server connects to a personal data management system and allows you to search and explore your data categories through MCP.

## Features

### Resources
- **Data Categories** (`data://categories`) - List available personal data categories with item counts and contextual information

### Tools  
- **search-personal-data** - Search through personal data by title and content for a specific user, with optional filtering by categories and classification levels

## Installation

1. Clone this repository:
   ```bash
   git clone <repository-url>
   cd datadam_mcp
   ```

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

## Usage

### Claude Desktop Integration

To use this MCP server with Claude Desktop, add the following configuration to your Claude Desktop config file at `/Users/kenne/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "datadam": {
      "command": "node",
      "args": [
        "/path/to/your/datadam_mcp/stdio-mcp-bridge.js",
        "https://datadam-mcp.onrender.com"
      ],
      "env": {
        "DEBUG": "true",
        "MCP_API_KEY": "INSERT_API_KEY_HERE"
      }
    }
  }
}
```

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

## Database Structure

The server connects to a Supabase database with the following key tables:

### `personal_data` - Core data storage
```sql
- id: UUID (primary key)
- user_id: UUID (references auth.users)
- title: TEXT (searchable title)
- content: JSONB (flexible content storage)
- tags: TEXT[] (categorization tags)
- category: TEXT (data category)
- classification: TEXT (privacy level)
- created_at/updated_at: TIMESTAMPTZ
```

### `category_registry` - Dynamic categories
```sql
- category_name: TEXT (unique identifier)
- display_name: TEXT (human-readable name)
- item_count: INTEGER (number of items)
- trigger_words: TEXT[] (AI context hints)
- query_hint: TEXT (when to query this category)
```

### Available Categories
- **basic_information** - Personal details, contact info
- **books** - Reading lists, book reviews, library
- **contacts** - Friends, family, professional network
- **documents** - Important files and records
- **digital_products** - Software, apps, tools
- **interests** - Hobbies and personal preferences
- **favorite_authors** - Authors you follow
- **preferences** - Settings and configurations

## Project Structure

```
├── src/
│   ├── server.ts           # Main MCP server implementation
│   └── database/           # Database schema files
│       ├── schema.sql      # Main database schema
│       ├── 003_error_logging.sql
│       └── 004_category_registry.sql
├── dist/                   # Compiled TypeScript output
├── .env.example            # Environment variables template
├── package.json
├── tsconfig.json
└── README.md
```

## Development

### Scripts

- `npm run dev` - Start server in development mode
- `npm run build` - Build TypeScript to JavaScript  
- `npm start` - Start production server
- `npm run inspector` - Launch MCP Inspector for testing

### Adding New Resources

To add a new resource, modify `src/server.ts` and use `server.registerResource()`:

```typescript
server.registerResource(
  "resource-name",
  "resource://uri/template", 
  {
    title: "Display Name",
    description: "Resource description"
  },
  async (uri, params) => {
    // Resource handler logic
    return {
      contents: [{
        uri: uri.href,
        text: "Resource content"
      }]
    };
  }
);
```

### Adding New Tools

To add a new tool, use `server.registerTool()`:

```typescript
server.registerTool(
  "tool-name",
  {
    title: "Tool Display Name",
    description: "Tool description", 
    inputSchema: {
      param: z.string().describe("Parameter description")
    }
  },
  async ({ param }) => {
    // Tool logic here
    return {
      content: [{
        type: "text",
        text: "Tool response"
      }]
    };
  }
);
```

## Technical Details

- **Framework**: Express.js with TypeScript
- **Database**: Supabase (PostgreSQL) with Row Level Security
- **MCP SDK**: `@modelcontextprotocol/sdk`
- **Transport**: Streamable HTTP with session management
- **CORS**: Configured for browser-based clients
- **Environment**: dotenv for configuration management

## Troubleshooting

### Common Issues

1. **Database connection failed**: 
   - Check your `.env` file has correct Supabase credentials
   - Verify `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are correct
   - Ensure the database schema is properly set up

2. **Missing user ID error**: 
   - Add your user UUID to `DATABASE_USER_ID` in `.env`
   - Get this from Supabase Dashboard > Authentication > Users

3. **No categories found**: 
   - The database might be empty
   - Add some test data to the `personal_data` table
   - Categories are auto-generated based on data content

4. **TypeScript compilation errors**: 
   ```bash
   npm install
   npm run build
   ```

5. **Inspector connection fails**: 
   - Ensure the server is running on `http://localhost:3000`
   - Check that no firewall is blocking the connection
   - Verify the URL is exactly `http://localhost:3000/mcp`

## License

ISC License
