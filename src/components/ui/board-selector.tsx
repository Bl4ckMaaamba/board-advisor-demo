"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Building2, ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBoardContext } from "@/lib/board-context";

const roleColors: Record<string, string> = {
  owner: "bg-primary/10 text-primary",
  admin: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  member: "bg-secondary text-muted-foreground",
};

const roleLabels: Record<string, string> = {
  owner: "Proprietaire",
  admin: "Admin",
  member: "Membre",
};

export function BoardSelector() {
  const { selectedBoard, setSelectedBoard, boards, isFiltered, selectedBoardData } = useBoardContext();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "h-10 rounded-lg px-3 text-sm font-medium border flex items-center gap-2 transition-colors",
          isFiltered
            ? "border-primary/30 bg-primary/5 text-primary hover:bg-primary/10"
            : "border-border bg-background/50 text-muted-foreground hover:text-foreground hover:bg-secondary/60"
        )}
      >
        <Building2 className="w-3.5 h-3.5" />
        <span className="max-w-[120px] truncate">
          {isFiltered && selectedBoardData ? selectedBoardData.name : "Tous les boards"}
        </span>
        <ChevronDown className={cn("w-3 h-3 transition-transform", open && "rotate-180")} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute top-full right-0 mt-2 w-64 rounded-xl border border-border bg-card/95 backdrop-blur-xl p-2 shadow-xl shadow-black/10 dark:shadow-black/30 z-50"
          >
            {/* Tous */}
            <button
              onClick={() => { setSelectedBoard("Tous"); setOpen(false); }}
              className={cn(
                "w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-colors",
                !isFiltered ? "bg-secondary/60 text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary/40"
              )}
            >
              <span className="font-medium">Tous les boards</span>
              {!isFiltered && <Check className="w-3.5 h-3.5 text-primary" />}
            </button>

            <div className="my-1.5 h-px bg-border" />

            {/* Board list */}
            {boards.map((board) => {
              const isActive = selectedBoard === board.id;
              const roleLabel = roleLabels[board.role] || board.role;
              const roleColor = roleColors[board.role] || "bg-secondary text-muted-foreground";
              return (
                <button
                  key={board.id}
                  onClick={() => { setSelectedBoard(board.id); setOpen(false); }}
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-colors",
                    isActive ? "bg-secondary/60 text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary/40"
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium truncate">{board.name}</span>
                    <span className={cn("text-xs px-1.5 py-0.5 rounded-full font-medium flex-shrink-0", roleColor)}>
                      {roleLabel}
                    </span>
                  </div>
                  {isActive && <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
                </button>
              );
            })}

            {boards.length === 0 && (
              <p className="px-3 py-2 text-xs text-muted-foreground">Aucun board</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
