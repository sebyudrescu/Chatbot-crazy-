import type { ReactNode } from "react";

interface SafeRichTextProps {
  content: string;
  className?: string;
}

const inlinePattern = /(\[([^\]\n]+)\]\(([^)\s]+)\)|\*\*([^*\n]+)\*\*|__([^_\n]+)__|`([^`\n]+)`|\*([^*\n]+)\*|_([^_\n]+)_)/g;

export function safeHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function inlineNodes(value: string, prefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;

  for (const match of value.matchAll(inlinePattern)) {
    const index = match.index ?? 0;
    if (index > cursor) nodes.push(value.slice(cursor, index));
    const key = `${prefix}-${index}`;

    if (match[2] && match[3]) {
      const href = safeHttpUrl(match[3]);
      nodes.push(
        href ? (
          <a key={key} href={href} target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-2">
            {inlineNodes(match[2], `${key}-link`)}
          </a>
        ) : (
          match[0]
        ),
      );
    } else if (match[4] || match[5]) {
      nodes.push(<strong key={key} className="font-semibold">{inlineNodes(match[4] || match[5], `${key}-strong`)}</strong>);
    } else if (match[6]) {
      nodes.push(<code key={key} className="rounded bg-black/10 px-1 py-0.5 font-mono text-[0.92em]">{match[6]}</code>);
    } else if (match[7] || match[8]) {
      nodes.push(<em key={key}>{inlineNodes(match[7] || match[8], `${key}-em`)}</em>);
    }
    cursor = index + match[0].length;
  }

  if (cursor < value.length) nodes.push(value.slice(cursor));
  return nodes;
}

export function SafeRichText({ content, className = "" }: SafeRichTextProps) {
  const lines = String(content || "").replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];

  for (let index = 0; index < lines.length;) {
    if (!lines[index].trim()) {
      index += 1;
      continue;
    }

    const unordered = lines[index].match(/^\s*[-+*]\s+(.+)$/);
    const ordered = lines[index].match(/^\s*\d+[.)]\s+(.+)$/);
    if (unordered || ordered) {
      const items: ReactNode[] = [];
      const isOrdered = Boolean(ordered);
      while (index < lines.length) {
        const item = lines[index].match(isOrdered ? /^\s*\d+[.)]\s+(.+)$/ : /^\s*[-+*]\s+(.+)$/);
        if (!item) break;
        items.push(<li key={`item-${index}`}>{inlineNodes(item[1], `item-${index}`)}</li>);
        index += 1;
      }
      blocks.push(isOrdered
        ? <ol key={`list-${index}`} className="list-decimal space-y-1 pl-5">{items}</ol>
        : <ul key={`list-${index}`} className="list-disc space-y-1 pl-5">{items}</ul>);
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim() && !/^\s*(?:[-+*]|\d+[.)])\s+/.test(lines[index])) {
      paragraph.push(lines[index]);
      index += 1;
    }
    blocks.push(
      <p key={`paragraph-${index}`}>
        {paragraph.flatMap((line, lineIndex) => [
          ...(lineIndex ? [<br key={`br-${index}-${lineIndex}`} />] : []),
          ...inlineNodes(line, `paragraph-${index}-${lineIndex}`),
        ])}
      </p>,
    );
  }

  return <div className={`space-y-2 break-words ${className}`.trim()}>{blocks}</div>;
}
