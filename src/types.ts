// TypeScript interfaces for DataDam MCP Server

export interface PersonalDataRecord {
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

export interface Category {
  category_name: string;
  display_name: string;
  description: string;
  item_count: number;
  trigger_words: string[];
  query_hint: string;
  example_queries: string[];
  last_modified: string;
}
