import type { ReactNode } from "react";

type MarkdownBlock =
  | { type: "heading"; level: number; content: string }
  | { type: "paragraph"; content: string }
  | { type: "unordered-list"; items: string[] }
  | { type: "ordered-list"; items: string[] }
  | { type: "blockquote"; content: string }
  | { type: "code"; language?: string; content: string }
  | { type: "divider" };

type MarkdownTextProps = {
  text: string;
  className?: string;
};

const inlineTokenPattern =
  /(\[[^\]\n]+\]\([^)]+\)|`[^`\n]+`|\*\*[^*\n]+?\*\*|__[^_\n]+?__|\*[^*\n]+?\*|_[^_\n]+?_)/g;

function isSafeHref(href: string) {
  return /^(https?:\/\/|mailto:|#)/i.test(href);
}

function isDivider(line: string) {
  return /^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line);
}

function isBlockStart(line: string) {
  return (
    line.trim() === "" ||
    line.startsWith("```") ||
    /^#{1,6}\s+/.test(line) ||
    /^>\s?/.test(line) ||
    /^\s*[-*+]\s+\S/.test(line) ||
    /^\s*\d+[.)]\s+\S/.test(line) ||
    isDivider(line)
  );
}

function parseMarkdown(text: string) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";

    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (line.startsWith("```")) {
      const language = line.slice(3).trim() || undefined;
      const codeLines: string[] = [];
      index += 1;

      while (index < lines.length && !lines[index]?.startsWith("```")) {
        codeLines.push(lines[index] ?? "");
        index += 1;
      }

      if (index < lines.length) {
        index += 1;
      }

      blocks.push({ type: "code", language, content: codeLines.join("\n") });
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);

    if (heading) {
      blocks.push({
        type: "heading",
        level: heading[1].length,
        content: heading[2].trim()
      });
      index += 1;
      continue;
    }

    if (isDivider(line)) {
      blocks.push({ type: "divider" });
      index += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = [];

      while (index < lines.length && /^>\s?/.test(lines[index] ?? "")) {
        quoteLines.push((lines[index] ?? "").replace(/^>\s?/, ""));
        index += 1;
      }

      blocks.push({ type: "blockquote", content: quoteLines.join("\n") });
      continue;
    }

    if (/^\s*[-*+]\s+\S/.test(line)) {
      const items: string[] = [];

      while (index < lines.length) {
        const match = (lines[index] ?? "").match(/^\s*[-*+]\s+(.+)$/);

        if (!match) {
          break;
        }

        items.push(match[1].trim());
        index += 1;
      }

      blocks.push({ type: "unordered-list", items });
      continue;
    }

    if (/^\s*\d+[.)]\s+\S/.test(line)) {
      const items: string[] = [];

      while (index < lines.length) {
        const match = (lines[index] ?? "").match(/^\s*\d+[.)]\s+(.+)$/);

        if (!match) {
          break;
        }

        items.push(match[1].trim());
        index += 1;
      }

      blocks.push({ type: "ordered-list", items });
      continue;
    }

    const paragraphLines: string[] = [];

    while (index < lines.length && !isBlockStart(lines[index] ?? "")) {
      paragraphLines.push(lines[index] ?? "");
      index += 1;
    }

    blocks.push({ type: "paragraph", content: paragraphLines.join("\n") });
  }

  return blocks;
}

