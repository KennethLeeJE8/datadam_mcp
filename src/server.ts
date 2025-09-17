import express from "express";
import cors from "cors";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

interface PersonalDataRecord {
  id: string;
  user_id: string;
  title: string;
  content: any;
  tags: string[];
  category: string;
  classification: string;
  created_at: string;
  updated_at: string;
}

interface Category {
  category_name: string;
  display_name: string;
  description: string;
  item_count: number;
  trigger_words: string[];
  query_hint: string;
  example_queries: string[];
  last_modified: string;
}

let supabase: SupabaseClient;

async function initializeDatabase(): Promise<void> {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration. Please check your .env file.");
    }

    supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Test the connection by fetching category stats
    const { data, error } = await supabase.rpc('get_category_stats');
    
    if (error) {
      throw error;
    }
    
    console.log(`✅ Connected to Supabase successfully`);
    console.log(`Database stats:`, data?.[0] || 'No data');
  } catch (error) {
    console.error("❌ Error connecting to database:", error);
    throw error;
  }
}

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "personal-data-mcp-server",
    version: "1.0.0"
  });

  // Register the categories list resource
  server.registerResource(
    "data-categories",
    "data://categories",
    {
      title: "Data Categories",
      description: "List of available personal data categories with item counts"
    },
    async (uri) => {
      try {
        const { data: categories, error } = await supabase.rpc('get_active_categories');
        
        if (error) {
          return {
            contents: [{
              uri: uri.href,
              text: `Error fetching categories: ${error.message}`,
              mimeType: "text/plain"
            }]
          };
        }

        if (!categories || categories.length === 0) {
          return {
            contents: [{
              uri: uri.href,
              text: "No data categories found. Add some personal data to see categories here.",
              mimeType: "text/plain"
            }]
          };
        }

        const categoriesList = categories.map((cat: Category) => 
          `${cat.display_name} (${cat.item_count} items)
   Category: ${cat.category_name}
   Description: ${cat.description}
   Keywords: ${cat.trigger_words.join(', ')}
   Query when: ${cat.query_hint}
   Examples: ${cat.example_queries.join(' | ')}`
        ).join('\n\n');
        
        return {
          contents: [{
            uri: uri.href,
            text: `Available Personal Data Categories:\n\n${categoriesList}`,
            mimeType: "text/plain"
          }]
        };
      } catch (error) {
        return {
          contents: [{
            uri: uri.href,
            text: `Database connection error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            mimeType: "text/plain"
          }]
        };
      }
    }
  );

  // Register the search personal data tool
  server.registerTool(
    "search-personal-data",
    {
      title: "Search Personal Data",
      description: "Search through personal data by title and content for a specific user",
      inputSchema: {
        query: z.string().describe("Search query to find in titles and content"),
        userId: z.string().describe("User ID (UUID) to search data for"),
        categories: z.array(z.string()).optional().describe("Filter by specific categories (e.g., 'books', 'contacts')"),
        classification: z.enum(['public', 'personal', 'sensitive', 'confidential']).optional().describe("Filter by classification level"),
        limit: z.number().min(1).max(100).default(20).describe("Maximum number of results to return")
      }
    },
    async ({ query, userId, categories, classification, limit = 20 }) => {
      try {
        // Remove surrounding quotes if present
        const cleanQuery = query.replace(/^["']|["']$/g, '').trim();

        const { data: results, error } = await supabase.rpc('search_personal_data', {
          p_user_id: userId,
          p_search_text: cleanQuery,
          p_categories: (categories && categories.length > 0) ? categories : null,
          p_tags: null,
          p_classification: classification || null,
          p_limit: limit,
          p_offset: 0
        });

        if (error) {
          return {
            content: [{
              type: "text",
              text: `Database error: ${error.message}`
            }]
          };
        }

        if (!results || results.length === 0) {
          return {
            content: [{
              type: "text",
              text: `No personal data found matching query: "${query}"`
            }]
          };
        }

        const resultText = results.map((item: PersonalDataRecord) => {
          const contentPreview = typeof item.content === 'object' 
            ? JSON.stringify(item.content, null, 2).substring(0, 200) 
            : String(item.content).substring(0, 200);
          
          return `${item.title}
   Category: ${item.category || 'Uncategorized'}
   Classification: ${item.classification}
   Tags: ${item.tags?.join(', ') || 'None'}
   Content: ${contentPreview}${contentPreview.length >= 200 ? '...' : ''}
   Updated: ${new Date(item.updated_at).toLocaleDateString()}`;
        }).join('\n\n');

        const resourceLinks = results.map((item: PersonalDataRecord) => ({
          type: "resource_link" as const,
          uri: `data://item/${item.id}`,
          name: item.title,
          description: `${item.category} - ${item.classification}`
        }));

        return {
          content: [
            {
              type: "text",
              text: `Found ${results.length} items matching "${query}":\n\n${resultText}`
            },
            ...resourceLinks
          ]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error searching personal data: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  );

  // Register the extract personal data tool
  server.registerTool(
    "extract-personal-data",
    {
      title: "Extract Personal Data by Tags",
      description: "Extract groups of similar entries by tags from a specific user profile or all profiles. Use categories for broad collection retrieval (e.g., all books, all contacts) and tags for specific filtering (e.g., 'family' contacts, 'sci-fi' books). Combine both for precise results or use either one independently based on the user's request.",
      inputSchema: {
        tags: z.array(z.string()).min(1).describe("Tags for specific filtering within or across categories (e.g., ['family'] for family members, ['sci-fi'] for sci-fi books). Use alone for targeted extraction or combine with categories for precise filtering"),
        userId: z.string().optional().describe("Optional: Specify which user profile to extract from. If omitted, searches all profiles."),
        categories: z.array(z.enum(['contacts', 'basic_information', 'digital_products', 'preferences', 'interests', 'favorite_authors', 'books', 'documents'])).optional().describe("Optional: Use for broad collection retrieval (e.g., 'books' for all books, 'contacts' for all contacts). Can be combined with tags for refined filtering or used alone for category-wide extraction"),
        filters: z.record(z.any()).optional().describe("Optional: Additional filtering criteria"),
        limit: z.number().min(1).max(100).default(50).describe("Maximum number of records"),
        offset: z.number().min(0).default(0).describe("Pagination offset")
      }
    },
    async ({ tags, userId, categories, filters, limit = 50, offset = 0 }) => {
      try {
        const { data: results, error } = await supabase.rpc('extract_personal_data', {
          p_tags: tags,
          p_user_id: userId || null,
          p_categories: (categories && categories.length > 0) ? categories : null,
          p_filters: filters || null,
          p_limit: limit,
          p_offset: offset
        });

        if (error) {
          return {
            content: [{
              type: "text",
              text: `Database error: ${error.message}`
            }]
          };
        }

        if (!results || results.length === 0) {
          return {
            content: [{
              type: "text",
              text: `No personal data found with tags: ${tags.join(', ')}`
            }]
          };
        }

        const resultText = results.map((item: PersonalDataRecord) => {
          const contentPreview = typeof item.content === 'object' 
            ? JSON.stringify(item.content, null, 2).substring(0, 200) 
            : String(item.content).substring(0, 200);
          
          return `${item.title}
   Category: ${item.category || 'Uncategorized'}
   Classification: ${item.classification}
   Tags: ${item.tags?.join(', ') || 'None'}
   Content: ${contentPreview}${contentPreview.length >= 200 ? '...' : ''}
   Updated: ${new Date(item.updated_at).toLocaleDateString()}`;
        }).join('\n\n');

        return {
          content: [{
            type: "text",
            text: `Found ${results.length} items with tags [${tags.join(', ')}]:\n\n${resultText}`
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error extracting personal data: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  );

  // Register the create personal data tool
  server.registerTool(
    "create-personal-data",
    {
      title: "Create Personal Data",
      description: "Automatically capture and store ANY personal data mentioned in conversations. This tool should be called whenever the user shares ANY personal information like names, contacts, preferences, locations, interests, or any other personal details.",
      inputSchema: {
        userId: z.string().describe("User identifier"),
        dataType: z.enum(['contact', 'document', 'preference', 'custom', 'book', 'author', 'interest', 'software']).describe("Type of data - will be auto-mapped to appropriate category"),
        title: z.string().describe("Record title"),
        content: z.record(z.any()).describe("Record content"),
        tags: z.array(z.string()).optional().describe("Tags for categorization"),
        classification: z.enum(['public', 'personal', 'sensitive', 'confidential']).default('personal').describe("Data classification level")
      }
    },
    async ({ userId, dataType, title, content, tags, classification = 'personal' }) => {
      try {
        // Map data_type to category
        const categoryMapping: Record<string, string> = {
          'contact': 'contacts',
          'document': 'documents',
          'preference': 'preferences', 
          'custom': 'basic_information',
          'book': 'books',
          'author': 'favorite_authors',
          'interest': 'interests',
          'software': 'digital_products'
        };

        const category = categoryMapping[dataType] || 'basic_information';

        const { data: result, error } = await supabase.rpc('create_personal_data', {
          p_user_id: userId,
          p_category: category,
          p_title: title,
          p_content: content,
          p_tags: tags || [],
          p_classification: classification
        });

        if (error) {
          return {
            content: [{
              type: "text",
              text: `Database error: ${error.message}`
            }]
          };
        }

        return {
          content: [{
            type: "text",
            text: `Successfully created personal data record: "${title}" in category "${category}"`
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error creating personal data: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  );

  // Register the update personal data tool
  server.registerTool(
    "update-personal-data",
    {
      title: "Update Personal Data",
      description: "Automatically update existing personal data records when new or updated information is mentioned. Requires the UUID of the specific data record to identify which item to update. This tool should be called whenever the user provides ANY updated information about previously stored data.",
      inputSchema: {
        recordId: z.string().describe("Record identifier (UUID) to update"),
        updates: z.record(z.any()).describe("Fields to update"),
        conversationContext: z.string().optional().describe("The conversation context from which to extract updates (for passive mode)")
      }
    },
    async ({ recordId, updates, conversationContext }) => {
      try {
        // Debug logging
        console.log('Update parameters:', {
          recordId,
          updates: JSON.stringify(updates, null, 2),
          conversationContext
        });

        const { data: result, error } = await supabase.rpc('update_personal_data', {
          p_record_id: recordId,
          p_updates: updates,
          p_conversation_context: conversationContext || null
        });

        console.log('Update result:', { result, error });

        if (error) {
          return {
            content: [{
              type: "text",
              text: `Database error: ${error.message}`
            }]
          };
        }

        return {
          content: [{
            type: "text",
            text: `Successfully updated personal data record: ${recordId}`
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error updating personal data: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  );

  // Register the delete personal data tool
  server.registerTool(
    "delete-personal-data",
    {
      title: "Delete Personal Data",
      description: "Delete personal data records. Requires the UUID(s) of the specific data record(s) to identify which items to delete. Use with caution - supports both soft and hard deletion for GDPR compliance.",
      inputSchema: {
        recordIds: z.array(z.string()).min(1).describe("Record identifiers (UUIDs) to delete"),
        hardDelete: z.boolean().default(false).describe("Permanent deletion for GDPR compliance")
      }
    },
    async ({ recordIds, hardDelete = false }) => {
      try {
        const { data: result, error } = await supabase.rpc('delete_personal_data', {
          p_record_ids: recordIds,
          p_hard_delete: hardDelete
        });

        if (error) {
          return {
            content: [{
              type: "text",
              text: `Database error: ${error.message}`
            }]
          };
        }

        const deleteType = hardDelete ? 'permanently deleted' : 'soft deleted';
        return {
          content: [{
            type: "text",
            text: `Successfully ${deleteType} ${recordIds.length} personal data record(s)`
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error deleting personal data: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  );

  return server;
}

function createChatGptMcpServer(): McpServer {
  const server = new McpServer({
    name: "chatgpt-mcp-server",
    version: "1.0.0"
  });

  // Register the search tool for ChatGPT
  server.registerTool(
    "search",
    {
      title: "Search",
      description: "Search through personal data by matching against title, tags, and categories only (not content). Available categories: contacts, documents, books, basic_information, digital_products, preferences, interests, favorite_authors.",
      inputSchema: {
        query: z.string().describe("Search query to find relevant documents")
      }
    },
    async ({ query }) => {
      try {
        const { data: results, error } = await supabase.rpc('chatgpt_search_data', {
          p_query: query,
          p_user_id: null, // Search across all users for ChatGPT
          p_limit: 10
        });

        if (error) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                error: `Database error: ${error.message}`
              })
            }]
          };
        }

        if (!results || results.length === 0) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                results: []
              })
            }]
          };
        }

        // Format results according to ChatGPT specification
        const formattedResults = results.map((item: any) => ({
          id: item.id,
          title: item.title,
          url: item.url
        }));

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              results: formattedResults,
              search_info: "Searched in: title, tags, and categories (not content)"
            })
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              error: `Error searching data: ${error instanceof Error ? error.message : 'Unknown error'}`
            })
          }],
          isError: true
        };
      }
    }
  );

  // Register the fetch tool for ChatGPT
  server.registerTool(
    "fetch",
    {
      title: "Fetch",
      description: "Retrieve complete document content by ID including full text, metadata, and all associated information",
      inputSchema: {
        id: z.string().describe("Document ID to fetch")
      }
    },
    async ({ id }) => {
      try {
        const { data: results, error } = await supabase.rpc('chatgpt_fetch_data', {
          p_document_id: id
        });

        if (error) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                error: `Database error: ${error.message}`
              })
            }]
          };
        }

        if (!results || results.length === 0) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                error: `Document not found: ${id}`
              })
            }]
          };
        }

        const doc = results[0];
        
        // Format result according to ChatGPT specification
        const formattedResult = {
          id: doc.id,
          title: doc.title,
          text: doc.text,
          url: doc.url,
          metadata: doc.metadata
        };

        return {
          content: [{
            type: "text",
            text: JSON.stringify(formattedResult)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              error: `Error fetching document: ${error instanceof Error ? error.message : 'Unknown error'}`
            })
          }],
          isError: true
        };
      }
    }
  );

  return server;
}

