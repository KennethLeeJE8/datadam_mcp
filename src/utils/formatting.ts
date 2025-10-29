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

export interface TruncationResult {
  text: string;
  wasTruncated: boolean;
  originalCount: number;
  truncatedCount: number;
  totalCount?: number;
  hasMore?: boolean;
  nextOffset?: number;
}

/**
 * Checks if response exceeds character limit and truncates if necessary
 */
export function checkAndTruncateResponse(
  results: PersonalDataRecord[],
  characterLimit: number,
  responseFormat: 'json' | 'markdown',
  offset: number,
  total?: number,
  hasMore?: boolean,
  nextOffset?: number,
  formatOptions?: FormattingOptions
): TruncationResult {
  const originalCount = results.length;

  // First try with all results
  let responseText: string;
  if (responseFormat === 'json') {
    responseText = formatAsJSON({
      results: results,
      total: total || results.length,
      count: results.length,
      hasMore: hasMore || false,
      nextOffset: nextOffset || 0
    });
  } else {
    responseText = formatAsMarkdown(results, formatOptions);
  }

  // If within limit, return as-is
  if (responseText.length <= characterLimit) {
    return {
      text: responseText,
      wasTruncated: false,
      originalCount,
      truncatedCount: originalCount,
      totalCount: total,
      hasMore,
      nextOffset
    };
  }

  // Need to truncate - iteratively reduce records
  let truncatedResults = results;
  let truncatedCount = originalCount;

  // Start with half, then keep halving until we fit or reach 1 record
  while (truncatedCount > 1 && responseText.length > characterLimit) {
    truncatedCount = Math.max(1, Math.floor(truncatedCount / 2));
    truncatedResults = results.slice(0, truncatedCount);

    if (responseFormat === 'json') {
      responseText = formatAsJSON({
        results: truncatedResults,
        total: total || results.length,
        count: truncatedCount,
        hasMore: true,
        nextOffset: offset + truncatedCount,
        truncated: true,
        truncationMessage: `Response truncated from ${originalCount} to ${truncatedCount} records due to ${characterLimit} character limit. Use 'offset=${offset + truncatedCount}', add filters, or narrow categories to see more.`
      });
    } else {
      const markdownResults = formatAsMarkdown(truncatedResults, formatOptions);
      responseText = `${markdownResults}\n\n⚠️ **Response Truncated**: Showing ${truncatedCount}/${originalCount} records (reduced due to ${characterLimit} char limit). Use offset=${offset + truncatedCount}, add filters, or narrow your search to see more.`;
    }
  }

  return {
    text: responseText,
    wasTruncated: true,
    originalCount,
    truncatedCount,
    totalCount: total,
    hasMore: true,
    nextOffset: offset + truncatedCount
  };
}
