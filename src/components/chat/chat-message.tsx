"use client";

import { motion } from "framer-motion";
import { ChevronDown, ChevronRight, ExternalLink, FileText, Clock, Sparkles, Presentation, Download } from "lucide-react";
import { useState } from "react";
import { TOOL_LABELS } from "@/lib/agent/tools/labels";
import { ResponseStream } from "./response-stream";

export interface SourceRef {
  name: string;
  type: "internal" | "external";
  provider?: string;
  url?: string;
  confidence?: number;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  sources?: SourceRef[];
  toolsUsed?: string[];
  latencyMs?: number;
  isStreaming?: boolean;
  imagePreview?: string;
  pptxDownload?: { title: string; filename: string; blobUrl: string };
}

interface ChatMessageProps {
  message: Message;
  index: number;
  onStreamComplete?: (fullText: string) => void;
  onSourceClick?: (source: SourceRef) => void;
}

function SourcesPanel({ sources, onSourceClick }: { sources: SourceRef[]; onSourceClick?: (source: SourceRef) => void }) {
  const [isOpen, setIsOpen] = useState(false);

  if (sources.length === 0) return null;

  const uniqueSources = sources.filter(
    (s, i, arr) => arr.findIndex((x) => x.name === s.name && x.type === s.type) === i
  );

  return (
    <div className="mt-5 pt-4 border-t border-border/40">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        <span className="font-medium">{uniqueSources.length} source{uniqueSources.length > 1 ? "s" : ""} consultée{uniqueSources.length > 1 ? "s" : ""}</span>
      </button>

      {isOpen && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="mt-3 grid gap-2 sm:grid-cols-2"
        >
          {uniqueSources.map((source, i) => {
            const isClickable = source.type === "internal" && !!onSourceClick;
            const content = (
              <>
                {source.type === "internal" ? (
                  <FileText className="w-4 h-4 text-primary flex-shrink-0" />
                ) : (
                  <ExternalLink className="w-4 h-4 text-blue-400 flex-shrink-0" />
                )}
                <span className="truncate text-foreground/80">{source.name}</span>
                {source.confidence != null && (
                  <span className="ml-auto text-xs text-muted-foreground flex-shrink-0 font-medium">
                    {Math.round(source.confidence * 100)}%
                  </span>
                )}
              </>
            );
            return isClickable ? (
              <button
                key={i}
                onClick={() => onSourceClick?.(source)}
                className="flex items-center gap-2.5 text-sm px-3 py-2.5 rounded-lg bg-secondary/30 border border-border/30 hover:bg-secondary/50 hover:border-border transition-colors text-left w-full"
              >
                {content}
              </button>
            ) : (
              <div
                key={i}
                className="flex items-center gap-2.5 text-sm px-3 py-2.5 rounded-lg bg-secondary/30 border border-border/30"
              >
                {content}
              </div>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}

function PptxDownloadCard({ title, filename, blobUrl }: { title: string; filename: string; blobUrl: string }) {
  const handleDownload = () => {
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="mt-4 flex items-center gap-4 px-4 py-3.5 rounded-xl border border-primary/25 bg-primary/5 hover:bg-primary/8 transition-colors">
      <div className="w-10 h-10 rounded-lg bg-primary/12 border border-primary/20 flex items-center justify-center flex-shrink-0">
        <Presentation className="w-5 h-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate">{title}</p>
        <p className="text-xs text-muted-foreground truncate">{filename}</p>
      </div>
      <button
        onClick={handleDownload}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors flex-shrink-0"
      >
        <Download className="w-3.5 h-3.5" />
        Télécharger
      </button>
    </div>
  );
}

function ToolBadges({ tools }: { tools: string[] }) {
  if (tools.length === 0) return null;

  const uniqueTools = Array.from(new Set(tools));

  return (
    <div className="flex flex-wrap gap-1.5 mt-4">
      {uniqueTools.map((tool) => (
        <span
          key={tool}
          className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-primary/8 text-primary/80 border border-primary/10"
        >
          {TOOL_LABELS[tool] ?? tool}
        </span>
      ))}
    </div>
  );
}

export function ChatMessage({ message, index, onStreamComplete, onSourceClick }: ChatMessageProps) {
  const isUser = message.role === "user";
  const isStreaming = !!message.isStreaming;

  if (isUser) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: index * 0.03 }}
        className="py-6"
      >
        <div className="max-w-3xl mx-auto space-y-2">
          {message.imagePreview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={message.imagePreview}
              alt="Image jointe"
              className="max-h-48 rounded-xl border border-border object-contain"
            />
          )}
          {message.content && message.content !== "📎 Image jointe" && (
            <p className="text-lg text-foreground whitespace-pre-wrap leading-relaxed">
              {message.content}
            </p>
          )}
          {message.content === "📎 Image jointe" && !message.imagePreview && (
            <p className="text-lg text-foreground whitespace-pre-wrap leading-relaxed">
              {message.content}
            </p>
          )}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.03 }}
      className="py-6 bg-secondary/15"
    >
      <div className="max-w-3xl mx-auto">
        {/* Assistant header */}
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
          </div>
          <span className="text-sm font-semibold text-foreground">Board Advisor</span>
          {!isStreaming && message.latencyMs != null && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground ml-auto">
              <Clock className="w-3 h-3" />
              {(message.latencyMs / 1000).toFixed(1)}s
            </span>
          )}
        </div>

        {/* Response content */}
        {message.content && (
          <ResponseStream
            textStream={message.content}
            isStreaming={isStreaming}
            onComplete={onStreamComplete}
          />
        )}

        {/* PPTX download card */}
        {!isStreaming && message.pptxDownload && (
          <PptxDownloadCard
            title={message.pptxDownload.title}
            filename={message.pptxDownload.filename}
            blobUrl={message.pptxDownload.blobUrl}
          />
        )}

        {/* Sources */}
        {!isStreaming && message.sources && message.sources.length > 0 && (
          <SourcesPanel sources={message.sources} onSourceClick={onSourceClick} />
        )}

        {/* Tool badges */}
        {!isStreaming && message.toolsUsed && message.toolsUsed.length > 0 && (
          <ToolBadges tools={message.toolsUsed} />
        )}
      </div>
    </motion.div>
  );
}
