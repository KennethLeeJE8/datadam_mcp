// Zod schemas for all MCP tools

import { z } from "zod";
import { availableCategories } from "../services/supabase.js";

// Helper function to ensure only active categories are accepted
export const getCategorySchema = () =>
  z
    .string()
    .min(1, "Category must not be empty")
    .superRefine((value, ctx) => {
      const activeCategories = availableCategories;

      if (!activeCategories || activeCategories.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "No active categories available. Refresh categories before using this tool.",
        });
        return;
      }

      if (!activeCategories.includes(value)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Invalid category "${value}". Active categories: ${activeCategories.join(
            ", "
          )}`,
        });
      }
    })
    .describe("Active category. Must match one of the categories currently enabled in Supabase.");

// Search Personal Data Input Schema
export const SearchInputSchema = {
  query: z.string().describe("Specific search term, name, or datapoint to find. Must be concrete reference. Examples: 'John email', 'passport', 'TypeScript', 'Matt Ridley', 'Boston address'"),
  categories: z
    .array(getCategorySchema())
    .optional()
    .describe(
      "Optional: Narrow search to specific active categories. Examples: ['contacts'], ['books', 'documents']. Leave empty to search all."
    ),
  tags: z.array(z.string()).optional().describe("Optional: Filter by tags. Use singular form. Examples: ['family'], ['work', 'urgent']"),
  classification: z.enum(['public', 'personal', 'sensitive', 'confidential']).optional().describe("Optional: Filter by data sensitivity level"),
  limit: z.number().min(1).max(100).default(20).describe("Max results. Default: 20, Max: 100"),
  offset: z.number().min(0).default(0).describe("Pagination offset"),
  userId: z.string().optional().describe("Optional: User UUID."),
  response_format: z.enum(['json', 'markdown']).default('markdown').describe("Response format: 'markdown' (human-readable, default) or 'json' (machine-readable)")
};

// Extract Personal Data Input Schema
export const ExtractInputSchema = {
  category: getCategorySchema(),
  tags: z.array(z.string()).optional().describe("Optional: Filter within category by tags. Singular forms only. Examples: ['family'], ['work'], ['sci-fi']"),
  limit: z.number().min(1).max(100).default(50).describe("Results per page. Default: 50, Max: 100"),
  offset: z.number().min(0).default(0).describe("Pagination offset"),
  userId: z.string().optional().describe("Optional: User UUID."),
  filters: z.record(z.any()).optional().describe("Optional: Additional field-level filters"),
  response_format: z.enum(['json', 'markdown']).default('markdown').describe("Response format: 'markdown' (human-readable, default) or 'json' (machine-readable)")
};

// Create Personal Data Input Schema
export const CreateInputSchema = {
  category: getCategorySchema(),
  title: z.string().describe("Descriptive title. Examples: 'John Smith - Work Contact', 'Favorite Author - Matt Ridley', 'Current Location', 'Learning Docker'"),
  content: z.record(z.any()).describe("Structured attributes/characteristics as JSON key-value pairs tied to the title. Keep concise - attributes only, NOT explanations or long lists. Examples: {email: 'x@y.com', phone: '555-1234'}, {author: 'Matt Ridley', genre: 'Science'}, {location: 'Boston, MA', state: 'Massachusetts'}"),
  tags: z.array(z.string()).optional().describe("Optional tags. Singular forms: 'family', 'work', 'favorite', 'urgent', 'learning' (NOT plural)"),
  classification: z.enum(['personal', 'sensitive', 'confidential']).default('personal').describe("Sensitivity level. Default: 'personal'. Use 'sensitive' for private info, 'confidential' for highly sensitive"),
  userId: z.string().optional().describe("Optional: User UUID."),
  response_format: z.enum(['json', 'markdown']).default('markdown').describe("Response format: 'markdown' (human-readable, default) or 'json' (machine-readable)")
};

// Update Personal Data Input Schema
export const UpdateInputSchema = {
  recordId: z.string().describe("UUID of record to update. Obtain from datadam_search_personal_data or datadam_extract_personal_data first. Never show to user."),
  updates: z.record(z.any()).describe("Fields to update. Only include changed fields. Examples: {content: {email: 'new@email.com'}}, {tags: ['family', 'urgent']}"),
  conversationContext: z.string().optional().describe("Optional: Conversation context for extracting updates"),
  response_format: z.enum(['json', 'markdown']).default('markdown').describe("Response format: 'markdown' (human-readable, default) or 'json' (machine-readable)")
};

// Delete Personal Data Input Schema
export const DeleteInputSchema = {
  recordIds: z.array(z.string()).min(1).describe("Array of record UUIDs to delete. Obtain from search/extract first. Examples: ['uuid1'], ['uuid1', 'uuid2']. Never show to user."),
  hardDelete: z.boolean().default(false).describe("Permanent deletion flag. Default: false (soft delete, recoverable). Set true ONLY for GDPR compliance. WARNING: Cannot be undone."),
  response_format: z.enum(['json', 'markdown']).default('markdown').describe("Response format: 'markdown' (human-readable, default) or 'json' (machine-readable)")
};

// ChatGPT Search Input Schema
export const ChatGptSearchInputSchema = {
  query: z.string().describe("Search query to match against titles, tags, and categories")
};

// ChatGPT Fetch Input Schema
export const ChatGptFetchInputSchema = {
  id: z.string().describe("Document ID (UUID) to retrieve. Obtained from search results.")
};
