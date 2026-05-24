import React from 'react';

/**
 * A lightweight, safe Markdown-to-React parser.
 * Supports:
 *   - Headers: # (H1), ## (H2), ### (H3)
 *   - Lists: Unordered (- or *), Ordered (1.)
 *   - Blockquotes: >
 *   - Bold: **text**
 *   - Italic: *text*
 *   - Inline code: `code`
 *   - Links: [text](url)
 */

function parseInline(text) {
  if (!text) return '';

  let parts = [{ type: 'text', content: text }];

  // 1. Parse Links: [text](url)
  parts = parts.flatMap(part => {
    if (part.type !== 'text') return part;
    const regex = /\[([^\]]+)\]\(([^)]+)\)/g;
    const result = [];
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(part.content)) !== null) {
      if (match.index > lastIndex) {
        result.push({ type: 'text', content: part.content.substring(lastIndex, match.index) });
      }
      result.push({ type: 'link', text: match[1], url: match[2] });
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < part.content.length) {
      result.push({ type: 'text', content: part.content.substring(lastIndex) });
    }
    return result;
  });

  // 2. Parse Bold: **text**
  parts = parts.flatMap(part => {
    if (part.type !== 'text') return part;
    const regex = /\*\*([^*]+)\*\*/g;
    const result = [];
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(part.content)) !== null) {
      if (match.index > lastIndex) {
        result.push({ type: 'text', content: part.content.substring(lastIndex, match.index) });
      }
      result.push({ type: 'bold', content: match[1] });
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < part.content.length) {
      result.push({ type: 'text', content: part.content.substring(lastIndex) });
    }
    return result;
  });

  // 3. Parse Italic: *text*
  parts = parts.flatMap(part => {
    if (part.type !== 'text') return part;
    const regex = /\*([^*]+)\*/g;
    const result = [];
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(part.content)) !== null) {
      if (match.index > lastIndex) {
        result.push({ type: 'text', content: part.content.substring(lastIndex, match.index) });
      }
      result.push({ type: 'italic', content: match[1] });
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < part.content.length) {
      result.push({ type: 'text', content: part.content.substring(lastIndex) });
    }
    return result;
  });

  // 4. Parse Inline Code: `code`
  parts = parts.flatMap(part => {
    if (part.type !== 'text') return part;
    const regex = /`([^`]+)`/g;
    const result = [];
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(part.content)) !== null) {
      if (match.index > lastIndex) {
        result.push({ type: 'text', content: part.content.substring(lastIndex, match.index) });
      }
      result.push({ type: 'code', content: match[1] });
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < part.content.length) {
      result.push({ type: 'text', content: part.content.substring(lastIndex) });
    }
    return result;
  });

  return parts.map((part, idx) => {
    switch (part.type) {
      case 'bold':
        return <strong key={idx}>{part.content}</strong>;
      case 'italic':
        return <em key={idx}>{part.content}</em>;
      case 'code':
        return (
          <code key={idx} style={{ 
            background: 'rgba(255, 255, 255, 0.08)', 
            padding: '0.1rem 0.35rem', 
            borderRadius: 'var(--radius-sm, 4px)', 
            fontFamily: 'monospace',
            fontSize: '0.85em',
            color: 'var(--primary)'
          }}>
            {part.content}
          </code>
        );
      case 'link':
        return (
          <a key={idx} href={part.url} target="_blank" rel="noopener noreferrer" style={{ 
            color: 'var(--primary)', 
            textDecoration: 'underline' 
          }}>
            {part.text}
          </a>
        );
      default:
        return part.content;
    }
  });
}

export function renderMarkdown(text) {
  if (!text) return null;

  // Split text by double newlines to get paragraphs / blocks
  const blocks = text.split(/\n\s*\n/);

  return blocks.map((block, blockIdx) => {
    let trimmed = block.trim();
    if (!trimmed) return null;

    // Check for headers
    if (trimmed.startsWith('# ')) {
      return <h1 key={blockIdx} className="md-h1">{parseInline(trimmed.slice(2))}</h1>;
    }
    if (trimmed.startsWith('## ')) {
      return <h2 key={blockIdx} className="md-h2">{parseInline(trimmed.slice(3))}</h2>;
    }
    if (trimmed.startsWith('### ')) {
      return <h3 key={blockIdx} className="md-h3">{parseInline(trimmed.slice(4))}</h3>;
    }

    // Check for blockquotes
    if (trimmed.startsWith('> ')) {
      const quoteLines = trimmed.split('\n').map(line => line.replace(/^>\s?/, ''));
      return (
        <blockquote key={blockIdx} className="md-blockquote">
          {quoteLines.map((line, idx) => (
            <p key={idx} style={{ margin: 0, marginBottom: idx < quoteLines.length - 1 ? '0.5rem' : 0 }}>
              {parseInline(line)}
            </p>
          ))}
        </blockquote>
      );
    }

    // Check for list items (bullet list)
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const listLines = trimmed.split('\n');
      const items = [];
      let currentItem = '';

      listLines.forEach(line => {
        const itemMatch = line.match(/^[-*]\s+(.*)/);
        if (itemMatch) {
          if (currentItem) items.push(currentItem);
          currentItem = itemMatch[1];
        } else {
          currentItem += '\n' + line.trim();
        }
      });
      if (currentItem) items.push(currentItem);

      return (
        <ul key={blockIdx} className="md-ul">
          {items.map((item, idx) => (
            <li key={idx} className="md-li">{parseInline(item)}</li>
          ))}
        </ul>
      );
    }

    // Check for ordered list items
    if (/^\d+\.\s+/.test(trimmed)) {
      const listLines = trimmed.split('\n');
      const items = [];
      let currentItem = '';

      listLines.forEach(line => {
        const itemMatch = line.match(/^\d+\.\s+(.*)/);
        if (itemMatch) {
          if (currentItem) items.push(currentItem);
          currentItem = itemMatch[1];
        } else {
          currentItem += '\n' + line.trim();
        }
      });
      if (currentItem) items.push(currentItem);

      return (
        <ol key={blockIdx} className="md-ol">
          {items.map((item, idx) => (
            <li key={idx} className="md-li">{parseInline(item)}</li>
          ))}
        </ol>
      );
    }

    // Regular paragraph (can have internal newlines)
    const lines = trimmed.split('\n');
    return (
      <p key={blockIdx} className="md-p">
        {lines.map((line, idx) => (
          <React.Fragment key={idx}>
            {idx > 0 && <br />}
            {parseInline(line)}
          </React.Fragment>
        ))}
      </p>
    );
  });
}
