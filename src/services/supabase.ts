// Supabase client and database operations

import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Category } from "../types.js";

export let supabase: SupabaseClient;
export let availableCategories: string[] = [];

export async function fetchAvailableCategories(): Promise<string[]> {
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

export async function initializeDatabase(): Promise<void> {
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
