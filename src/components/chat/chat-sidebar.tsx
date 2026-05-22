"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Plus, PanelLeftClose, PanelLeft, MessageSquare, Building2 } from "lucide-react";
import { useBoardContext } from "@/lib/board-context";

export interface Conversation {
  id: string;
  title: string;
  boardId?: string | null;
  lastMessage: string;
  date: Date;
}

interface ChatSidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onExpandedChange?: (expanded: boolean) => void;
}

function groupByDate(conversations: Conversation[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

  const groups: { label: string; items: Conversation[] }[] = [
    { label: "Aujourd'hui", items: [] },
    { label: "7 derniers jours", items: [] },
    { label: "Plus ancien", items: [] },
  ];

  for (const c of conversations) {
    const d = new Date(c.date);
    if (d >= today) groups[0].items.push(c);
    else if (d >= weekAgo) groups[1].items.push(c);
    else groups[2].items.push(c);
  }

  return groups.filter((g) => g.items.length > 0);
}

export function ChatSidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onExpandedChange,
}: ChatSidebarProps) {
  const [expanded, setExpanded] = useState(true);
  const { boards } = useBoardContext();
  const groups = groupByDate(conversations);

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    onExpandedChange?.(next);
  };

  return (
    <motion.aside
      animate={{ width: expanded ? 280 : 64 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="fixed left-0 top-0 bottom-0 z-[60] flex flex-col border-r border-border bg-card/98 backdrop-blur-xl"
    >
      {/* ── Spacer matching the fixed opaque navbar band (h-20 = 80px) ── */}
      <div className="h-20 flex-shrink-0" />

      {/* ── Sidebar header ──────────────────────────────────────────── */}
      <div className={cn("flex-shrink-0 px-3 pt-1 pb-3", !expanded && "px-2")}>
        {/* Label + collapse toggle */}
        <div className={cn(
          "flex items-center h-8 mb-2",
          expanded ? "justify-between" : "justify-center"
        )}>
          <AnimatePresence>
            {expanded && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60 select-none pl-1"
              >
                Conversations
              </motion.span>
            )}
          </AnimatePresence>

          <button
            onClick={toggle}
            className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground/60 hover:text-foreground hover:bg-secondary/60 transition-colors"
            aria-label={expanded ? "Réduire" : "Ouvrir"}
          >
            {expanded
              ? <PanelLeftClose className="w-3.5 h-3.5" />
              : <PanelLeft className="w-3.5 h-3.5" />
            }
          </button>
        </div>

        {/* New conversation button */}
        <button
          onClick={onNew}
          aria-label="Nouvelle conversation"
          className={cn(
            "flex items-center gap-2 rounded-lg border border-border/70 bg-secondary/20 text-muted-foreground text-sm transition-all duration-150",
            "hover:bg-secondary/50 hover:text-foreground hover:border-border",
            expanded ? "w-full px-3 py-2" : "w-9 h-9 justify-center mx-auto"
          )}
        >
          <Plus className="w-3.5 h-3.5 flex-shrink-0" />
          <AnimatePresence>
            {expanded && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.1 }}
                className="truncate"
              >
                Nouvelle conversation
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>

      {/* ── Divider ──────────────────────────────────────────────────── */}
      <div className="mx-3 border-t border-border/50 flex-shrink-0" />

      {/* ── Conversation list ────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-2 px-2">
        {groups.map((group) => (
          <div key={group.label} className="mb-1">
            <AnimatePresence>
              {expanded && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="px-2 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/45 select-none"
                >
                  {group.label}
                </motion.p>
              )}
            </AnimatePresence>

            {group.items.map((conv) => {
              const isActive = activeId === conv.id;
              const boardName = conv.boardId
                ? (boards.find((b) => b.id === conv.boardId)?.name ?? null)
                : null;

              return (
                <button
                  key={conv.id}
                  onClick={() => onSelect(conv.id)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-2 py-2 text-left rounded-lg transition-all duration-150 mb-0.5",
                    isActive
                      ? "bg-secondary/65 shadow-sm"
                      : "hover:bg-secondary/35",
                    !expanded && "justify-center"
                  )}
                >
                  {/* Icon */}
                  <div className={cn(
                    "flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center transition-colors",
                    isActive ? "bg-primary/12 text-primary" : "text-muted-foreground/50"
                  )}>
                    <MessageSquare className="w-3.5 h-3.5" />
                  </div>

                  {/* Text */}
                  <AnimatePresence>
                    {expanded && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.12 }}
                        className="min-w-0 flex-1 flex flex-col"
                      >
                        <span className={cn(
                          "text-sm truncate leading-snug",
                          isActive ? "text-foreground font-medium" : "text-foreground/70"
                        )}>
                          {conv.title}
                        </span>
                        {boardName && (
                          <span className="flex items-center gap-1 mt-0.5 text-[11px] text-muted-foreground/55 truncate">
                            <Building2 className="w-2.5 h-2.5 flex-shrink-0" />
                            {boardName}
                          </span>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </motion.aside>
  );
}
