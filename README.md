# Personal Data MCP Server

A Model Context Protocol (MCP) server that provides secure access to your personal data stored in a Supabase database. This server connects to a personal data management system and allows you to search and explore your data categories through MCP.

## Available Tools

- **search-personal-data** - Search through personal data by title and content for a specific user
- **extract-personal-data** - Extract groups of similar entries by tags from user profiles  
- **create-personal-data** - Automatically capture and store personal data mentioned in conversations
- **update-personal-data** - Update existing personal data records with new information
- **delete-personal-data** - Delete personal data records with GDPR compliance options

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
   - `MCP_API_KEY` - API key required to access the MCP endpoints (generate with `npm run generate:mcp-token`)

4. Build the TypeScript code:
   ```bash
   npm run build
   ```

### Generate an API Key

Use the helper script to create a signed JWT that can be used as your MCP API key:

```bash
npm run generate:mcp-token
```

The command prints a token that should be added to both your server environment (`MCP_API_KEY`) and any MCP clients (for example, the stdio bridge or Inspector requests). The script also accepts optional flags:

- `--secret <value>` – sign the JWT with a specific secret instead of a random one
- `--subject <value>` – customise the token subject (defaults to `mcp-client`)
- `--expires-in-days <number>` – token validity window (defaults to 30 days)

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

All `/mcp` routes require an `Authorization: Bearer <MCP_API_KEY>` header (or `X-API-Key` header) that matches the API key configured on the server.


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
