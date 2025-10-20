// Formatting utilities for MCP tool responses

export interface PersonalDataRecord {
  id: string;
  user_id?: string;
  title: string;
  content: any;
  tags?: string[];
  category: string;
  classification: string;
  created_at: string;
  updated_at?: string;
}

export interface FormattingOptions {
  showIds?: boolean;
  maxContentLength?: number;
}

/**
 * Formats personal data records as human-readable Markdown
 */
export function formatAsMarkdown(
  records: PersonalDataRecord[],
  options?: FormattingOptions
): string {
  if (!records || records.length === 0) {
    return "No records found.";
  }

  const { showIds = false, maxContentLength = 200 } = options || {};

  let output = `# Results\n\nFound ${records.length} record(s)\n\n`;

  records.forEach((record, index) => {
    output += `## ${index + 1}. ${record.title}\n\n`;
    output += `- **Category**: ${record.category}\n`;

    if (record.tags && record.tags.length > 0) {
      output += `- **Tags**: ${record.tags.join(', ')}\n`;
    }

    if (record.classification) {
      output += `- **Classification**: ${record.classification}\n`;
    }

    if (showIds) {
      output += `- **ID**: \`${record.id}\`\n`;
    }

    // Format content
    const contentStr = JSON.stringify(record.content, null, 2);
    if (contentStr.length > maxContentLength) {
      output += `\n**Content** (truncated):\n\`\`\`json\n${contentStr.slice(0, maxContentLength)}...\n\`\`\`\n`;
    } else {
      output += `\n**Content**:\n\`\`\`json\n${contentStr}\n\`\`\`\n`;
    }

    if (record.created_at) {
      output += `- **Created**: ${formatTimestamp(record.created_at)}\n`;
    }

    output += `\n---\n\n`;
  });

  return output;
}

/**
 * Formats data as structured JSON for machine readability
 */
export function formatAsJSON(data: {
  results: PersonalDataRecord[];
  total?: number;
  count?: number;
  hasMore?: boolean;
  nextOffset?: number;
  truncated?: boolean;
  truncationMessage?: string;
}): string {
  return JSON.stringify({
    total: data.total || data.results.length,
    count: data.count || data.results.length,
    results: data.results,
    has_more: data.hasMore || false,
    next_offset: data.nextOffset || 0,
    ...(data.truncated && {
      truncated: true,
      truncation_message: data.truncationMessage
    })
  }, null, 2);
}

/**
 * Formats a single record as Markdown
 */
export function formatSingleRecordMarkdown(record: PersonalDataRecord): string {
  let output = `# ${record.title}\n\n`;
  output += `- **Category**: ${record.category}\n`;

  if (record.tags && record.tags.length > 0) {
    output += `- **Tags**: ${record.tags.join(', ')}\n`;
  }

  if (record.classification) {
    output += `- **Classification**: ${record.classification}\n`;
  }

  output += `- **ID**: \`${record.id}\`\n\n`;

  output += `**Content**:\n\`\`\`json\n${JSON.stringify(record.content, null, 2)}\n\`\`\`\n\n`;

  if (record.created_at) {
    output += `**Created**: ${formatTimestamp(record.created_at)}\n`;
  }

  return output;
}

/**
 * Formats a timestamp as human-readable string
 */
export function formatTimestamp(timestamp: string): string {
  return new Date(timestamp).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  });
}

/**
 * Formats a success message for create/update/delete operations
 */
export function formatSuccessMessage(
  operation: 'created' | 'updated' | 'deleted',
  title: string,
  category?: string,
  responseFormat: 'json' | 'markdown' = 'markdown'
): string {
  if (responseFormat === 'json') {
    return JSON.stringify({
      success: true,
      operation,
      title,
      ...(category && { category }),
      message: `Successfully ${operation} record: "${title}"${category ? ` in category "${category}"` : ''}`
    }, null, 2);
  }

  return `✓ Successfully ${operation} record: **${title}**${category ? ` in category **${category}**` : ''}`;
}

/**
 * Formats an error message for better LLM understanding
 */
export function formatErrorMessage(
  error: string,
  suggestion?: string,
  responseFormat: 'json' | 'markdown' = 'markdown'
): string {
  if (responseFormat === 'json') {
    return JSON.stringify({
      error: true,
      message: error,
      ...(suggestion && { suggestion })
    }, null, 2);
  }

  let output = `❌ **Error**: ${error}\n`;
  if (suggestion) {
    output += `\n💡 **Suggestion**: ${suggestion}`;
  }
  return output;
}