async function main() {
  // Initialize database connection
  await initializeDatabase();

  const app = express();
  
  // CORS configuration for browser-based clients
  app.use(cors({
    origin: '*',
    exposedHeaders: ['Mcp-Session-Id'],
    allowedHeaders: ['Content-Type', 'mcp-session-id'],
  }));
  
  app.use(express.json());

  // Health check endpoint for Render
  app.get('/health', (req: express.Request, res: express.Response) => {
    res.status(200).json({ 
      status: 'healthy',
      service: 'MCP Personal Data Server',
      timestamp: new Date().toISOString()
    });
  });

  // Map to store transports by session ID
  const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};
  
  // Separate transport map for ChatGPT endpoint
  const chatgptTransports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

  // Handle POST requests for client-to-server communication
  app.post('/mcp', async (req: express.Request, res: express.Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports[sessionId]) {
      // Reuse existing transport
      transport = transports[sessionId];
    } else if (!sessionId && isInitializeRequest(req.body)) {
      // New initialization request
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sessionId) => {
          transports[sessionId] = transport;
          console.log(`New session initialized: ${sessionId}`);
        },
        enableDnsRebindingProtection: false,
      });

      // Clean up transport when closed
      transport.onclose = () => {
        if (transport.sessionId) {
          console.log(`Session closed: ${transport.sessionId}`);
          delete transports[transport.sessionId];
        }
      };

      const server = createMcpServer();
      await server.connect(transport);
    } else {
      // Invalid request
      res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Bad Request: No valid session ID provided',
        },
        id: null,
      });
      return;
    }

    // Handle the request
    await transport.handleRequest(req, res, req.body);
  });

  // Handle GET requests for server-to-client notifications via SSE
  app.get('/mcp', async (req: express.Request, res: express.Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }
    
    const transport = transports[sessionId];
    await transport.handleRequest(req, res);
  });

  // Handle DELETE requests for session termination
  app.delete('/mcp', async (req: express.Request, res: express.Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }
    
    const transport = transports[sessionId];
    await transport.handleRequest(req, res);
  });

  // ChatGPT-specific endpoint routes
  // Handle POST requests for ChatGPT client-to-server communication
  app.post('/chatgpt_mcp', async (req: express.Request, res: express.Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    if (sessionId && chatgptTransports[sessionId]) {
      // Reuse existing transport
      transport = chatgptTransports[sessionId];
    } else if (!sessionId && isInitializeRequest(req.body)) {
      // New initialization request
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sessionId) => {
          chatgptTransports[sessionId] = transport;
          console.log(`New ChatGPT session initialized: ${sessionId}`);
        },
        enableDnsRebindingProtection: false,
      });

      // Clean up transport when closed
      transport.onclose = () => {
        if (transport.sessionId) {
          console.log(`ChatGPT session closed: ${transport.sessionId}`);
          delete chatgptTransports[transport.sessionId];
        }
      };

      const server = createChatGptMcpServer();
      await server.connect(transport);
    } else {
      // Invalid request
      res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Bad Request: No valid session ID provided',
        },
        id: null,
      });
      return;
    }

    // Handle the request
    await transport.handleRequest(req, res, req.body);
  });

  // Handle GET requests for ChatGPT server-to-client notifications via SSE
  app.get('/chatgpt_mcp', async (req: express.Request, res: express.Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !chatgptTransports[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }
    
    const transport = chatgptTransports[sessionId];
    await transport.handleRequest(req, res);
  });

  // Handle DELETE requests for ChatGPT session termination
  app.delete('/chatgpt_mcp', async (req: express.Request, res: express.Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !chatgptTransports[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }
    
    const transport = chatgptTransports[sessionId];
    await transport.handleRequest(req, res);
  });

  const PORT = process.env.PORT || 3000;
  const HOST = '0.0.0.0'; // Bind to all interfaces for Render
  
  app.listen(Number(PORT), HOST, () => {
    console.log(`🚀 MCP Personal Data Server listening on ${HOST}:${PORT}`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
    
    if (process.env.NODE_ENV === 'production') {
      console.log(`🔗 Server is ready to accept connections`);
    } else {
      console.log(`🌐 Available endpoints:`);
      console.log(`- POST/GET/DELETE http://localhost:${PORT}/mcp (Full MCP server)`);
      console.log(`- POST/GET/DELETE http://localhost:${PORT}/chatgpt_mcp (ChatGPT connector)`);
      console.log(`\nResources:`);
      console.log(`- data://categories - List available personal data categories`);
      console.log(`\n🔍 Main Tools:`);
      console.log(`- search-personal-data - Search through personal data by title and content`);
      console.log(`- extract-personal-data - Extract data by tags`);
      console.log(`- create-personal-data - Create new personal data records`);
      console.log(`- update-personal-data - Update existing records`);
      console.log(`- delete-personal-data - Delete records`);
      console.log(`\n🤖 ChatGPT Tools:`);
      console.log(`- search - Search for documents (ChatGPT format)`);
      console.log(`- fetch - Fetch complete document content (ChatGPT format)`);
      console.log(`\n💡 Make sure to configure your .env file with database credentials!`);
    }
  });
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down server...');
  process.exit(0);
});

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});