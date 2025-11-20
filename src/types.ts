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

export interface Memory {
  id: string;
  user_id?: string;
  memory_text: string;
  embedding?: number[];
  metadata: Record<string, any>;
  hash?: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

export interface MemorySearchResult extends Memory {
  similarity: number;
}

export interface MemoryHistory {
  id: string;
  memory_id: string;
  previous_value?: string;
  new_value?: string;
  action: 'ADD' | 'UPDATE' | 'DELETE';
  metadata: Record<string, any>;
  created_at: string;
  updated_at?: string;
  is_deleted: number;
}
