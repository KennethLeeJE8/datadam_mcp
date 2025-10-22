import express from "express";
import cors from "cors";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { generateUsageGuideHtml } from "./usageGuide.js";
import { formatAsMarkdown, formatAsJSON, formatSuccessMessage, formatErrorMessage } from "./utils/formatting.js";

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
let availableCategories: string[] = [];

async function fetchAvailableCategories(): Promise<string[]> {
  try {
    const { data: categories, error } = await supabase.rpc('get_active_categories');
    if (error) {
      console.error("Error fetching categories:", error);
      return [];
    }
    return categories?.map((cat: Category) => cat.category_name) || [];
  } catch (error) {
    console.error("Failed to fetch categories:", error);
    return [];
  }
}

async function initializeDatabase(): Promise<void> {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration. Please check your .env file.");
    }

    supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Fetch initial categories
    availableCategories = await fetchAvailableCategories();
    console.log("Available categories:", availableCategories);
    
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
    "datadam_search_personal_data",
    {
      title: "Search Personal Data by Keyword",
      description: `Search for SPECIFIC datapoints, names, or details across all personal data using keyword matching. Use when looking for a specific person, thing, or piece of information (e.g., "find John's email", "my passport number", "Docker info"). Returns ranked results with context snippets.

WHEN TO USE:
- Searching for specific person: "find John", "who is Sarah"
- Looking for specific datapoint: "my passport number", "email address", "phone number"
- Specific details mentioned: proper nouns, concrete terms
- Cross-category keyword search needed

WHEN NOT TO USE:
- Browsing entire category → use datadam_extract_personal_data instead
- "All my [category]" or "list my [category]" → use datadam_extract_personal_data instead
- No specific search term, just browsing tags → use datadam_extract_personal_data instead

TRIGGER KEYWORDS: "find [specific]", "search [name]", "what's [detail]", "who is", "lookup", "get [specific info]", "tell me about [specific thing]"

Args:
  - query (string, required): Specific search term, name, or datapoint to find
  - categories (string[], optional): Narrow search to specific categories. Examples: ['contacts'], ['books', 'documents']
  - tags (string[], optional): Filter by tags. Use singular form. Examples: ['family'], ['work', 'urgent']
  - classification (enum, optional): Filter by sensitivity - 'public', 'personal', 'sensitive', or 'confidential'
  - limit (number, optional): Max results. Range: 1-100, Default: 20
  - userId (string, optional): User UUID for multi-user systems
  - response_format (string, optional): 'markdown' (default, human-readable) or 'json' (machine-readable)

Returns:
  - For JSON format: Structured data with schema: {total, count, results[], has_more, next_offset}
  - For Markdown format: Human-readable numbered list with categories, tags, content previews
  - Each result includes: id, title, category, tags, content, classification, created_at, updated_at

Examples:
  1. Find contact: { query: "John email", categories: ["contacts"], limit: 10 }
  2. Find book: { query: "Matt Ridley", categories: ["books", "favorite_authors"] }
  3. Cross-category: { query: "Docker", tags: ["learning"] }
  4. JSON output: { query: "address", response_format: "json" }

Error Handling:
  - No results: Returns "No results found matching '<query>'" with suggestions (try broader terms, check spelling, use datadam_extract_personal_data)
  - Database errors: Returns error message with connection troubleshooting guidance
  - Invalid category: Ignores invalid categories, searches remaining valid ones`,
      inputSchema: {
        query: z.string().describe("Specific search term, name, or datapoint to find. Must be concrete reference. Examples: 'John email', 'passport', 'TypeScript', 'Matt Ridley', 'Boston address'"),
        categories: z.array(z.string()).optional().describe("Optional: Narrow search to specific categories if known. Examples: ['contacts'], ['books', 'documents']. Leave empty to search all."),
        tags: z.array(z.string()).optional().describe("Optional: Filter by tags. Use singular form. Examples: ['family'], ['work', 'urgent']"),
        classification: z.enum(['public', 'personal', 'sensitive', 'confidential']).optional().describe("Optional: Filter by data sensitivity level"),
        limit: z.number().min(1).max(100).default(20).describe("Max results. Default: 20, Max: 100"),
        userId: z.string().optional().describe("Optional: User UUID."),
        response_format: z.enum(['json', 'markdown']).default('markdown').describe("Response format: 'markdown' (human-readable, default) or 'json' (machine-readable)")
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async ({ query, categories, tags, classification, limit = 20, userId, response_format = 'markdown' }) => {
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
            console.log(`Auto-detected category from "my ${potentialCategory}" pattern`);
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
              text: formatErrorMessage(
                `Database error: ${error.message}`,
                "Check your database connection and ensure Supabase is configured correctly",
                response_format
              )
            }],
            isError: true
          };
        }

        if (!results || results.length === 0) {
          const suggestion = "Try:\n- Using broader search terms\n- Checking spelling\n- Removing category filters\n- Using datadam_extract_personal_data to browse categories";
          return {
            content: [{
              type: "text",
              text: formatErrorMessage(
                `No results found matching query: "${query}"`,
                suggestion,
                response_format
              )
            }]
          };
        }

        // Format response based on response_format parameter
        if (response_format === 'json') {
          const responseText = formatAsJSON({
            results: results,
            total: results.length,
            count: results.length,
            hasMore: false,
            nextOffset: 0
          });

          return {
            content: [{
              type: "text",
              text: responseText
            }]
          };
        } else {
          // Markdown format
          const responseText = formatAsMarkdown(results, { showIds: true });

          return {
            content: [{
              type: "text",
              text: `Found ${results.length} items matching "${query}":\n\n${responseText}`
            }]
          };
        }
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: formatErrorMessage(
              `Error searching personal data: ${error instanceof Error ? error.message : 'Unknown error'}`,
              "Please try again or contact support if the issue persists",
              response_format
            )
          }],
          isError: true
        };
      }
    }
  );

  // Register the extract personal data tool
  // NOTE: Categories should be plural where grammatically appropriate (contacts, books, documents)
  // Tags should always use singular forms (family, work, sci-fi, personal)

  // Create category schema dynamically
  const getCategorySchema = () => {
    if (availableCategories.length > 0) {
      // Use enum when categories are available for better UI experience
      return z.enum(availableCategories as [string, ...string[]]).describe(
        `Category to filter by. Available: ${availableCategories.join(', ')}`
      );
    } else {
      // Fallback to fixed set when database not loaded
      return z.enum([
        "contacts", "books", "favorite_authors", "interests",
        "basic_information", "digital_products", "documents", "preferences"
      ] as [string, ...string[]]).describe("Category to filter by");
    }
  };

  server.registerTool(
    "datadam_extract_personal_data",
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
- Searching for specific person/thing → use datadam_search_personal_data
- Looking for specific datapoint by name → use datadam_search_personal_data
- Need keyword matching → use datadam_search_personal_data

TRIGGER KEYWORDS: "all my [category]", "my [category]", "list my", "show me my", "what [category] do I have", "[tag] [category]", "browse my"

ALLOWED CATEGORIES (fixed set): contacts, books, favorite_authors, interests, basic_information, digital_products, documents, preferences

Args:
  - category (string, required): Exact category name. Available: contacts, books, favorite_authors, interests, basic_information, digital_products, documents, preferences
  - tags (string[], optional): Filter within category by tags. Singular forms only. Examples: ['family'], ['work'], ['sci-fi']
  - limit (number, optional): Results per page. Range: 1-100, Default: 50
  - offset (number, optional): Pagination offset for browsing large result sets. Default: 0
  - userId (string, optional): User UUID for multi-user systems
  - filters (object, optional): Additional field-level filters
  - response_format (string, optional): 'markdown' (default, human-readable) or 'json' (machine-readable)

Returns:
  - For JSON format: Structured data with schema: {total, count, results[], has_more, next_offset}
  - For Markdown format: Human-readable numbered list with complete record details
  - Each result includes: id, title, category, tags, full content, classification, created_at, updated_at

Examples:
  1. List all contacts: { category: "contacts", limit: 20 }
  2. Family contacts only: { category: "contacts", tags: ["family"] }
  3. Browse books with pagination: { category: "books", limit: 10, offset: 10 }
  4. JSON output: { category: "interests", response_format: "json" }

Error Handling:
  - No records found: Returns "No personal data found in category: {category}" with optional tag info
  - Invalid category: Returns error with list of available categories
  - Database errors: Returns error message with troubleshooting guidance`,
      inputSchema: {
        category: getCategorySchema(),
        tags: z.array(z.string()).optional().describe("Optional: Filter within category by tags. Singular forms only. Examples: ['family'], ['work'], ['sci-fi']"),
        limit: z.number().min(1).max(100).default(50).describe("Results per page. Default: 50, Max: 100"),
        offset: z.number().min(0).default(0).describe("Pagination offset"),
        userId: z.string().optional().describe("Optional: User UUID."),
        filters: z.record(z.any()).optional().describe("Optional: Additional field-level filters"),
        response_format: z.enum(['json', 'markdown']).default('markdown').describe("Response format: 'markdown' (human-readable, default) or 'json' (machine-readable)")
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async ({ category, tags, userId, filters, limit = 50, offset = 0, response_format = 'markdown' }) => {
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
              text: formatErrorMessage(
                `Database error: ${error.message}`,
                "Check your database connection and ensure the category exists",
                response_format
              )
            }],
            isError: true
          };
        }

        if (!results || results.length === 0) {
          const filterInfo = tags && tags.length > 0
            ? ` in category: ${category} with tags: ${tags.join(', ')}`
            : ` in category: ${category}`;
          return {
            content: [{
              type: "text",
              text: formatErrorMessage(
                `No personal data found${filterInfo}`,
                "Try removing tag filters or using a different category",
                response_format
              )
            }]
          };
        }

        // Format response based on response_format parameter
        if (response_format === 'json') {
          const responseText = formatAsJSON({
            results: results,
            total: results.length,
            count: results.length,
            hasMore: results.length === limit,
            nextOffset: offset + results.length
          });

          return {
            content: [{
              type: "text",
              text: responseText
            }]
          };
        } else {
          // Markdown format
          const responseText = formatAsMarkdown(results, { showIds: true });

          return {
            content: [{
              type: "text",
              text: `Found ${results.length} items with tags [${tags?.join(', ') || 'none'}]:\n\n${responseText}`
            }]
          };
        }
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: formatErrorMessage(
              `Error extracting personal data: ${error instanceof Error ? error.message : 'Unknown error'}`,
              "Please try again or contact support if the issue persists",
              response_format
            )
          }],
          isError: true
        };
      }
    }
  );

  // Register the create personal data tool
  server.registerTool(
    "datadam_create_personal_data",
    {
      title: "Store New Personal Data",
      description: `Capture and store personal data when user shares information about themselves. The user's AI tool settings determine whether to store automatically or ask for consent first.

CORE PRINCIPLE: If the user mentions anything about themselves, their preferences, their life, their contacts, or their experiences - this tool should be used to store it.

TRIGGERS (indicating personal data is being shared):
- Explicit storage requests: "save this", "remember that", "store my", "add to my", "keep this", "note that", "record this"
- Personal statements: "my [anything] is...", "I live in/at...", "I work at/as...", "my favorite [X] is...", "I like...", "I prefer...", "I love..."
- Identity/role: "I'm learning...", "I use [tool]...", "I'm using...", "I'm a [role]", "I'm from..."
- Relationships/people: "[person] is my [relationship]", "I know [person]", "I met [person]"
- Experiences: "I went to...", "I tried...", "I've been to...", "I bought...", "I have...", "I read [book]", "I'm reading..."
- Current context: "I'm in [location]", "I'm working on X", "I know [skill]", "I subscribe to Y"
- Opinions/preferences: "I think...", "I believe...", "I feel..." (when about personal preferences)
- Activities: "I [verb] at [place]", "I [verb] with [person]", "I [verb] [activity]"

CATEGORY SELECTION (must use one of the allowed categories):
- Email/phone/person/relationship → contacts
- Book/reading/author → books or favorite_authors
- Tool/tech/app/software/platform → digital_products
- Hobby/interest/learning/skill/activity → interests
- Location/background/age/job/role/personal detail → basic_information
- Preference/choice/opinion/like/dislike → preferences
- File/document/paper → documents

ALLOWED CATEGORIES (fixed set): contacts, books, favorite_authors, interests, basic_information, digital_products, documents, preferences

Args:
  - category (string, required): One of the allowed categories above
  - title (string, required): Descriptive title for the record. Examples: 'John Smith - Work Contact', 'Current Location'
  - content (object, required): Structured attributes as JSON key-value pairs. Keep concise - attributes only, NOT explanations
  - tags (string[], optional): Tags in singular form. Examples: ['family'], ['work'], ['favorite']
  - classification (string, optional): Sensitivity level - 'personal' (default), 'sensitive', or 'confidential'
  - userId (string, optional): User UUID for multi-user systems
  - response_format (string, optional): 'markdown' (default, human-readable) or 'json' (machine-readable)

Returns:
  - Success message confirming record creation with title and category
  - For JSON format: {success: true, operation: "created", title, category, message}
  - For Markdown format: "✓ Successfully created record: **{title}** in category **{category}**"

Examples:
  1. Store contact: { category: "contacts", title: "John Smith - Work", content: { email: "john@work.com", phone: "555-1234" }, tags: ["work"] }
  2. Store book: { category: "books", title: "The Evolution of Everything", content: { author: "Matt Ridley", genre: "Science" }, tags: ["favorite"] }
  3. Store location: { category: "basic_information", title: "Current Location", content: { city: "Boston", state: "MA" } }
  4. Sensitive data: { category: "documents", title: "Passport", content: { number: "A123..." }, classification: "confidential" }

Error Handling:
  - Database errors: Returns error with connection troubleshooting guidance
  - Invalid category: Returns error with list of allowed categories
  - Missing required fields: Returns error indicating which fields are required (category, title, content)`,
      inputSchema: {
        category: getCategorySchema(),
        title: z.string().describe("Descriptive title. Examples: 'John Smith - Work Contact', 'Favorite Author - Matt Ridley', 'Current Location', 'Learning Docker'"),
        content: z.record(z.any()).describe("Structured attributes/characteristics as JSON key-value pairs tied to the title. Keep concise - attributes only, NOT explanations or long lists. Examples: {email: 'x@y.com', phone: '555-1234'}, {author: 'Matt Ridley', genre: 'Science'}, {location: 'Boston, MA', state: 'Massachusetts'}"),
        tags: z.array(z.string()).optional().describe("Optional tags. Singular forms: 'family', 'work', 'favorite', 'urgent', 'learning' (NOT plural)"),
        classification: z.enum(['personal', 'sensitive', 'confidential']).default('personal').describe("Sensitivity level. Default: 'personal'. Use 'sensitive' for private info, 'confidential' for highly sensitive"),
        userId: z.string().optional().describe("Optional: User UUID."),
        response_format: z.enum(['json', 'markdown']).default('markdown').describe("Response format: 'markdown' (human-readable, default) or 'json' (machine-readable)")
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async ({ category, title, content, tags, classification = 'personal', userId, response_format = 'markdown' }) => {
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
              text: formatErrorMessage(
                `Database error: ${error.message}`,
                "Check your database connection and ensure the Supabase credentials are correct.",
                response_format
              )
            }],
            isError: true
          };
        }

        return {
          content: [{
            type: "text",
            text: formatSuccessMessage('created', title, category, response_format)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: formatErrorMessage(
              `Error creating personal data: ${error instanceof Error ? error.message : 'Unknown error'}`,
              "Verify that all required fields are provided and properly formatted.",
              response_format
            )
          }],
          isError: true
        };
      }
    }
  );

  // Register the update personal data tool
  server.registerTool(
    "datadam_update_personal_data",
    {
      title: "Update Existing Personal Data",
      description: `Modify existing personal data records. Requires record UUID from previous search/extract. Use when user shares information that contradicts, corrects, or updates previously stored data.

TRIGGERS (indicating data should be updated):
- Explicit update requests: "update [X]", "change [X]", "modify [X]", "edit [X]", "correct [X]", "fix [X]", "revise [X]"
- Life changes: "I moved to [X]", "My new [X] is...", "I now [verb]...", "I switched to...", "I changed to..."
- Corrections: "actually...", "no, it's...", "I meant...", "correction:", "not [X], [Y]"
- Status changes: "I'm no longer...", "I quit...", "I started...", "I joined..."
- Conflicting information: User shares different information about same topic (e.g., mentions new email when old one exists)
- Self-corrections: "Actually I live in Boston now", "I got a new job at X"

WORKFLOW:
1. User shares update (explicit or implicit)
2. Search/extract to find existing record first
3. If found: apply updates to identified record
4. If not found: use datadam_create_personal_data instead
5. Confirm (don't show UUID to user)

EXAMPLES:
- "Update John's email to new@email.com" → search for John → update with UUID
- "I moved to Boston" → extract basic_information for location → update
- "My new phone is 555-1234" → search for phone in contacts → update
- "Actually I work at Google now" → search for job/company → update

Args:
  - recordId (string, required): UUID of record to update. Obtain from datadam_search_personal_data or datadam_extract_personal_data first
  - updates (object, required): Fields to update. Only include changed fields. Can include: title, content, tags, category, classification
  - conversationContext (string, optional): Conversation context for extracting updates
  - response_format (string, optional): 'markdown' (default, human-readable) or 'json' (machine-readable)

Returns:
  - Success message confirming record update
  - For JSON format: {success: true, operation: "updated", recordId, message}
  - For Markdown format: "✓ Successfully updated record: **{title}**"

Examples:
  1. Update email: { recordId: "<UUID>", updates: { content: { email: "new@email.com" } } }
  2. Update tags: { recordId: "<UUID>", updates: { tags: ["family", "urgent"] } }
  3. Update title: { recordId: "<UUID>", updates: { title: "Emergency Contact – Updated" } }
  4. Multiple fields: { recordId: "<UUID>", updates: { title: "John - CEO", content: { role: "CEO" } } }

Error Handling:
  - Record not found: Returns "Record not found or no changes made: {recordId}" with isError flag
  - Database errors: Returns error with troubleshooting guidance
  - Invalid recordId format: Returns error indicating UUID format required
  - No changes: Returns error if updates object is empty or no fields changed`,
      inputSchema: {
        recordId: z.string().describe("UUID of record to update. Obtain from datadam_search_personal_data or datadam_extract_personal_data first. Never show to user."),
        updates: z.record(z.any()).describe("Fields to update. Only include changed fields. Examples: {content: {email: 'new@email.com'}}, {tags: ['family', 'urgent']}"),
        conversationContext: z.string().optional().describe("Optional: Conversation context for extracting updates"),
        response_format: z.enum(['json', 'markdown']).default('markdown').describe("Response format: 'markdown' (human-readable, default) or 'json' (machine-readable)")
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async ({ recordId, updates, conversationContext, response_format = 'markdown' }) => {
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
              text: formatErrorMessage(
                `Database error: ${error.message}`,
                "Check your database connection and verify the record ID is correct.",
                response_format
              )
            }],
            isError: true
          };
        }

        if (!result) {
          return {
            content: [{
              type: "text",
              text: formatErrorMessage(
                `Record not found or no changes made: ${recordId}`,
                "Verify the record ID exists using datadam_search_personal_data or datadam_extract_personal_data.",
                response_format
              )
            }],
            isError: true
          };
        }

        return {
          content: [{
            type: "text",
            text: formatSuccessMessage('updated', result.title || recordId, result.category, response_format)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: formatErrorMessage(
              `Error updating personal data: ${error instanceof Error ? error.message : 'Unknown error'}`,
              "Please try again or contact support if the issue persists.",
              response_format
            )
          }],
          isError: true
        };
      }
    }
  );

  // Register the delete personal data tool
  server.registerTool(
    "datadam_delete_personal_data",
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

SAFETY: Always confirm before bulk deletes (3+ records) or hard deletes. Default to soft delete unless GDPR request.

Args:
  - recordIds (string[], required): Array of record UUIDs to delete. Obtain from search/extract first. Examples: ['uuid1'], ['uuid1', 'uuid2']
  - hardDelete (boolean, optional): Permanent deletion flag. Default: false (soft delete, recoverable). Set true ONLY for GDPR compliance
  - response_format (string, optional): 'markdown' (default, human-readable) or 'json' (machine-readable)

Returns:
  - Success message confirming deletion with count and type
  - For JSON format: {success: true, operation: "deleted" | "permanently deleted", count, requested_count, message}
  - For Markdown format: "✓ Successfully {soft/permanently} deleted {count} personal data record(s)"
  - Partial success: Indicates if some records couldn't be deleted

Examples:
  1. Soft delete one: { recordIds: ["uuid1"] }
  2. Soft delete multiple: { recordIds: ["uuid1", "uuid2", "uuid3"] }
  3. Hard delete (GDPR): { recordIds: ["uuid1"], hardDelete: true }
  4. JSON output: { recordIds: ["uuid1"], response_format: "json" }

Error Handling:
  - No records deleted: Returns "No records were {deleted/permanently deleted}. Records may not exist or were already deleted"
  - Partial deletion: Returns "Partially successful: {deleted} {count} of {requested} requested record(s)"
  - Database errors: Returns error with troubleshooting guidance
  - Invalid UUIDs: Returns error indicating UUID format required`,
      inputSchema: {
        recordIds: z.array(z.string()).min(1).describe("Array of record UUIDs to delete. Obtain from search/extract first. Examples: ['uuid1'], ['uuid1', 'uuid2']. Never show to user."),
        hardDelete: z.boolean().default(false).describe("Permanent deletion flag. Default: false (soft delete, recoverable). Set true ONLY for GDPR compliance. WARNING: Cannot be undone."),
        response_format: z.enum(['json', 'markdown']).default('markdown').describe("Response format: 'markdown' (human-readable, default) or 'json' (machine-readable)")
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async ({ recordIds, hardDelete = false, response_format = 'markdown' }) => {
      try {
        const { data: result, error } = await supabase.rpc('delete_personal_data', {
          p_record_ids: recordIds,
          p_hard_delete: hardDelete
        });

        if (error) {
          return {
            content: [{
              type: "text",
              text: formatErrorMessage(
                `Database error: ${error.message}`,
                "Check your database connection and verify the record IDs are correct.",
                response_format
              )
            }],
            isError: true
          };
        }

        const deletedCount = result || 0;
        const requestedCount = recordIds.length;
        const deleteType = hardDelete ? 'permanently deleted' : 'soft deleted';
        const operation = hardDelete ? 'deleted' : 'deleted';

        if (deletedCount === 0) {
          return {
            content: [{
              type: "text",
              text: formatErrorMessage(
                `No records were ${deleteType}. Records may not exist or were already deleted.`,
                "Verify the record IDs using datadam_search_personal_data or datadam_extract_personal_data.",
                response_format
              )
            }],
            isError: true
          };
        }

        if (deletedCount < requestedCount) {
          const message = `Partially successful: ${deleteType} ${deletedCount} of ${requestedCount} requested record(s). Some records may not exist or were already deleted.`;
          if (response_format === 'json') {
            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  success: true,
                  operation: deleteType,
                  count: deletedCount,
                  requested_count: requestedCount,
                  message: message
                }, null, 2)
              }]
            };
          }
          return {
            content: [{
              type: "text",
              text: `⚠️ ${message}`
            }]
          };
        }

        const message = `Successfully ${deleteType} ${deletedCount} personal data record(s)`;
        if (response_format === 'json') {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                success: true,
                operation: deleteType,
                count: deletedCount,
                message: message
              }, null, 2)
            }]
          };
        }
        return {
          content: [{
            type: "text",
            text: `✓ ${message}`
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: formatErrorMessage(
              `Error deleting personal data: ${error instanceof Error ? error.message : 'Unknown error'}`,
              "Please try again or contact support if the issue persists.",
              response_format
            )
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
      title: "Search Personal Data",
      description: `Search through personal data by matching against title, tags, and categories only (not content). Returns citation-friendly results.

ALLOWED CATEGORY FILTERS (fixed set):
- books: Reading, literature, novels, fiction, non-fiction, textbooks, book reviews
- contacts: People, friends, family, colleagues, relationships, networking, contact info
- documents: Files, papers, records, notes, reports, written materials
- basic_information: Personal details, profile info, contact details, general personal data
- digital_products: Software, apps, tools, services, platforms, subscriptions, technology
- preferences: Settings, choices, options, configurations, user preferences
- interests: Hobbies, activities, likes, passions, personal interests
- favorite_authors: Writers, novelists, poets, literary authors

SEARCH STRATEGY: If specific items return no results, try broader category terms. Consider which category would contain the requested information type.`,
      inputSchema: {
        query: z.string().describe("Search query to match against titles, tags, and categories")
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
      title: "Fetch Document by ID",
      description: "Retrieve complete document content by ID including full text, metadata, and all associated information.",
      inputSchema: {
        id: z.string().describe("Document ID (UUID) to retrieve. Obtained from search results.")
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

  // Root endpoint - Usage Guide HTML
  app.get('/', async (req: express.Request, res: express.Response) => {
    try {
      const html = await generateUsageGuideHtml(supabase);
      res.setHeader('Content-Type', 'text/html');
      res.send(html);
    } catch (error) {
      res.status(500).send('Error loading usage guide');
    }
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
      console.log(`- datadam_search_personal_data - Search through personal data by title and content`);
      console.log(`- datadam_extract_personal_data - Extract data by category with optional tag filtering`);
      console.log(`- datadam_create_personal_data - Create new personal data records`);
      console.log(`- datadam_update_personal_data - Update existing records`);
      console.log(`- datadam_delete_personal_data - Delete records`);
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