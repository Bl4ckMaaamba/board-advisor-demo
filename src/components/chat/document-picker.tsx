"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  FileText,
  Check,
  ChevronDown,
  ChevronUp,
  Search,
  Filter,
  File,
  Table,
  Calendar,
  SortAsc,
  SortDesc,
} from "lucide-react";

interface DocumentInfo {
  id: string;
  name: string;
  type: string;
  size: number;
  created_at: string;
}

interface DocumentPickerProps {
  boardId?: string;
  meetingId?: string;
  /** @deprecated Use boardId instead */
  boardName?: string;
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  /** Called when documents are loaded, exposes the full list of document IDs */
  onDocumentsLoaded?: (ids: string[]) => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  });
}

/** Clean up a file name for display: remove extension and replace separators */
function displayName(raw: string): string {
  const noExt = raw.replace(/\.[^.]+$/, "");
  return noExt.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

const typeIcons: Record<string, typeof FileText> = {
  PDF: FileText,
  DOCX: File,
  DOC: File,
  XLSX: Table,
  XLS: Table,
  TXT: FileText,
  MD: FileText,
};

const typeColors: Record<string, string> = {
  PDF: "text-red-400",
  DOCX: "text-blue-400",
  DOC: "text-blue-400",
  XLSX: "text-emerald-400",
  XLS: "text-emerald-400",
};

type SortMode = "date-desc" | "date-asc" | "name-asc" | "name-desc";

/** Group docs by time period */
function getDateGroup(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  if (diffDays < 1) return "Aujourd'hui";
  if (diffDays < 7) return "Cette semaine";
  if (diffDays < 30) return "Ce mois";
  if (diffDays < 90) return "3 derniers mois";
  return "Plus ancien";
}

const DATE_GROUP_ORDER = ["Aujourd'hui", "Cette semaine", "Ce mois", "3 derniers mois", "Plus ancien"];

export function DocumentPicker({
  boardId,
  meetingId,
  boardName,
  selectedIds,
  onSelectionChange,
  onDocumentsLoaded,
}: DocumentPickerProps) {
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("Tous");
  const [sortMode, setSortMode] = useState<SortMode>("date-desc");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Fetch documents — filter by meeting_id when available, else by board_id
  useEffect(() => {
    if (!boardId && !boardName) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (meetingId) {
      params.set("meeting_id", meetingId);
    } else if (boardId) {
      params.set("board_id", boardId);
    }
    fetch(`/api/documents?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        const docs = data.documents ?? [];
        setDocuments(docs);
        onDocumentsLoaded?.(docs.map((d: DocumentInfo) => d.id));
      })
      .catch(() => setDocuments([]))
      .finally(() => setLoading(false));
  }, [boardId, boardName, meetingId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  // Focus search when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => searchRef.current?.focus(), 60);
    } else {
      setSearch("");
    }
  }, [isOpen]);

  // Available type filters
  const availableTypes = useMemo(() => {
    const types = new Set(documents.map((d) => d.type.toUpperCase()));
    return ["Tous", ...Array.from(types).sort()];
  }, [documents]);

  // Filter, search, sort
  const processed = useMemo(() => {
    let result = [...documents];

    // Type filter
    if (typeFilter !== "Tous") {
      result = result.filter((d) => d.type.toUpperCase() === typeFilter);
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          displayName(d.name).toLowerCase().includes(q)
      );
    }

    // Sort
    result.sort((a, b) => {
      switch (sortMode) {
        case "date-desc":
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case "date-asc":
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case "name-asc":
          return displayName(a.name).localeCompare(displayName(b.name), "fr");
        case "name-desc":
          return displayName(b.name).localeCompare(displayName(a.name), "fr");
      }
    });

    return result;
  }, [documents, typeFilter, search, sortMode]);

  // Group by date when sorted by date and no search
  const grouped = useMemo(() => {
    if (search.trim() || sortMode.startsWith("name")) return null;
    const groups: { label: string; docs: DocumentInfo[] }[] = [];
    const map = new Map<string, DocumentInfo[]>();
    for (const doc of processed) {
      const group = getDateGroup(doc.created_at);
      if (!map.has(group)) map.set(group, []);
      map.get(group)!.push(doc);
    }
    for (const label of DATE_GROUP_ORDER) {
      const docs = map.get(label);
      if (docs && docs.length > 0) groups.push({ label, docs });
    }
    return groups;
  }, [processed, search, sortMode]);

  const allSelected = selectedIds.length === 0;
  const selectedCount = selectedIds.length;

  const toggleDoc = (id: string) => {
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter((d) => d !== id));
    } else {
      onSelectionChange([...selectedIds, id]);
    }
  };

  const selectAll = () => onSelectionChange([]);

  const cycleSortMode = () => {
    const modes: SortMode[] = ["date-desc", "date-asc", "name-asc", "name-desc"];
    const idx = modes.indexOf(sortMode);
    setSortMode(modes[(idx + 1) % modes.length]);
  };

  const sortLabel: Record<SortMode, string> = {
    "date-desc": "Plus récents",
    "date-asc": "Plus anciens",
    "name-asc": "A → Z",
    "name-desc": "Z → A",
  };

  if (documents.length === 0 && !loading) return null;

  const renderDocRow = (doc: DocumentInfo) => {
    const isSelected = selectedIds.includes(doc.id);
    const Icon = typeIcons[doc.type.toUpperCase()] ?? FileText;
    const color = typeColors[doc.type.toUpperCase()] ?? "text-muted-foreground";
    return (
      <button
        key={doc.id}
        onClick={() => toggleDoc(doc.id)}
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-secondary/30",
          isSelected && !allSelected && "bg-primary/5"
        )}
      >
        <div
          className={cn(
            "w-4 h-4 rounded border flex items-center justify-center flex-shrink-0",
            isSelected && !allSelected
              ? "bg-primary border-primary"
              : "border-border"
          )}
        >
          {isSelected && !allSelected && (
            <Check className="w-3 h-3 text-primary-foreground" />
          )}
        </div>
        <Icon className={cn("w-4 h-4 flex-shrink-0", color)} />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground truncate" title={doc.name}>
            {displayName(doc.name)}
          </p>
          <p className="text-xs text-muted-foreground">
            {doc.type.toUpperCase()} &middot; {formatSize(doc.size)} &middot; {formatDate(doc.created_at)}
          </p>
        </div>
      </button>
    );
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
          allSelected
            ? "text-muted-foreground hover:text-foreground hover:bg-secondary/40"
            : "text-primary bg-primary/8 border border-primary/15"
        )}
      >
        <Filter className="w-3.5 h-3.5" />
        {allSelected
          ? `${documents.length} documents`
          : `${selectedCount} doc${selectedCount > 1 ? "s" : ""} sélectionné${selectedCount > 1 ? "s" : ""}`}
        {isOpen ? (
          <ChevronUp className="w-3 h-3" />
        ) : (
          <ChevronDown className="w-3 h-3" />
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full left-0 mb-2 w-[26rem] rounded-xl border border-border bg-card shadow-xl z-50 flex flex-col"
            style={{ maxHeight: "min(28rem, 55vh)" }}
          >
            {/* Header */}
            <div className="flex-shrink-0 border-b border-border px-3 py-2.5 flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">
                Documents accessibles
              </span>
              <div className="flex items-center gap-2">
                {!allSelected && (
                  <button
                    onClick={selectAll}
                    className="text-xs text-primary hover:underline"
                  >
                    Réinitialiser
                  </button>
                )}
                <span className="text-xs text-muted-foreground">
                  {documents.length} doc{documents.length > 1 ? "s" : ""}
                </span>
              </div>
            </div>

            {/* Search */}
            <div className="flex-shrink-0 px-3 pt-2 pb-1.5">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher un document..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-secondary/30 border border-border/50 rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring/40"
                />
              </div>
            </div>

            {/* Type filters + sort */}
            <div className="flex-shrink-0 px-3 pb-2 pt-1 flex items-center justify-between gap-2">
              <div className="flex gap-1 overflow-x-auto no-scrollbar">
                {availableTypes.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTypeFilter(t)}
                    className={cn(
                      "px-2 py-0.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap",
                      typeFilter === t
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary/40"
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <button
                onClick={cycleSortMode}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors whitespace-nowrap flex-shrink-0"
                title="Changer le tri"
              >
                {sortMode.startsWith("date") ? (
                  <Calendar className="w-3 h-3" />
                ) : sortMode === "name-asc" ? (
                  <SortAsc className="w-3 h-3" />
                ) : (
                  <SortDesc className="w-3 h-3" />
                )}
                {sortLabel[sortMode]}
              </button>
            </div>

            <div className="border-t border-border/50" />

            {/* Scrollable list */}
            <div className="overflow-y-auto flex-1 overscroll-contain">
              {/* All documents option — only when no search/type filter */}
              {!search.trim() && typeFilter === "Tous" && (
                <>
                  <button
                    onClick={selectAll}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-secondary/30",
                      allSelected && "bg-primary/5"
                    )}
                  >
                    <div
                      className={cn(
                        "w-4 h-4 rounded border flex items-center justify-center flex-shrink-0",
                        allSelected
                          ? "bg-primary border-primary"
                          : "border-border"
                      )}
                    >
                      {allSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                    </div>
                    <span className="text-sm text-foreground font-medium">Tous les documents</span>
                    <span className="ml-auto text-xs text-muted-foreground">{documents.length}</span>
                  </button>
                  <div className="border-t border-border/30" />
                </>
              )}

              {/* Document list */}
              {loading ? (
                <div className="px-3 py-8 text-xs text-muted-foreground text-center">
                  Chargement...
                </div>
              ) : processed.length === 0 ? (
                <div className="px-3 py-8 text-xs text-muted-foreground text-center">
                  Aucun document trouvé
                </div>
              ) : grouped ? (
                // Grouped by date
                grouped.map((group) => (
                  <div key={group.label}>
                    <div className="sticky top-0 bg-card/95 backdrop-blur-sm px-3 py-1.5 flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {group.label}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {group.docs.length}
                      </span>
                    </div>
                    {group.docs.map(renderDocRow)}
                  </div>
                ))
              ) : (
                // Flat list (search or name sort)
                processed.map(renderDocRow)
              )}
            </div>

            {/* Footer with selection summary */}
            {selectedCount > 0 && (
              <div className="flex-shrink-0 border-t border-border px-3 py-2 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {selectedCount} sélectionné{selectedCount > 1 ? "s" : ""}
                </span>
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-xs text-primary font-medium hover:underline"
                >
                  Fermer
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
