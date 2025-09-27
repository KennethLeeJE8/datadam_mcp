-- Migration: Add category registry system for dynamic data discovery
-- This enables the MCP server to track which data categories are populated
-- and provide contextual hints to AI agents about when to query the database.

-- Create category registry table
CREATE TABLE IF NOT EXISTS category_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_name TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT FALSE,
  item_count INTEGER DEFAULT 0,
  first_activation TIMESTAMPTZ,
  last_modified TIMESTAMPTZ DEFAULT NOW(),
  
  -- Trigger words for AI agents to know when to query this category
  trigger_words TEXT[] DEFAULT '{}',
  
  -- Contextual hints about when to query this category
  query_hint TEXT,
  
  -- Example queries for this category
  example_queries TEXT[] DEFAULT '{}',
  
  -- Minimum items required to activate category (usually 1)
  min_items_for_activation INTEGER DEFAULT 1,
  
  -- JSON field for additional metadata
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_category_registry_active ON category_registry(is_active);
CREATE INDEX IF NOT EXISTS idx_category_registry_name ON category_registry(category_name);
CREATE INDEX IF NOT EXISTS idx_category_registry_modified ON category_registry(last_modified);
CREATE INDEX IF NOT EXISTS idx_category_registry_trigger_words ON category_registry USING GIN(trigger_words);

-- Add category column to personal_data table
ALTER TABLE personal_data 
ADD COLUMN IF NOT EXISTS category TEXT 
REFERENCES category_registry(category_name);

-- Create index for the new category column
CREATE INDEX IF NOT EXISTS idx_personal_data_category ON personal_data(category);

-- Create trigger function for automatic category activation/deactivation
CREATE OR REPLACE FUNCTION update_category_counts() 
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Update count and potentially activate category
    UPDATE category_registry 
    SET 
      item_count = item_count + 1,
      is_active = CASE 
        WHEN item_count + 1 >= min_items_for_activation THEN true 
        ELSE is_active 
      END,
      first_activation = CASE 
        WHEN is_active = false AND item_count + 1 >= min_items_for_activation 
        THEN NOW() 
        ELSE first_activation 
      END,
      last_modified = NOW()
    WHERE category_name = NEW.category;
    
    RETURN NEW;
    
  ELSIF TG_OP = 'DELETE' THEN
    -- Update count and potentially deactivate category
    UPDATE category_registry 
    SET 
      item_count = GREATEST(0, item_count - 1),
      is_active = CASE 
        WHEN item_count - 1 < min_items_for_activation THEN false 
        ELSE is_active 
      END,
      last_modified = NOW()
    WHERE category_name = OLD.category;
    
    RETURN OLD;
    
  ELSIF TG_OP = 'UPDATE' THEN
    -- Handle category changes
    IF OLD.category IS DISTINCT FROM NEW.category THEN
      -- Decrease count for old category
      IF OLD.category IS NOT NULL THEN
        UPDATE category_registry 
        SET 
          item_count = GREATEST(0, item_count - 1),
          is_active = CASE 
            WHEN item_count - 1 < min_items_for_activation THEN false 
            ELSE is_active 
          END,
          last_modified = NOW()
        WHERE category_name = OLD.category;
      END IF;
      
      -- Increase count for new category
      IF NEW.category IS NOT NULL THEN
        UPDATE category_registry 
        SET 
          item_count = item_count + 1,
          is_active = CASE 
            WHEN item_count + 1 >= min_items_for_activation THEN true 
            ELSE is_active 
          END,
          first_activation = CASE 
            WHEN is_active = false AND item_count + 1 >= min_items_for_activation 
            THEN NOW() 
            ELSE first_activation 
          END,
          last_modified = NOW()
        WHERE category_name = NEW.category;
      END IF;
    END IF;
    
    RETURN NEW;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic category management
DROP TRIGGER IF EXISTS personal_data_category_update ON personal_data;
CREATE TRIGGER personal_data_category_update
  AFTER INSERT OR UPDATE OR DELETE ON personal_data
  FOR EACH ROW
  EXECUTE FUNCTION update_category_counts();

