// Create Personal Data tool

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatSuccessMessage, formatErrorMessage } from "../utils/formatting.js";
import { CreateInputSchema } from "../schemas/index.js";

export function registerCreateTool(
  server: McpServer,
  supabase: SupabaseClient,
  allCategories: string[]
): void {
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

CATEGORY SELECTION:
- Email/phone/person/relationship → contacts
- Book/reading/author → books or favorite_authors
- Tool/tech/app/software/platform → digital_products
- Hobby/interest/learning/skill/activity → interests
- Location/background/age/job/role/personal detail → basic_information
- Preference/choice/opinion/like/dislike → preferences
- File/document/paper → documents

AVAILABLE CATEGORIES (All from registry, including inactive): ${allCategories.length > 0 ? allCategories.join(', ') : 'Categories will be available once added to category_registry'}

Args:
  - category (string, required): Valid category name from category_registry table. Can use any category (active or inactive). Available: ${allCategories.length > 0 ? allCategories.join(', ') : 'none yet'}
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
      inputSchema: CreateInputSchema,
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
}
