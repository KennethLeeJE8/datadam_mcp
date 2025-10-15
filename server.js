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
    name: "datadam",
    version: "1.0.0",
    description: "Personal knowledge database that automatically retrieves stored personal context when needed for personalized responses. Captures and stores personal information when user shares details. Triggers on: 'my [anything]', personal questions, preference queries, or when personal context would improve responses."
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
      title: "Search Personal Data by Keyword",
      description: `Search for SPECIFIC datapoints, names, or details across all personal data using keyword matching. Use when looking for a specific person, thing, or piece of information (e.g., "find John's email", "my passport number", "Docker info"). Returns ranked results with context snippets.

WHEN TO USE:
- Searching for specific person: "find John", "who is Sarah"
- Looking for specific datapoint: "my passport number", "email address", "phone number"
- Specific details mentioned: proper nouns, concrete terms
- Cross-category keyword search needed

WHEN NOT TO USE:
- Browsing entire category → use extract-personal-data instead
- "All my [category]" or "list my [category]" → use extract-personal-data instead
- No specific search term, just browsing tags → use extract-personal-data instead

TRIGGER KEYWORDS: "find [specific]", "search [name]", "what's [detail]", "who is", "lookup", "get [specific info]", "tell me about [specific thing]"`,
      inputSchema: {
        query: z.string().describe("Specific search term, name, or datapoint to find. Must be concrete reference. Examples: 'John email', 'passport', 'TypeScript', 'Matt Ridley', 'Boston address'"),
        categories: z.array(z.string()).optional().describe("Optional: Narrow search to specific categories if known. Examples: ['contacts'], ['books', 'documents']. Leave empty to search all."),
        tags: z.array(z.string()).optional().describe("Optional: Filter by tags. Use singular form. Examples: ['family'], ['work', 'urgent']"),
        classification: z.enum(['public', 'personal', 'sensitive', 'confidential']).optional().describe("Optional: Filter by data sensitivity level"),
        limit: z.number().min(1).max(100).default(20).describe("Max results. Default: 20, Max: 100"),
        userId: z.string().optional().describe("Optional: User UUID.")
      }
    },
    async ({ query, categories, tags, classification, limit = 20, userId }) => {
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
          p_tags: (tags && tags.length > 0) ? tags : null,
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
        `Category to filter by. Available: ${availableCategories.join(', ')}`
      );
    } else {
      // Fallback to fixed set when database not loaded
      return z.enum([
        "contacts", "books", "favorite_authors", "interests",
        "basic_information", "digital_products", "documents", "preferences"
      ]).describe("Category to filter by");
    }
  };

  server.registerTool(
    "extract-personal-data",
    {
      title: "List Items by Category/Tags",
      description: `Retrieve items by CATEGORY or TAGS when browsing/listing without specific search terms. Use for "show me all my X" requests or tag-based filtering. Returns complete records.

WHEN TO USE:
- Listing entire category: "all my contacts", "my books"
- Browsing by tag: "family contacts", "work items"
- "Show me my [category]" requests
- Exploring what's in a category
- Tag-based filtering within category

WHEN NOT TO USE:
- Searching for specific person/thing → use search-personal-data
- Looking for specific datapoint by name → use search-personal-data
- Need keyword matching → use search-personal-data

TRIGGER KEYWORDS: "all my [category]", "my [category]", "list my", "show me my", "what [category] do I have", "[tag] [category]", "browse my"

ALLOWED CATEGORIES (fixed set): contacts, books, favorite_authors, interests, basic_information, digital_products, documents, preferences`,
      inputSchema: {
        category: getCategorySchema(),
        tags: z.array(z.string()).optional().describe("Optional: Filter within category by tags. Singular forms only. Examples: ['family'], ['work'], ['sci-fi']"),
        limit: z.number().min(1).max(100).default(50).describe("Results per page. Default: 50, Max: 100"),
        offset: z.number().min(0).default(0).describe("Pagination offset"),
        userId: z.string().optional().describe("Optional: User UUID."),
        filters: z.record(z.any()).optional().describe("Optional: Additional field-level filters")
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
      title: "Store New Personal Data",
      description: `Capture and store personal data when user shares information. AGGRESSIVE CAPTURE MODE: Trigger when user mentions personal details, even without explicit "save" command.

EXPLICIT TRIGGERS (100% confidence):
- "save this", "remember that", "store my", "add to my", "keep this", "note that", "record this"

IMPLICIT TRIGGERS (80%+ confidence - still capture):
- "my email is...", "I live in...", "I work at...", "my favorite [X] is...", "I like...", "I prefer..."
- "I'm learning...", "I use [tool]...", "[person] is my [relationship]", "I'm a [role]"

CONTEXTUAL TRIGGERS (60%+ confidence):
- User answers questions with personal details
- User introduces someone with contact info
- User mentions tools/technologies they use

CATEGORY SELECTION (must use one of the allowed categories):
- Email/phone/person → contacts
- Book/reading → books or favorite_authors
- Tool/tech/app → digital_products
- Hobby/interest/learning → interests
- Location/background → basic_information
- Preference/choice → preferences

ALLOWED CATEGORIES (fixed set): contacts, books, favorite_authors, interests, basic_information, digital_products, documents, preferences`,
      inputSchema: {
        category: getCategorySchema(),
        title: z.string().describe("Descriptive title. Examples: 'John Smith - Work Contact', 'Favorite Author - Matt Ridley', 'Current Location', 'Learning Docker'"),
        content: z.record(z.any()).describe("Structured attributes/characteristics as JSON key-value pairs tied to the title. Keep concise - attributes only, NOT explanations or long lists. Examples: {email: 'x@y.com', phone: '555-1234'}, {author: 'Matt Ridley', genre: 'Science'}, {location: 'Boston, MA', state: 'Massachusetts'}"),
        tags: z.array(z.string()).optional().describe("Optional tags. Singular forms: 'family', 'work', 'favorite', 'urgent', 'learning' (NOT plural)"),
        classification: z.enum(['personal', 'sensitive', 'confidential']).default('personal').describe("Sensitivity level. Default: 'personal'. Use 'sensitive' for private info, 'confidential' for highly sensitive"),
        userId: z.string().optional().describe("Optional: User UUID.")
      }
    },
    async ({ category, title, content, tags, classification = 'personal', userId }) => {
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
      title: "Update Existing Personal Data",
      description: `Modify existing personal data records. Requires record UUID from previous search/extract. Use when user wants to change or correct information.

TRIGGER KEYWORDS: "update [X]", "change [X]", "modify [X]", "edit [X]", "correct [X]", "fix [X]", "revise [X]", "[X] changed to [Y]", "new [X] is [Y]", "actually it's [X]"

WORKFLOW:
1. User requests update
2. If UUID unknown: search/extract to find record first
3. Apply updates to identified record
4. Confirm (don't show UUID to user)

EXAMPLES:
- "Update John's email to new@email.com" → search for John → update with UUID
- "Change my location to Boston" → extract basic_information → find location → update`,
      inputSchema: {
        recordId: z.string().describe("UUID of record to update. Obtain from search-personal-data or extract-personal-data first. Never show to user."),
        updates: z.record(z.any()).describe("Fields to update. Only include changed fields. Examples: {content: {email: 'new@email.com'}}, {tags: ['family', 'urgent']}"),
        conversationContext: z.string().optional().describe("Optional: Conversation context for extracting updates")
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
      title: "Delete Personal Data Records",
      description: `Remove personal data records. Requires record UUID(s) from previous search/extract. Use when user explicitly wants to delete information.

TRIGGER KEYWORDS: "delete [X]", "remove [X]", "erase [X]", "forget [X]", "get rid of [X]", "clear [X]", "I don't want [X] anymore"

DELETION TYPES:
- Soft Delete (default): Marks as deleted, recoverable. Use for most cases.
- Hard Delete: Permanent removal. Use ONLY for GDPR "right to be forgotten" requests.

WORKFLOW:
1. User requests deletion
2. If UUID unknown: search/extract to find record(s) first
3. Confirm if bulk or hard delete
4. Delete with appropriate type
5. Confirm (don't show UUIDs)

SAFETY: Always confirm before bulk deletes (3+ records) or hard deletes. Default to soft delete unless GDPR request.`,
      inputSchema: {
        recordIds: z.array(z.string()).min(1).describe("Array of record UUIDs to delete. Obtain from search/extract first. Examples: ['uuid1'], ['uuid1', 'uuid2']. Never show to user."),
        hardDelete: z.boolean().default(false).describe("Permanent deletion flag. Default: false (soft delete, recoverable). Set true ONLY for GDPR compliance. WARNING: Cannot be undone.")
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