-- Insert predefined categories with trigger words and contextual hints
INSERT INTO category_registry (
  category_name, 
  display_name, 
  description, 
  trigger_words, 
  query_hint,
  example_queries
) VALUES 
  (
    'basic_information',
    'Basic Information',
    'Personal details like name, email, phone, address',
    ARRAY['personal info', 'contact details', 'basic info', 'profile', 'name', 'email', 'phone', 'address'],
    'Query when user asks about their personal details, contact information, or profile data',
    ARRAY['What''s my email address?', 'Show my contact information', 'What personal details do I have stored?']
  ),
  (
    'books',
    'Books & Reading',
    'Book collection, reading list, favorite books, book reviews',
    ARRAY['books', 'reading', 'favorite books', 'books I''ve read', 'book collection', 'library', 'reading list', 'literature', 'novels', 'authors'],
    'Query when user mentions books, reading preferences, asks for book recommendations, or discusses literary interests',
    ARRAY['What books have I read?', 'Show my favorite books', 'What''s in my reading list?', 'Books by my favorite authors']
  ),
  (
    'favorite_authors',
    'Favorite Authors',
    'Authors you follow, enjoy, and want to track',
    ARRAY['authors', 'writers', 'favorite authors', 'authors I like', 'novelists', 'poets', 'literary authors'],
    'Query when user asks about authors they like, discusses writing styles, or wants author recommendations',
    ARRAY['Who are my favorite authors?', 'Show me authors I follow', 'What authors do I enjoy reading?']
  ),
  (
    'interests',
    'Interests & Hobbies',
    'Personal interests, hobbies, activities you enjoy',
    ARRAY['interests', 'hobbies', 'likes', 'preferences', 'activities', 'favorite things', 'what I enjoy', 'passions'],
    'Query when discussing personal preferences, hobby recommendations, or planning activities',
    ARRAY['What are my interests?', 'Show my hobbies', 'What do I like to do?', 'What are my preferences?']
  ),
  (
    'digital_products',
    'Digital Products & Tools',
    'Software, apps, services, and digital tools you use',
    ARRAY['software', 'apps', 'tools', 'services', 'applications', 'programs', 'digital tools', 'subscriptions', 'platforms'],
    'Query when discussing technology preferences, software recommendations, or digital tool usage',
    ARRAY['What software do I use?', 'Show my digital tools', 'What apps do I have?', 'My technology stack']
  ),
  (
    'contacts',
    'Contacts & Relationships',
    'Friends, family, colleagues, and professional contacts',
    ARRAY['contacts', 'friends', 'family', 'colleagues', 'people', 'relationships', 'connections', 'network'],
    'Query when user needs contact information, asks about relationships, or discusses people in their network',
    ARRAY['Show my contacts', 'Who do I know?', 'Find contact information', 'My professional network']
  ),
  (
    'documents',
    'Documents & Files',
    'Important documents, files, and written materials',
    ARRAY['documents', 'files', 'papers', 'records', 'notes', 'written materials', 'important docs'],
    'Query when user asks about stored documents, file organization, or specific written materials',
    ARRAY['What documents do I have?', 'Show my important files', 'Find my notes', 'My stored records']
  ),
  (
    'preferences',
    'Preferences & Settings',
    'User preferences, settings, and configuration choices',
    ARRAY['preferences', 'settings', 'configuration', 'options', 'choices', 'customization'],
    'Query when discussing user preferences, configuration options, or personalization settings',
    ARRAY['What are my preferences?', 'Show my settings', 'How is this configured?', 'My customization choices']
  )
ON CONFLICT (category_name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  trigger_words = EXCLUDED.trigger_words,
  query_hint = EXCLUDED.query_hint,
  example_queries = EXCLUDED.example_queries,
  last_modified = NOW();

-- Create function to get active categories with their metadata
CREATE OR REPLACE FUNCTION get_active_categories()
RETURNS TABLE (
  category_name TEXT,
  display_name TEXT,
  description TEXT,
  item_count INTEGER,
  trigger_words TEXT[],
  query_hint TEXT,
  example_queries TEXT[],
  last_modified TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cr.category_name,
    cr.display_name,
    cr.description,
    cr.item_count,
    cr.trigger_words,
    cr.query_hint,
    cr.example_queries,
    cr.last_modified
  FROM category_registry cr
  WHERE cr.is_active = true
  ORDER BY cr.item_count DESC, cr.display_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to get category statistics
CREATE OR REPLACE FUNCTION get_category_stats()
RETURNS TABLE (
  total_categories INTEGER,
  active_categories INTEGER,
  total_items INTEGER,
  categories_json JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::INTEGER as total_categories,
    COUNT(*) FILTER (WHERE is_active = true)::INTEGER as active_categories,
    COALESCE(SUM(item_count), 0)::INTEGER as total_items,
    jsonb_agg(
      jsonb_build_object(
        'name', category_name,
        'display_name', display_name,
        'is_active', is_active,
        'item_count', item_count,
        'trigger_words', trigger_words,
        'query_hint', query_hint
      ) ORDER BY is_active DESC, item_count DESC
    ) as categories_json
  FROM category_registry;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update existing personal_data records to have categories based on data_type
UPDATE personal_data 
SET category = CASE 
  WHEN data_type = 'contact' THEN 'contacts'
  WHEN data_type = 'document' THEN 'documents'  
  WHEN data_type = 'preference' THEN 'preferences'
  WHEN data_type = 'custom' THEN 'basic_information'
  ELSE 'basic_information'
END
WHERE category IS NULL;

-- Manual sync of category counts for existing data
WITH category_counts AS (
  SELECT 
    category,
    COUNT(*) as actual_count
  FROM personal_data
  WHERE deleted_at IS NULL AND category IS NOT NULL
  GROUP BY category
)
UPDATE category_registry cr
SET 
  item_count = cc.actual_count,
  is_active = (cc.actual_count >= cr.min_items_for_activation),
  first_activation = CASE 
    WHEN cc.actual_count >= cr.min_items_for_activation AND cr.first_activation IS NULL
    THEN NOW()
    ELSE cr.first_activation
  END,
  last_modified = NOW()
FROM category_counts cc
WHERE cr.category_name = cc.category;

-- Grant permissions for service role
GRANT SELECT, INSERT, UPDATE ON category_registry TO service_role;
GRANT EXECUTE ON FUNCTION get_active_categories() TO service_role;
GRANT EXECUTE ON FUNCTION get_category_stats() TO service_role;

-- Grant read access to authenticated users
GRANT SELECT ON category_registry TO authenticated;
GRANT EXECUTE ON FUNCTION get_active_categories() TO authenticated;
GRANT EXECUTE ON FUNCTION get_category_stats() TO authenticated;