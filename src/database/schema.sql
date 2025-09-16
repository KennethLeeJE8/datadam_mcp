-- SUPABASE SETUP INSTRUCTIONS:
-- 
-- STEP 1: Create Test User in Supabase Dashboard
--   1. Go to Authentication > Users in your Supabase dashboard
--   2. Click "Add User"
--   3. Create user: sample@example.com / TestPassword123!
--   4. Copy the generated UUID (looks like: a1b2c3d4-e5f6-7890-abcd-ef1234567890)
--
-- STEP 2: Update Sample Data UUIDs
--   1. Search for 'YOUR_TEST_USER_UUID_HERE' in this file (lines ~452, 467)
--   2. Replace both instances with the UUID from Step 1
--
-- STEP 3: Run this SQL script in your Supabase SQL Editor
--   The following are handled automatically by this script:
--   ✅ Tables creation with constraints and indexes
--   ✅ Row Level Security (RLS) policies
--   ✅ RPC functions for MCP operations
--   ✅ Triggers and helper functions
--   ✅ Sample data insertion (after UUID replacement)
--
-- STEP 4: Optional Dashboard Configuration
--   - Authentication providers (if using OAuth)
--   - Email templates (if using email auth)
--   - Webhook URLs (if using webhooks)
--   - Storage buckets (if storing files)
--
-- STEP 5: Service Role Key
--   Make sure your SUPABASE_SERVICE_ROLE_KEY environment variable
--   is set correctly for admin operations

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Core user profiles with metadata support
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE,
  full_name TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Flexible personal data storage with dynamic fields
CREATE TABLE IF NOT EXISTS personal_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  content JSONB NOT NULL,
  tags TEXT[],
  classification TEXT DEFAULT 'personal' CHECK (classification IN ('public', 'personal', 'sensitive', 'confidential')),
  is_encrypted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_accessed TIMESTAMPTZ DEFAULT NOW()
);

-- Audit trail for compliance and security
CREATE TABLE IF NOT EXISTS data_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('CREATE', 'READ', 'UPDATE', 'DELETE')),
  table_name TEXT NOT NULL,
  record_id UUID,
  changes JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);
