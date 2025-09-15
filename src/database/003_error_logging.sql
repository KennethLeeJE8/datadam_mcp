-- Error logging tables for comprehensive error tracking and monitoring

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Main error logs table
CREATE TABLE IF NOT EXISTS error_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    level VARCHAR(20) NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error', 'critical')),
    message TEXT NOT NULL,
    category VARCHAR(50),
    context JSONB,
    error_details JSONB,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    hostname VARCHAR(255),
    process_id INTEGER,
    correlation_id VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_error_logs_timestamp ON error_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_level ON error_logs(level);
CREATE INDEX IF NOT EXISTS idx_error_logs_category ON error_logs(category);
CREATE INDEX IF NOT EXISTS idx_error_logs_correlation_id ON error_logs(correlation_id);
CREATE INDEX IF NOT EXISTS idx_error_logs_context_user_id ON error_logs USING GIN ((context->>'userId') gin_trgm_ops);

-- Error alerts table for critical issues requiring immediate attention
CREATE TABLE IF NOT EXISTS error_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    level VARCHAR(20) NOT NULL DEFAULT 'error',
    message TEXT NOT NULL,
    context JSONB,
    timestamp TIMESTAMPTZ NOT NULL,
    correlation_id VARCHAR(255),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'acknowledged', 'resolved', 'suppressed')),
    acknowledged_at TIMESTAMPTZ,
    acknowledged_by VARCHAR(255),
    resolved_at TIMESTAMPTZ,
    resolved_by VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for alerts