function renderInlineSegment(segment: string, key: string) {
  const link = segment.match(/^\[([^\]]+)\]\(([^)]+)\)$/);

  if (link) {
    const href = link[2].trim();

    if (!isSafeHref(href)) {
      return link[1];
    }

    return (
      <a
        key={key}
        href={href}
        target={href.startsWith("#") ? undefined : "_blank"}
        rel={href.startsWith("#") ? undefined : "noreferrer"}
        className="font-semibold text-atlasBlue underline-offset-2 hover:underline"
      >
        {link[1]}
      </a>
    );
  }

  if (/^`[^`\n]+`$/.test(segment)) {
    return (
      <code
        key={key}
        className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.92em] text-slate-800"
      >
        {segment.slice(1, -1)}
      </code>
    );
  }

  if (/^\*\*[^*\n]+?\*\*$/.test(segment) || /^__[^_\n]+?__$/.test(segment)) {
    return (
      <strong key={key} className="font-bold text-ink">
        {segment.slice(2, -2)}
      </strong>
    );
  }

  if (/^\*[^*\n]+?\*$/.test(segment) || /^_[^_\n]+?_$/.test(segment)) {
    return (
      <em key={key} className="italic">
        {segment.slice(1, -1)}
      </em>
    );
  }

  return segment;
}

function renderInlineText(text: string, keyPrefix: string) {
  const lines = text.split("\n");
  const nodes: ReactNode[] = [];

  lines.forEach((line, lineIndex) => {
    const parts = line.split(inlineTokenPattern).filter(Boolean);

    parts.forEach((part, partIndex) => {
      nodes.push(
        renderInlineSegment(part, `${keyPrefix}-${lineIndex}-${partIndex}`)
      );
    });

    if (lineIndex < lines.length - 1) {
      nodes.push(<br key={`${keyPrefix}-${lineIndex}-br`} />);
    }
  });

  return nodes;
}

function headingClass(level: number) {
  if (level === 1) {
    return "text-2xl font-bold leading-8 text-ink";
  }

  if (level === 2) {
    return "text-xl font-bold leading-7 text-ink";
  }

  if (level === 3) {
    return "text-lg font-bold leading-7 text-ink";
  }

  return "text-base font-bold leading-7 text-ink";
}

export function MarkdownText({ text, className }: MarkdownTextProps) {
  const blocks = parseMarkdown(text);
  const rootClassName = ["space-y-3 text-slate-700", className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={rootClassName}>
      {blocks.map((block, blockIndex) => {
        if (block.type === "heading") {
          const content = renderInlineText(
            block.content,
            `heading-${blockIndex}`
          );
          const className = headingClass(block.level);

          if (block.level === 1) {
            return (
              <h1 key={`heading-${blockIndex}`} className={className}>
                {content}
              </h1>
            );
          }

          if (block.level === 2) {
            return (
              <h2 key={`heading-${blockIndex}`} className={className}>
                {content}
              </h2>
            );
          }

          if (block.level === 3) {
            return (
              <h3 key={`heading-${blockIndex}`} className={className}>
                {content}
              </h3>
            );
          }

          if (block.level === 4) {
            return (
              <h4 key={`heading-${blockIndex}`} className={className}>
                {content}
              </h4>
            );
          }

          if (block.level === 5) {
            return (
              <h5 key={`heading-${blockIndex}`} className={className}>
                {content}
              </h5>
            );
          }

          return (
            <h6 key={`heading-${blockIndex}`} className={className}>
              {content}
            </h6>
          );
        }

        if (block.type === "paragraph") {
          return (
            <p
              key={`paragraph-${blockIndex}`}
              className="text-sm leading-7 text-slate-700"
            >
              {renderInlineText(block.content, `paragraph-${blockIndex}`)}
            </p>
          );
        }

        if (block.type === "unordered-list") {
          return (
            <ul
              key={`unordered-${blockIndex}`}
              className="ml-5 list-disc space-y-1 text-sm leading-7 text-slate-700"
            >
              {block.items.map((item, itemIndex) => (
                <li key={`unordered-${blockIndex}-${itemIndex}`}>
                  {renderInlineText(item, `unordered-${blockIndex}-${itemIndex}`)}
                </li>
              ))}
            </ul>
          );
        }

        if (block.type === "ordered-list") {
          return (
            <ol
              key={`ordered-${blockIndex}`}
              className="ml-5 list-decimal space-y-1 text-sm leading-7 text-slate-700"
            >
              {block.items.map((item, itemIndex) => (
                <li key={`ordered-${blockIndex}-${itemIndex}`}>
                  {renderInlineText(item, `ordered-${blockIndex}-${itemIndex}`)}
                </li>
              ))}
            </ol>
          );
        }

        if (block.type === "blockquote") {
          return (
            <blockquote
              key={`blockquote-${blockIndex}`}
              className="border-l-4 border-blue-200 bg-blue-50/60 px-3 py-2 text-sm leading-7 text-slate-700"
            >
              {renderInlineText(block.content, `blockquote-${blockIndex}`)}
            </blockquote>
          );
        }

        if (block.type === "code") {
          return (
            <pre
              key={`code-${blockIndex}`}
              className="thin-scrollbar overflow-x-auto rounded-md bg-slate-950 p-3 text-xs leading-6 text-slate-50"
            >
              {block.language && (
                <div className="mb-2 font-sans text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  {block.language}
                </div>
              )}
              <code>{block.content}</code>
            </pre>
          );
        }

        return (
          <hr key={`divider-${blockIndex}`} className="border-slate-200" />
        );
      })}
    </div>
  );
}