CREATE INDEX IF NOT EXISTS idx_personal_data_user_id ON personal_data(user_id);
CREATE INDEX IF NOT EXISTS idx_personal_data_tags ON personal_data USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_personal_data_content ON personal_data USING GIN(content);
CREATE INDEX IF NOT EXISTS idx_personal_data_classification ON personal_data(classification);
CREATE INDEX IF NOT EXISTS idx_personal_data_deleted_at ON personal_data(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_access_log_user_operation ON data_access_log(user_id, operation);
CREATE INDEX IF NOT EXISTS idx_access_log_timestamp ON data_access_log(created_at);
CREATE INDEX IF NOT EXISTS idx_access_log_table_name ON data_access_log(table_name);

-- Row Level Security Policies
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_access_log ENABLE ROW LEVEL SECURITY;

-- Allow service role to bypass RLS for admin operations
CREATE POLICY "service_role_full_access_profiles" ON profiles
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_role_full_access_personal_data" ON personal_data
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_role_full_access_audit_log" ON data_access_log
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Profiles policies
-- Note: These policies assume auth.uid() matches user_id

CREATE POLICY "users_can_view_own_profile" ON profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "users_can_update_own_profile" ON profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "users_can_insert_own_profile" ON profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Personal data policies
CREATE POLICY "users_can_crud_own_data" ON personal_data
  FOR ALL TO authenticated
  USING (user_id = auth.uid());

-- Audit log policies
CREATE POLICY "users_can_view_own_logs" ON data_access_log
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "users_can_insert_audit_logs" ON data_access_log
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Create triggers for updating timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER update_personal_data_updated_at
    BEFORE UPDATE ON personal_data
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();

-- Drop old data_type function if it exists
DROP FUNCTION IF EXISTS get_data_type_stats();

-- Create function to get category statistics (replaced data_type with categories)
CREATE OR REPLACE FUNCTION get_category_distribution_stats()
RETURNS TABLE (
  classification TEXT,
  record_count BIGINT,
  avg_size NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pd.classification,
    COUNT(*) as record_count,
    AVG(octet_length(pd.content::text)) as avg_size
  FROM personal_data pd
  WHERE pd.deleted_at IS NULL
  GROUP BY pd.classification
  ORDER BY record_count DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC function for searching personal data with filters
CREATE OR REPLACE FUNCTION search_personal_data(
  p_user_id UUID,
  p_search_text TEXT DEFAULT NULL,
  p_categories TEXT[] DEFAULT NULL,
  p_tags TEXT[] DEFAULT NULL,
  p_classification TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  title TEXT,
  content JSONB,
  tags TEXT[],
  classification TEXT,
  category TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  last_accessed TIMESTAMPTZ
) AS $$
BEGIN
  -- Update last_accessed for audit purposes
  UPDATE personal_data 
  SET last_accessed = NOW() 
  WHERE personal_data.user_id = p_user_id;

  RETURN QUERY
  SELECT 
    pd.id,
    pd.user_id,
    pd.title,
    pd.content,
    pd.tags,
    pd.classification,
    pd.category,
    pd.created_at,
    pd.updated_at,
    pd.last_accessed
  FROM personal_data pd
  WHERE pd.user_id = p_user_id
    AND pd.deleted_at IS NULL
    AND (p_search_text IS NULL OR 
         pd.title ILIKE '%' || p_search_text || '%' OR 
         pd.content::text ILIKE '%' || p_search_text || '%')
    AND (p_categories IS NULL OR pd.category = ANY(p_categories))
    AND (p_tags IS NULL OR pd.tags && p_tags)
    AND (p_classification IS NULL OR pd.classification = p_classification)
  ORDER BY pd.updated_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC function for bulk operations on personal data
CREATE OR REPLACE FUNCTION bulk_update_personal_data_tags(
  p_user_id UUID,
  p_record_ids UUID[],
  p_tags_to_add TEXT[] DEFAULT NULL,
  p_tags_to_remove TEXT[] DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER := 0;
  record_id UUID;
BEGIN
  FOREACH record_id IN ARRAY p_record_ids
  LOOP
    UPDATE personal_data 
    SET 
      tags = CASE 
        WHEN p_tags_to_add IS NOT NULL THEN 
          array(SELECT DISTINCT unnest(tags || p_tags_to_add))
        ELSE tags
      END,
      tags = CASE
        WHEN p_tags_to_remove IS NOT NULL THEN
          array(SELECT unnest(tags) EXCEPT SELECT unnest(p_tags_to_remove))
        ELSE tags
      END,
      updated_at = NOW()
    WHERE id = record_id AND user_id = p_user_id AND deleted_at IS NULL;
    
    IF FOUND THEN
      updated_count := updated_count + 1;
    END IF;
  END LOOP;
  
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC function for soft delete with audit trail
CREATE OR REPLACE FUNCTION soft_delete_personal_data(
  p_user_id UUID,
  p_record_id UUID,
  p_deletion_reason TEXT DEFAULT 'User requested deletion'
)
RETURNS BOOLEAN AS $$
DECLARE
  record_exists BOOLEAN := FALSE;
BEGIN
  -- Check if record exists and belongs to user
  SELECT EXISTS(
    SELECT 1 FROM personal_data 
    WHERE id = p_record_id AND user_id = p_user_id AND deleted_at IS NULL
  ) INTO record_exists;
  
  IF NOT record_exists THEN
    RETURN FALSE;
  END IF;
  
  -- Soft delete the record
  UPDATE personal_data 
  SET 
    deleted_at = NOW(),
    content = jsonb_set(
      content, 
      '{deletion_metadata}', 
      jsonb_build_object(
        'deleted_at', NOW(),
        'reason', p_deletion_reason
      )
    )
  WHERE id = p_record_id AND user_id = p_user_id;
  
  -- Log the deletion
  INSERT INTO data_access_log (
    user_id, operation, table_name, record_id, 
    changes, ip_address, user_agent
  ) VALUES (
    p_user_id, 'DELETE', 'personal_data', p_record_id,
    jsonb_build_object('reason', p_deletion_reason),
    inet_client_addr(), 'soft_delete_function'
  );
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC function for GDPR-compliant hard delete
CREATE OR REPLACE FUNCTION hard_delete_user_data(
  p_user_id UUID,
  p_confirmation_token TEXT
)
RETURNS JSONB AS $$
DECLARE
  deleted_counts JSONB;
  profile_count INTEGER;
  personal_data_count INTEGER;
  audit_log_count INTEGER;
BEGIN
  -- Simple confirmation check (in production, this should be more robust)
  IF p_confirmation_token != 'CONFIRM_HARD_DELETE_' || p_user_id::text THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid confirmation token'
    );
  END IF;
  
  -- Count records before deletion
  SELECT COUNT(*) INTO profile_count FROM profiles WHERE user_id = p_user_id;
  SELECT COUNT(*) INTO personal_data_count FROM personal_data WHERE user_id = p_user_id;
  SELECT COUNT(*) INTO audit_log_count FROM data_access_log WHERE user_id = p_user_id;
  
  -- Delete all user data
  DELETE FROM data_access_log WHERE user_id = p_user_id;
  DELETE FROM personal_data WHERE user_id = p_user_id;
  DELETE FROM profiles WHERE user_id = p_user_id;
  
  -- Return deletion summary
  RETURN jsonb_build_object(
    'success', true,
    'deleted_counts', jsonb_build_object(
      'profiles', profile_count,
      'personal_data', personal_data_count,
      'audit_logs', audit_log_count
    ),
    'deleted_at', NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC function for data export (GDPR compliance)
CREATE OR REPLACE FUNCTION export_user_data(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'export_timestamp', NOW(),
    'user_id', p_user_id,
    'profiles', (
      SELECT jsonb_agg(to_jsonb(p.*))
      FROM profiles p
      WHERE p.user_id = p_user_id
    ),
    'personal_data', (
      SELECT jsonb_agg(to_jsonb(pd.*))
      FROM personal_data pd
      WHERE pd.user_id = p_user_id AND pd.deleted_at IS NULL
    )
    'audit_logs', (
      SELECT jsonb_agg(to_jsonb(al.*))
      FROM data_access_log al
      WHERE al.user_id = p_user_id
    )
  ) INTO result;
  
  -- Log the export operation
  INSERT INTO data_access_log (
    user_id, operation, table_name, changes, ip_address, user_agent
  ) VALUES (
    p_user_id, 'READ', 'data_export', 
    jsonb_build_object('export_type', 'full_user_data'),
    inet_client_addr(), 'export_function'
  );
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create sample data for testing
-- IMPORTANT: Replace 'YOUR_TEST_USER_UUID_HERE' with actual UUID from auth.users
-- 
-- To get a real user UUID:
-- 1. Go to Supabase Dashboard > Authentication > Users
-- 2. Click "Add User" and create: sample@example.com / TestPassword123!
-- 3. Copy the generated UUID and replace the placeholder below

-- First create a sample profile
INSERT INTO profiles (
  user_id,
  username,
  full_name,
  metadata
) VALUES (
  'YOUR_TEST_USER_UUID_HERE'::UUID, -- Replace with real UUID from auth.users
  'sample_user',
  'Sample User',
  '{"created_by": "schema_script", "source": "sample_data"}'
) ON CONFLICT (username) DO NOTHING;

-- Then create sample personal data linked to that profile
INSERT INTO personal_data (
  user_id,
  category,
  title,
  content,
  tags,
  classification
) VALUES (
  'YOUR_TEST_USER_UUID_HERE'::UUID, -- Replace with same UUID
  'contacts',
  'Emergency Contact',
  '{"name": "John Doe", "phone": "+1-555-0123", "relationship": "Emergency Contact"}',
  ARRAY['emergency', 'contact'],
  'personal'
) ON CONFLICT DO NOTHING;