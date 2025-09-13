# User Data MCP Server

A simple Model Context Protocol (MCP) server that provides access to user data through streamable HTTP transport. This server demonstrates basic MCP functionality with one resource and one tool.

## Features

### Resources
- **User IDs List** (`users://user_ids`) - Get a list of all available user IDs with names and roles

### Tools  
- **search-users** - Search for users by name, department, role, skills, or other criteria

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

3. Build the TypeScript code:
   ```bash
   npm run build
   ```

## Usage

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
2. You'll see the "User IDs List" resource
3. Click on `users://user_ids` to get a list of all available users

#### Using Tools

1. In MCP Inspector, go to the "Tools" tab  
2. Select "search-users" tool
3. Try these search queries:
   - `"Engineering"` - Find all engineering staff
   - `"Alice"` - Find users named Alice
   - `"Manager"` - Find all managers
   - `"JavaScript"` - Find users with JavaScript skills
   - `"San Francisco"` - Find users in San Francisco

## API Endpoints

The server exposes the following HTTP endpoints:

- `POST /mcp` - Client-to-server communication
- `GET /mcp` - Server-to-client notifications (SSE)
- `DELETE /mcp` - Session termination

## Data Structure

The server uses sample user data stored in `data/users.json`. Each user has:

```json
{
  "id": "1",
  "name": "Alice Johnson", 
  "email": "alice.johnson@company.com",
  "department": "Engineering",
  "role": "Senior Software Engineer",
  "location": "San Francisco, CA",
  "phone": "+1-555-0101",
  "startDate": "2020-03-15",
  "skills": ["JavaScript", "TypeScript", "React", "Node.js", "Python"],
  "manager": "Bob Wilson"
}
```

## Project Structure

```
├── src/
│   └── server.ts           # Main MCP server implementation
├── data/
│   └── users.json          # Sample user data
├── dist/                   # Compiled TypeScript output
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
- **MCP SDK**: `@modelcontextprotocol/sdk`
- **Transport**: Streamable HTTP with session management
- **CORS**: Configured for browser-based clients
- **DNS Rebinding Protection**: Enabled for security

## Troubleshooting

### Common Issues

1. **Port already in use**: Change the PORT in `src/server.ts` if port 3000 is occupied

2. **TypeScript compilation errors**: Make sure all dependencies are installed:
   ```bash
   npm install
   ```

3. **Inspector connection fails**: 
   - Ensure the server is running on `http://localhost:3000`
   - Check that no firewall is blocking the connection
   - Verify the URL is exactly `http://localhost:3000/mcp`

4. **CORS errors in browser**: The server is configured with permissive CORS for development. For production, update the CORS configuration in `src/server.ts`.

## License

ISC License