CREATE INDEX IF NOT EXISTS idx_error_alerts_status ON error_alerts(status);
CREATE INDEX IF NOT EXISTS idx_error_alerts_timestamp ON error_alerts(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_error_alerts_level ON error_alerts(level);

-- Error monitoring metrics table for tracking patterns and trends
CREATE TABLE IF NOT EXISTS error_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_type VARCHAR(50) NOT NULL,
    metric_name VARCHAR(100) NOT NULL,
    metric_value DECIMAL,
    labels JSONB,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for metrics
CREATE INDEX IF NOT EXISTS idx_error_metrics_type_name ON error_metrics(metric_type, metric_name);
CREATE INDEX IF NOT EXISTS idx_error_metrics_timestamp ON error_metrics(timestamp DESC);

-- Error recovery attempts table for tracking recovery strategies
CREATE TABLE IF NOT EXISTS error_recovery_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    error_correlation_id VARCHAR(255) NOT NULL,
    recovery_strategy VARCHAR(100) NOT NULL,
    attempt_number INTEGER NOT NULL DEFAULT 1,
    status VARCHAR(20) DEFAULT 'attempted' CHECK (status IN ('attempted', 'succeeded', 'failed', 'skipped')),
    error_details JSONB,
    recovery_context JSONB,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    duration_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for recovery attempts
CREATE INDEX IF NOT EXISTS idx_error_recovery_correlation_id ON error_recovery_attempts(error_correlation_id);
CREATE INDEX IF NOT EXISTS idx_error_recovery_strategy ON error_recovery_attempts(recovery_strategy);
CREATE INDEX IF NOT EXISTS idx_error_recovery_status ON error_recovery_attempts(status);

-- Function to get error statistics for a given time window
CREATE OR REPLACE FUNCTION get_error_stats(time_window INTERVAL DEFAULT '1 hour')
RETURNS TABLE (
    total_errors BIGINT,
    error_rate DECIMAL,
    errors_by_level JSONB,
    errors_by_category JSONB,
    top_error_messages JSONB
) AS $$
DECLARE
    start_time TIMESTAMPTZ := NOW() - time_window;
BEGIN
    RETURN QUERY
    WITH error_counts AS (
        SELECT 
            COUNT(*) as total,
            level,
            category,
            message
        FROM error_logs 
        WHERE timestamp >= start_time 
        GROUP BY level, category, message
    ),
    level_stats AS (
        SELECT jsonb_object_agg(level, count) as by_level
        FROM (
            SELECT level, COUNT(*) as count
            FROM error_logs 
            WHERE timestamp >= start_time
            GROUP BY level
        ) t
    ),
    category_stats AS (
        SELECT jsonb_object_agg(COALESCE(category, 'uncategorized'), count) as by_category
        FROM (
            SELECT category, COUNT(*) as count
            FROM error_logs 
            WHERE timestamp >= start_time
            GROUP BY category
        ) t
    ),
    top_messages AS (
        SELECT jsonb_agg(
            jsonb_build_object(
                'message', message,
                'count', count
            ) ORDER BY count DESC
        ) as top_msgs
        FROM (
            SELECT message, COUNT(*) as count
            FROM error_logs 
            WHERE timestamp >= start_time
            GROUP BY message
            ORDER BY count DESC
            LIMIT 10
        ) t
    )
    SELECT 
        (SELECT COUNT(*) FROM error_logs WHERE timestamp >= start_time)::BIGINT,
        (SELECT COUNT(*) FROM error_logs WHERE timestamp >= start_time)::DECIMAL / EXTRACT(EPOCH FROM time_window) * 3600,
        COALESCE((SELECT by_level FROM level_stats), '{}'::jsonb),
        COALESCE((SELECT by_category FROM category_stats), '{}'::jsonb),
        COALESCE((SELECT top_msgs FROM top_messages), '[]'::jsonb);
END;
$$ LANGUAGE plpgsql;

-- Function to clean up old error logs (retention policy)
CREATE OR REPLACE FUNCTION cleanup_old_error_logs(retention_days INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
    cutoff_date TIMESTAMPTZ := NOW() - (retention_days || ' days')::INTERVAL;
BEGIN
    DELETE FROM error_logs 
    WHERE timestamp < cutoff_date 
    AND level NOT IN ('error', 'critical');
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Keep critical and error logs longer (90 days)
    DELETE FROM error_logs 
    WHERE timestamp < (NOW() - INTERVAL '90 days')
    AND level IN ('error', 'critical');
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to automatically acknowledge resolved alerts
CREATE OR REPLACE FUNCTION auto_resolve_alerts()
RETURNS INTEGER AS $$
DECLARE
    resolved_count INTEGER;
BEGIN
    UPDATE error_alerts 
    SET 
        status = 'resolved',
        resolved_at = NOW(),
        resolved_by = 'auto-system',
        updated_at = NOW()
    WHERE status = 'pending' 
    AND timestamp < (NOW() - INTERVAL '1 hour')
    AND NOT EXISTS (
        SELECT 1 FROM error_logs 
        WHERE correlation_id = error_alerts.correlation_id 
        AND timestamp >= (NOW() - INTERVAL '30 minutes')
        AND level IN ('error', 'critical')
    );
    
    GET DIAGNOSTICS resolved_count = ROW_COUNT;
    RETURN resolved_count;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at timestamp on error_alerts
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_error_alerts_updated_at
    BEFORE UPDATE ON error_alerts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE error_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE error_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE error_recovery_attempts ENABLE ROW LEVEL SECURITY;

-- Policies for service role access
CREATE POLICY "Service role can manage error logs" ON error_logs FOR ALL TO service_role USING (true);
CREATE POLICY "Service role can manage error alerts" ON error_alerts FOR ALL TO service_role USING (true);
CREATE POLICY "Service role can manage error metrics" ON error_metrics FOR ALL TO service_role USING (true);
CREATE POLICY "Service role can manage error recovery attempts" ON error_recovery_attempts FOR ALL TO service_role USING (true);

-- Grant permissions
GRANT ALL ON error_logs TO service_role;
GRANT ALL ON error_alerts TO service_role;
GRANT ALL ON error_metrics TO service_role;
GRANT ALL ON error_recovery_attempts TO service_role;
GRANT EXECUTE ON FUNCTION get_error_stats(INTERVAL) TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_old_error_logs(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION auto_resolve_alerts() TO service_role;