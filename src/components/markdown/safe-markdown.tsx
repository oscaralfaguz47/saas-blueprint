"use client";

import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";

type SafeMarkdownProps = {
  markdown: string;
  className?: string;
};

/**
 * Renders markdown with rehype-sanitize (strict default allowlist). No raw HTML from content.
 */
export function SafeMarkdown({ markdown, className }: SafeMarkdownProps) {
  return (
    <div
      className={
        className ??
        "prose prose-sm max-w-none text-(--text-primary) [&_a]:text-(--color-primary) [&_pre]:bg-(--bg-surface-elev)"
      }
    >
      <ReactMarkdown rehypePlugins={[rehypeSanitize]} urlTransform={(u) => u}>
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
