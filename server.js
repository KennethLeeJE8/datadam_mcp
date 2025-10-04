import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

let supabase;
let availableCategories = [];

async function fetchAvailableCategories() {
  try {
    const { data: categories, error } = await supabase.rpc('get_active_categories');
    if (error) {
        return [];
    }
    return categories?.map((cat) => cat.category_name) || [];
  } catch (error) {
    return [];
  }
}

async function initializeDatabase() {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration. Please check your .env file.");
    }

    supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Fetch initial categories
    availableCategories = await fetchAvailableCategories();
    
    // Test the connection by fetching category stats
    const { data, error } = await supabase.rpc('get_category_stats');
    
    if (error) {
      throw error;
    }
    
  } catch (error) {
    throw error;
  }
}

function createMcpServer() {
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

        const categoriesList = categories.map((cat) => 
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
      description: "Search through personal data by title and content for a specific user. IMPORTANT: This tool should be triggered when users mention 'my' followed by any category name (e.g., 'my books', 'my contacts', 'my preferences', 'my documents', 'my favorite authors', etc.) as this indicates they want a personalized response based on their stored data. Also trigger for queries about personal information, preferences, or any stored user data.",
      inputSchema: {
        query: z.string().describe("Search query to find in titles and content. For 'my {category}' queries, extract the relevant search term or use the category name itself"),
        userId: z.string().optional().describe("Optional: User ID (UUID) to search data for. If not provided, searches across all users."),
        categories: z.array(z.string()).optional().describe("Filter by specific categories (e.g., 'books', 'contacts'). When user says 'my {category}', include that category here"),
        classification: z.enum(['public', 'personal', 'sensitive', 'confidential']).optional().describe("Filter by classification level"),
        limit: z.number().min(1).max(100).default(20).describe("Maximum number of results to return")
      }
    },
    async ({ query, userId, categories, classification, limit = 20 }) => {
      try {
        // Remove surrounding quotes if present
        const cleanQuery = query.replace(/^["']|["']$/g, '').trim();
        
        // Detect "my {category}" pattern and auto-categorize if not already specified
        const myPattern = /\bmy\s+(\w+)/gi;
        const matches = cleanQuery.match(myPattern);
        
        if (matches && (!categories || categories.length === 0)) {
          // Extract potential category from "my X" pattern
          const potentialCategory = matches[0].replace(/\bmy\s+/i, '').toLowerCase();
          
          // Check if it matches any available categories
          if (availableCategories.includes(potentialCategory)) {
            categories = [potentialCategory];
          }
        }

        const { data: results, error } = await supabase.rpc('search_personal_data', {
          p_user_id: userId || null,
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

        const resultText = results.map((item) => {
          const contentPreview = typeof item.content === 'object' 
            ? JSON.stringify(item.content, null, 2).substring(0, 200) 
            : String(item.content).substring(0, 200);
          
          return `${item.title}
   Record ID: ${item.id}
   Category: ${item.category || 'Uncategorized'}
   Classification: ${item.classification}
   Tags: ${item.tags?.join(', ') || 'None'}
   Content: ${contentPreview}${contentPreview.length >= 200 ? '...' : ''}
   Updated: ${new Date(item.updated_at).toLocaleDateString()}`;
        }).join('\n\n');

        return {
          content: [{
            type: "text",
            text: `Found ${results.length} items matching "${query}":\n\n${resultText}`
          }]
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
  const getCategorySchema = () => {
    if (availableCategories.length > 0) {
      return z.enum(availableCategories).describe(
        `Select a category to filter by. Available categories: ${availableCategories.join(', ')}`
      );
    } else {
      return z.string().describe("Category to filter by (categories are loaded dynamically from database)");
    }
  };
  
  server.registerTool(
    "extract-personal-data",
    {
      title: "Extract Personal Data by Category",
      description: "Extract groups of similar entries by category from a specific user profile or all profiles. TRIGGER: Use this tool when users ask for 'my {category}' (e.g., 'my books', 'my contacts') to retrieve all items in that category. A single category is mandatory for broad collection retrieval. Tags are optional and used for further filtering within the category (e.g., ['family', 'work'] for contacts, ['sci-fi', 'fantasy'] for books). This complements the search tool for category-specific retrieval.",
      inputSchema: {
        category: getCategorySchema(),
        tags: z.array(z.string()).optional().describe("Optional: Multiple tags to filter entries within the category. Tags are used for further filtering (e.g., ['family', 'work'] for contacts, ['sci-fi', 'fantasy'] for books). Use singular forms for tags."),
        userId: z.string().optional().describe("Optional: Specify which user profile to extract from"),
        filters: z.record(z.any()).optional().describe("Optional: Additional filtering criteria"),
        limit: z.number().min(1).max(100).default(50).describe("Maximum number of records"),
        offset: z.number().min(0).default(0).describe("Pagination offset")
      }
    },
    async ({ category, tags, userId, filters, limit = 50, offset = 0 }) => {
      try {
        // Refresh categories before processing
        const latestCategories = await fetchAvailableCategories();
        if (latestCategories.length > 0) {
          availableCategories = latestCategories;
        }
        
        // Validate category against latest list
        if (availableCategories.length > 0 && !availableCategories.includes(category)) {
          return {
            content: [{
              type: "text",
              text: `Invalid category "${category}". Available categories: ${availableCategories.join(', ')}`
            }],
            isError: true
          };
        }
        const { data: results, error } = await supabase.rpc('extract_personal_data', {
          p_category: category,
          p_tags: (tags && tags.length > 0) ? tags : null,
          p_user_id: userId || null,
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
          const filterInfo = tags && tags.length > 0 
            ? ` in category: ${category} with tags: ${tags.join(', ')}`
            : ` in category: ${category}`;
          return {
            content: [{
              type: "text",
              text: `No personal data found${filterInfo}`
            }]
          };
        }

        const resultText = results.map((item) => {
          const contentPreview = typeof item.content === 'object' 
            ? JSON.stringify(item.content, null, 2).substring(0, 200) 
            : String(item.content).substring(0, 200);
          
          return `${item.title}
   Record ID: ${item.id}
   Category: ${item.category || 'Uncategorized'}
   Classification: ${item.classification}
   Tags: ${item.tags?.join(', ') || 'None'}
   Content: ${contentPreview}${contentPreview.length >= 200 ? '...' : ''}
   Updated: ${new Date(item.updated_at).toLocaleDateString()}`;
        }).join('\n\n');

        return {
          content: [{
            type: "text",
            text: `Found ${results.length} items with tags [${tags?.join(', ') || 'none'}]:\n\n${resultText}`
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
        userId: z.string().optional().describe("Optional: User identifier. If not provided, creates record without user association."),
        category: z.enum(['contacts', 'basic_information', 'books', 'favorite_authors', 'interests', 'digital_products']).describe("Category of personal data to store"),
        title: z.string().describe("Record title").describe("Title that describes the record being produced"),
        content: z.record(z.any()).describe("Record content").describe("The content of the record being produced"),
        tags: z.array(z.string()).optional().describe("Tags for categorization (use singular forms: 'family', 'work', 'personal', etc.)"),
        classification: z.enum(['personal', 'sensitive', 'confidential']).default('personal').describe("Data classification level")
      }
    },
    async ({ userId, category, title, content, tags, classification = 'personal' }) => {
      try {
        const { data: result, error } = await supabase.rpc('create_personal_data', {
          p_user_id: userId || null,
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
        const { data: result, error } = await supabase.rpc('update_personal_data', {
          p_record_id: recordId,
          p_updates: updates,
          p_conversation_context: conversationContext || null
        });

        if (error) {
          return {
            content: [{
              type: "text",
              text: `Database error: ${error.message}`
            }]
          };
        }

        if (!result) {
          return {
            content: [{
              type: "text",
              text: `Record not found or no changes made: ${recordId}`
            }],
            isError: true
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

        const deletedCount = result || 0;
        const requestedCount = recordIds.length;
        const deleteType = hardDelete ? 'permanently deleted' : 'soft deleted';
        
        if (deletedCount === 0) {
          return {
            content: [{
              type: "text",
              text: `No records were ${deleteType}. Records may not exist or were already deleted.`
            }],
            isError: true
          };
        }
        
        if (deletedCount < requestedCount) {
          return {
            content: [{
              type: "text",
              text: `Partially successful: ${deleteType} ${deletedCount} of ${requestedCount} requested record(s). Some records may not exist or were already deleted.`
            }]
          };
        }

        return {
          content: [{
            type: "text",
            text: `Successfully ${deleteType} ${deletedCount} personal data record(s)`
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

async function main() {
  // Initialize database connection
  await initializeDatabase();

  // Create MCP server
  const server = createMcpServer();

  // Create stdio transport
  const transport = new StdioServerTransport();

  // Connect server to transport
  await server.connect(transport);

  // MCP Personal Data Server is now running on stdio
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  process.exit(0);
});

main().catch((error) => {
  process.exit(1);
});