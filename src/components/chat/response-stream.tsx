"use client";

import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { markdownComponents } from "./markdown-renderers";

const PROSE_CLASSES = cn(
  "prose prose-base dark:prose-invert max-w-none",
  "prose-headings:mb-3 prose-headings:mt-6 first:prose-headings:mt-0",
  "prose-h2:text-xl prose-h3:text-lg",
  "prose-p:mb-3 prose-p:leading-7",
  "prose-li:my-1 prose-li:leading-7",
  "prose-ul:my-3 prose-ol:my-3",
  "prose-strong:text-foreground",
  "prose-table:text-sm",
  "prose-th:px-3 prose-th:py-2",
  "prose-td:px-3 prose-td:py-2"
);

interface ResponseStreamProps {
  textStream: string;
  isStreaming?: boolean;
  className?: string;
  onComplete?: (fullText: string) => void;
}

export function ResponseStream({
  textStream,
  isStreaming,
  className,
  onComplete,
}: ResponseStreamProps) {
  const completeFiredRef = useRef(false);

  useEffect(() => {
    if (!isStreaming && !completeFiredRef.current && onComplete && textStream) {
      completeFiredRef.current = true;
      onComplete(textStream);
    }
  }, [isStreaming, textStream, onComplete]);

  if (!textStream && isStreaming) return null;

  return (
    <div className={cn(PROSE_CLASSES, className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {textStream}
      </ReactMarkdown>
      {isStreaming && (
        <span className="inline-block w-0.5 h-4 bg-foreground/60 ml-0.5 align-middle animate-pulse" />
      )}
    </div>
  );
}
