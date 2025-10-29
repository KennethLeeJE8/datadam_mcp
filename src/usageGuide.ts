import type { SupabaseClient } from "@supabase/supabase-js";

interface Category {
  category_name: string;
  display_name: string;
  description: string;
  item_count: number;
  trigger_words: string[];
  query_hint: string;
  example_queries: string[];
  last_modified: string;
}

export async function generateUsageGuideHtml(supabase: SupabaseClient): Promise<string> {
  // Fetch active categories dynamically
  const { data: categories, error } = await supabase.rpc('get_active_categories');
  const categoriesHtml = categories && categories.length > 0
    ? categories.map((cat: Category) => `
        <div class="category-card">
          <h4>${cat.display_name} <span class="item-count">(${cat.item_count} items)</span></h4>
          <p><strong>Key:</strong> <code>${cat.category_name}</code></p>
          <p class="description">${cat.description}</p>
          <p class="keywords"><strong>Keywords:</strong> ${cat.trigger_words.join(', ')}</p>
        </div>
      `).join('')
    : '<p>No categories available yet. Categories will appear once data is added.</p>';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Datadam MCP Server - Usage Guide</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      line-height: 1.6;
      color: #333;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 20px;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      overflow: hidden;
    }
    header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 40px;
      text-align: center;
    }
    header h1 {
      font-size: 2.5em;
      margin-bottom: 10px;
    }
    header p {
      font-size: 1.2em;
      opacity: 0.9;
    }
    .content {
      padding: 40px;
    }
    section {
      margin-bottom: 40px;
    }
    h2 {
      color: #667eea;
      border-bottom: 3px solid #667eea;
      padding-bottom: 10px;
      margin-bottom: 20px;
      font-size: 1.8em;
    }
    h3 {
      color: #764ba2;
      margin-top: 20px;
      margin-bottom: 10px;
      font-size: 1.3em;
    }
    h4 {
      color: #555;
      margin-top: 15px;
      margin-bottom: 8px;
    }
    .endpoint-box {
      background: #f8f9fa;
      border-left: 4px solid #667eea;
      padding: 15px;
      margin: 15px 0;
      border-radius: 4px;
    }
    .endpoint-box code {
      background: #e9ecef;
      padding: 3px 8px;
      border-radius: 3px;
      font-family: 'Monaco', 'Courier New', monospace;
      color: #d63384;
    }
    pre {
      background: #1e1e1e;
      color: #d4d4d4;
      padding: 20px;
      border-radius: 6px;
      overflow-x: auto;
      margin: 10px 0;
    }
    pre code {
      font-family: 'Monaco', 'Courier New', monospace;
      font-size: 0.9em;
      line-height: 1.5;
    }
    .tool-card {
      background: #f8f9fa;
      border: 1px solid #dee2e6;
      border-radius: 8px;
      padding: 20px;
      margin: 15px 0;
    }
    .tool-card h3 {
      margin-top: 0;
      color: #667eea;
    }
    .category-card {
      background: #fff;
      border: 1px solid #e9ecef;
      border-radius: 6px;
      padding: 15px;
      margin: 10px 0;
      box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    }
    .category-card h4 {
      margin-top: 0;
      color: #667eea;
    }
    .item-count {
      font-weight: normal;
      color: #6c757d;
      font-size: 0.9em;
    }
    .description {
      color: #666;
      margin: 8px 0;
    }
    .keywords {
      font-size: 0.9em;
      color: #6c757d;
    }
    code {
      background: #f1f3f5;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'Monaco', 'Courier New', monospace;
      color: #e83e8c;
      font-size: 0.9em;
    }
    ul, ol {
      margin-left: 30px;
      margin-top: 10px;
    }
    li {
      margin: 8px 0;
    }
    .note {
      background: #fff3cd;
      border-left: 4px solid #ffc107;
      padding: 15px;
      margin: 15px 0;
      border-radius: 4px;
    }
    .note strong {
      color: #856404;
    }
    footer {
      background: #f8f9fa;
      padding: 20px 40px;
      text-align: center;
      color: #6c757d;
      border-top: 1px solid #dee2e6;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>🗄️ Datadam MCP Server</h1>
      <p>Personal Knowledge Database with Model Context Protocol</p>
    </header>

    <div class="content">
      <section>
        <h2>📖 Overview</h2>
        <p>Datadam is a personal knowledge database server that automatically retrieves and stores personal context through the Model Context Protocol (MCP). It captures personal information when shared and retrieves it when needed for personalized responses.</p>

        <div class="endpoint-box">
          <strong>MCP Endpoints:</strong><br>
          Main endpoint: <code>https://datadam-mcp.onrender.com/mcp</code><br>
          ChatGPT endpoint: <code>https://datadam-mcp.onrender.com/chatgpt_mcp</code>
        </div>
      </section>

      <section>
        <h2>🔌 How to Connect</h2>

        <h3>Claude Desktop</h3>
        <p>Add to your Claude Desktop configuration file:</p>
        <pre><code>{
  "mcpServers": {
    "datadam": {
      "url": "https://datadam-mcp.onrender.com/mcp",
      "transport": "http"
    }
  }
}</code></pre>
        <p><strong>Config location:</strong> <code>~/Library/Application Support/Claude/claude_desktop_config.json</code> (macOS)</p>

        <h3>Claude Code (VS Code Extension)</h3>
        <p>Add to your MCP settings in Claude Code:</p>
        <pre><code>{
  "mcpServers": {
    "datadam": {
      "url": "https://datadam-mcp.onrender.com/mcp",
      "transport": "http"
    }
  }
}</code></pre>

        <h3>ChatGPT</h3>
        <p>Use the dedicated ChatGPT endpoint for citation-friendly search:</p>
        <pre><code>Endpoint: https://datadam-mcp.onrender.com/chatgpt_mcp
Transport: HTTP/SSE</code></pre>

        <h3>Cursor</h3>
        <p>Add to Cursor's MCP configuration:</p>
        <pre><code>{
  "mcpServers": {
    "datadam": {
      "url": "https://datadam-mcp.onrender.com/mcp",
      "transport": "http"
    }
  }
}</code></pre>

        <h3>VS Code (with MCP extension)</h3>
        <p>Install an MCP extension for VS Code, then configure:</p>
        <pre><code>{
  "mcp.servers": {
    "datadam": {
      "url": "https://datadam-mcp.onrender.com/mcp",
      "transport": "http"
    }
  }
}</code></pre>

        <h3>Gemini</h3>
        <p>Configure in your Gemini MCP settings:</p>
        <pre><code>Server URL: https://datadam-mcp.onrender.com/mcp
Protocol: MCP over HTTP</code></pre>
      </section>

      <section>
        <h2>🛠️ Available Tools</h2>

        <div class="tool-card">
          <h3>1. search-personal-data</h3>
          <p><strong>Purpose:</strong> Search for specific datapoints, names, or details using keyword matching</p>
          <p><strong>When to use:</strong> Looking for a specific person ("find John"), specific datapoint ("my passport number"), or concrete terms</p>
          <p><strong>Parameters:</strong></p>
          <ul>
            <li><code>query</code> (required): Specific search term or name</li>
            <li><code>categories</code> (optional): Filter by categories</li>
            <li><code>tags</code> (optional): Filter by tags</li>
            <li><code>classification</code> (optional): Filter by sensitivity level</li>
            <li><code>limit</code> (optional): Max results (default: 20)</li>
            <li><code>userId</code> (optional): User UUID</li>
          </ul>
          <p><strong>Example:</strong> Search for "John email" to find John's contact info</p>
        </div>

        <div class="tool-card">
          <h3>2. extract-personal-data</h3>
          <p><strong>Purpose:</strong> Retrieve all items by category or tags for browsing</p>
          <p><strong>When to use:</strong> "all my contacts", "my books", "family contacts"</p>
          <p><strong>Parameters:</strong></p>
          <ul>
            <li><code>category</code> (required): Category to retrieve</li>
            <li><code>tags</code> (optional): Filter by tags within category</li>
            <li><code>limit</code> (optional): Results per page (default: 50)</li>
            <li><code>offset</code> (optional): Pagination offset</li>
            <li><code>userId</code> (optional): User UUID</li>
            <li><code>filters</code> (optional): Additional filters</li>
          </ul>
          <p><strong>Example:</strong> Extract category "contacts" with tags ["family"]</p>
        </div>

        <div class="tool-card">
          <h3>3. create-personal-data</h3>
          <p><strong>Purpose:</strong> Capture and store personal data (aggressive capture mode)</p>
          <p><strong>When to use:</strong> User shares personal info like "my email is x@y.com" or "I live in Boston"</p>
          <div class="note">
            <strong>CRITICAL:</strong> Create ONE entry per entity. Storing 2 books? Make 2 SEPARATE tool calls (one per book). Storing 3 contacts? Make 3 SEPARATE tool calls (one per contact). NEVER batch multiple entities into one record.
          </div>
          <p><strong>Parameters:</strong></p>
          <ul>
            <li><code>category</code> (required): Data category</li>
            <li><code>title</code> (required): Descriptive title</li>
            <li><code>content</code> (required): Attributes as JSON (keep concise, attributes only)</li>
            <li><code>tags</code> (optional): Tags in singular form</li>
            <li><code>classification</code> (optional): Sensitivity level (default: 'personal')</li>
            <li><code>userId</code> (optional): User UUID</li>
          </ul>
          <p><strong>Example:</strong> Store contact with title "John Smith - Work" and content {email: "john@company.com", phone: "555-1234"}</p>
          <div class="note">
            <strong>Note:</strong> Content should be structured attributes tied to the title - NOT explanations or long lists. Keep it concise with key-value pairs only.
          </div>
        </div>

        <div class="tool-card">
          <h3>4. update-personal-data</h3>
          <p><strong>Purpose:</strong> Modify existing personal data records</p>
          <p><strong>When to use:</strong> User wants to change info like "update John's email to new@email.com"</p>
          <p><strong>Parameters:</strong></p>
          <ul>
            <li><code>recordId</code> (required): UUID from search/extract</li>
            <li><code>updates</code> (required): Fields to update as JSON</li>
            <li><code>conversationContext</code> (optional): Context for updates</li>
          </ul>
          <p><strong>Workflow:</strong> Search for record first → get UUID → update with UUID</p>
        </div>

        <div class="tool-card">
          <h3>5. delete-personal-data</h3>
          <p><strong>Purpose:</strong> Remove personal data records</p>
          <p><strong>When to use:</strong> User explicitly wants to delete: "delete John's contact", "forget my location"</p>
          <p><strong>Parameters:</strong></p>
          <ul>
            <li><code>recordIds</code> (required): Array of UUIDs to delete</li>
            <li><code>hardDelete</code> (optional): Permanent deletion (default: false, soft delete)</li>
          </ul>
          <p><strong>Deletion types:</strong></p>
          <ul>
            <li><strong>Soft delete (default):</strong> Marks as deleted, recoverable</li>
            <li><strong>Hard delete:</strong> Permanent removal (GDPR compliance only)</li>
          </ul>
        </div>
      </section>

      <section>
        <h2>📚 Available Resources</h2>
        <div class="tool-card">
          <h3>data-categories</h3>
          <p><strong>URI:</strong> <code>data://categories</code></p>
          <p><strong>Description:</strong> Lists all available personal data categories with item counts, descriptions, keywords, and example queries</p>
        </div>
      </section>

      <section>
        <h2>🏷️ Data Categories</h2>
        ${categoriesHtml}
      </section>

      <section>
        <h2>💡 Tips</h2>
        <ul>
          <li>Use <strong>search-personal-data</strong> when looking for something specific</li>
          <li>Use <strong>extract-personal-data</strong> when browsing a category</li>
          <li>The server uses aggressive capture - it will automatically store personal info when shared</li>
          <li>Tags should always be in singular form: 'family', 'work', not 'families', 'works'</li>
          <li>Keep content attributes concise - don't include explanations or long text</li>
        </ul>
      </section>
    </div>

    <footer>
      <p>Datadam MCP Server v1.0.0 | Powered by Model Context Protocol</p>
      <p>MCP Endpoints: <code>/mcp</code> (main) | <code>/chatgpt_mcp</code> (ChatGPT)</p>
    </footer>
  </div>
</body>
</html>
  `;
}
