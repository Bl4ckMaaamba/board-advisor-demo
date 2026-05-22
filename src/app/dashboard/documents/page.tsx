"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useBoardContext, matchesBoard } from "@/lib/board-context";
import { supabase } from "@/lib/supabase";
import {
  FileText,
  Eye,
  Search,
  Upload,
  File,
  Table,
  HardDrive,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Calendar,
} from "lucide-react";
import { DocumentPreviewModal } from "@/components/documents/DocumentPreviewModal";

interface Document {
  id: string;
  name: string;
  type: string;
  size: number;
  board_id: string | null;
  uploaded_by: string;
  meeting_id: string | null;
  created_at: string;
  status: "pending" | "indexed" | "error";
}

interface Meeting {
  id: string;
  title: string;
  board_id: string;
  status: string;
  created_at: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const typeConfig: Record<string, { color: string; bg: string; icon: typeof FileText }> = {
  PDF: { color: "text-red-500", bg: "bg-red-500/10", icon: FileText },
  DOCX: { color: "text-blue-500", bg: "bg-blue-500/10", icon: File },
  XLSX: { color: "text-emerald-500", bg: "bg-emerald-500/10", icon: Table },
  TXT: { color: "text-gray-500", bg: "bg-gray-500/10", icon: FileText },
  MD: { color: "text-gray-500", bg: "bg-gray-500/10", icon: FileText },
};

const typeFilters = ["Tous", "PDF", "DOCX", "XLSX"];

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
} as const;

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" as const } },
};

export default function DocumentsPage() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("Tous");
  const [boardFilter, setBoardFilter] = useState("Tous");
  const [documents, setDocuments] = useState<Document[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string>("");
  const [meetingFilter, setMeetingFilter] = useState<string>("Tous");
  const [showMeetingPicker, setShowMeetingPicker] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewDocId, setPreviewDocId] = useState<string | null>(null);
  const { selectedBoard, isFiltered: globalFiltered, boards } = useBoardContext();

  const fetchDocuments = useCallback(async () => {
    const { data } = await supabase
      .from("documents")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setDocuments(data);
  }, []);

  // Fetch meetings (for name display and filtering)
  const fetchMeetings = useCallback(async () => {
    const boardFilter = selectedBoard && selectedBoard !== "Tous" ? `?board_id=${selectedBoard}` : "";
    const res = await fetch(`/api/meetings${boardFilter}`);
    if (res.ok) {
      const data = await res.json();
      setMeetings(data.meetings || []);
    }
  }, [selectedBoard]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  useEffect(() => {
    fetchMeetings();
    setSelectedMeetingId("");
    setMeetingFilter("Tous");
  }, [fetchMeetings]);

  // Polling: refresh every 3s while there are pending documents
  useEffect(() => {
    const hasPending = documents.some((d) => d.status === "pending");
    if (!hasPending) return;
    const interval = setInterval(fetchDocuments, 3000);
    return () => clearInterval(interval);
  }, [documents, fetchDocuments]);

  const handleUploadClick = () => {
    if (!selectedBoard || selectedBoard === "Tous") return;
    if (meetings.length === 0) {
      alert("Aucune reunion dans ce board. Creez d'abord une reunion avant d'importer des documents.");
      return;
    }
    setShowMeetingPicker(true);
  };

  const handleConfirmUpload = () => {
    if (!selectedMeetingId) return;
    setShowMeetingPicker(false);
    fileInputRef.current?.click();
  };

  const handleUpload = async (files: { name: string; data: ArrayBuffer; mimeType: string }[]) => {
    setUploading(true);
    setUploadStatus(null);

    const board = selectedBoard;
    if (!board || board === "Tous" || !selectedMeetingId) {
      setUploading(false);
      return;
    }
    let successCount = 0;
    let errorCount = 0;

    for (const { name, data, mimeType } of files) {
      const formData = new FormData();
      formData.append("file", new Blob([data], { type: mimeType }), name);
      formData.append("board_id", board);
      formData.append("meetingId", selectedMeetingId);
      formData.append("uploadedBy", "Utilisateur");

      try {
        const res = await fetch("/api/rag/process", { method: "POST", body: formData });
        if (res.ok) {
          successCount++;
        } else {
          const err = await res.json();
          console.error(`Erreur upload ${name}:`, err.error);
          errorCount++;
        }
      } catch {
        errorCount++;
      }
    }

    await fetchDocuments();
    setUploading(false);

    if (errorCount === 0) {
      setUploadStatus({ type: "success", message: `${successCount} document(s) importe(s), indexation en cours...` });
    } else {
      setUploadStatus({ type: "error", message: `${successCount} reussi(s), ${errorCount} echoue(s)` });
    }
    setTimeout(() => setUploadStatus(null), 5000);
  };

  const baseDocuments = documents.filter((d) => matchesBoard(d.board_id, selectedBoard));
  const boardIds = ["Tous", ...Array.from(new Set(documents.map((d) => d.board_id).filter(Boolean) as string[]))];

  // Build a meeting name map for display
  const meetingNameMap: Record<string, string> = {};
  for (const m of meetings) {
    meetingNameMap[m.id] = m.title;
  }

  const filtered = baseDocuments.filter((d) => {
    const matchesSearch = d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.uploaded_by.toLowerCase().includes(search.toLowerCase());
    const matchesType = typeFilter === "Tous" || d.type === typeFilter;
    const matchesLocalBoard = !globalFiltered && (boardFilter === "Tous" || d.board_id === boardFilter);
    const matchesMeeting = meetingFilter === "Tous" || d.meeting_id === meetingFilter;
    return matchesSearch && matchesType && (globalFiltered || matchesLocalBoard) && matchesMeeting;
  });

  const pdfCount = baseDocuments.filter((d) => d.type === "PDF").length;
  const docxCount = baseDocuments.filter((d) => d.type === "DOCX").length;
  const xlsxCount = baseDocuments.filter((d) => d.type === "XLSX").length;

  const canUpload = selectedBoard && selectedBoard !== "Tous";

  return (
    <motion.div variants={stagger} initial="hidden" animate="show">
      {/* Header */}
      <motion.div variants={fadeUp} className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl font-semibold text-foreground tracking-tight">
            Documents
          </h1>
          <p className="text-muted-foreground mt-1">
            Tous les documents de vos conseils d&apos;administration.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {uploadStatus && (
            <motion.div
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              className={cn(
                "flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg",
                uploadStatus.type === "success" ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-500"
              )}
            >
              {uploadStatus.type === "success" ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
              {uploadStatus.message}
            </motion.div>
          )}
          <button
            onClick={handleUploadClick}
            disabled={uploading || !canUpload}
            title={!canUpload ? "Selectionnez un board d'abord" : undefined}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? "Import en cours..." : !canUpload ? "Choisir un board" : "Importer un document"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.xlsx,.xls,.txt,.md"
            className="hidden"
            onChange={(e) => {
              const fileList = e.target.files;
              if (!fileList?.length) return;
              const fileArray = Array.from(fileList);
              e.target.value = "";
              setUploading(true);
              Promise.all(
                fileArray.map(async (file) => ({
                  name: file.name,
                  data: await new Response(file).arrayBuffer(),
                  mimeType: file.type || "application/octet-stream",
                }))
              )
                .then((files) => handleUpload(files))
                .catch((err) => {
                  console.error("Erreur lecture fichier:", err);
                  setUploading(false);
                  setUploadStatus({ type: "error", message: "Impossible de lire le fichier." });
                  setTimeout(() => setUploadStatus(null), 5000);
                });
            }}
          />
        </div>
      </motion.div>

      {/* Meeting picker modal */}
      <AnimatePresence>
        {showMeetingPicker && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={() => setShowMeetingPicker(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="bg-card border border-border rounded-2xl shadow-xl p-6 w-full max-w-md mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-base font-semibold text-foreground mb-1">
                Choisir une reunion
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                Selectionnez la reunion a laquelle associer les documents.
              </p>

              <div className="space-y-2 max-h-64 overflow-y-auto mb-4">
                {meetings.map((meeting) => (
                  <button
                    key={meeting.id}
                    onClick={() => setSelectedMeetingId(meeting.id)}
                    className={cn(
                      "w-full flex items-center gap-3 p-3 rounded-xl border transition-colors text-left",
                      selectedMeetingId === meeting.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-secondary/30"
                    )}
                  >
                    <div className={cn(
                      "w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0",
                      selectedMeetingId === meeting.id ? "bg-primary/10" : "bg-secondary"
                    )}>
                      <Calendar className={cn(
                        "w-4 h-4",
                        selectedMeetingId === meeting.id ? "text-primary" : "text-muted-foreground"
                      )} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{meeting.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(meeting.created_at)}
                      </p>
                    </div>
                    {selectedMeetingId === meeting.id && (
                      <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => setShowMeetingPicker(false)}
                  className="px-4 py-2 text-sm font-medium rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={handleConfirmUpload}
                  disabled={!selectedMeetingId}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Choisir les fichiers
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stats */}
      <motion.div variants={fadeUp} className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Total", value: baseDocuments.length, icon: HardDrive },
          { label: "PDF", value: pdfCount, icon: FileText },
          { label: "DOCX", value: docxCount, icon: File },
          { label: "XLSX", value: xlsxCount, icon: Table },
        ].map((stat) => (
          <div
            key={stat.label}
            className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card/60"
          >
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <stat.icon className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-lg font-semibold text-foreground">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </div>
          </div>
        ))}
      </motion.div>

      {/* Filters */}
      <motion.div variants={fadeUp} className="flex flex-col sm:flex-row gap-3 mb-6">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher un document..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Type filter */}
        <div className="flex gap-1">
          {typeFilters.map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                typeFilter === t
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary/60 text-muted-foreground hover:text-foreground hover:bg-secondary"
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Meeting filter */}
        {meetings.length > 0 && (
          <select
            value={meetingFilter}
            onChange={(e) => setMeetingFilter(e.target.value)}
            className="h-9 rounded-lg border border-border bg-background/80 px-3 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/40 transition-colors"
          >
            <option value="Tous">Toutes les reunions</option>
            {meetings.map((m) => (
              <option key={m.id} value={m.id}>{m.title}</option>
            ))}
          </select>
        )}

        {/* Board filter — hidden when global filter is active */}
        {!globalFiltered && (
          <select
            value={boardFilter}
            onChange={(e) => setBoardFilter(e.target.value)}
            className="h-9 rounded-lg border border-border bg-background/80 px-3 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/40 transition-colors"
          >
            {boardIds.map((b) => (
              <option key={b} value={b}>
                {b === "Tous" ? "Tous les boards" : boards.find((board) => board.id === b)?.name ?? b}
              </option>
            ))}
          </select>
        )}
      </motion.div>

      {/* Document list — flat with meeting info */}
      <motion.div variants={fadeUp}>
        <SpotlightCard className="rounded-2xl border border-border bg-card">
          <div className="p-2">
            {filtered.length === 0 ? (
              <div className="py-12 text-center">
                <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-3 opacity-40" />
                <p className="text-sm text-muted-foreground">
                  Aucun document trouve.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filtered.map((doc) => {
                  const config = typeConfig[doc.type] ?? typeConfig.PDF;
                  const Icon = config.icon;
                  const meetingName = doc.meeting_id ? meetingNameMap[doc.meeting_id] : null;
                  const isClickable = doc.status === "indexed";
                  return (
                    <div
                      key={doc.id}
                      onClick={() => isClickable && setPreviewDocId(doc.id)}
                      className={cn(
                        "flex items-center gap-4 px-4 py-3.5 rounded-xl transition-colors",
                        isClickable ? "hover:bg-secondary/20 cursor-pointer" : "opacity-70"
                      )}
                    >
                      <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0", config.bg)}>
                        <Icon className={cn("w-4 h-4", config.color)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-foreground truncate">{doc.name}</p>
                          {doc.status === "pending" && (
                            <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-amber-500/10 text-amber-600 whitespace-nowrap">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Indexation...
                            </span>
                          )}
                          {doc.status === "error" && (
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-500/10 text-red-500 whitespace-nowrap">
                              Erreur
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className={cn("text-xs px-1.5 py-0.5 rounded font-medium", config.bg, config.color)}>
                            {doc.type}
                          </span>
                          <span className="text-xs text-muted-foreground">{formatSize(doc.size)}</span>
                          {meetingName && (
                            <>
                              <span className="w-px h-3 bg-border" />
                              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Calendar className="w-3 h-3" />
                                {meetingName}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs text-muted-foreground">{formatDate(doc.created_at)}</span>
                        {isClickable && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setPreviewDocId(doc.id); }}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                            aria-label={`Voir ${doc.name}`}
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </SpotlightCard>
      </motion.div>

      <DocumentPreviewModal
        documentId={previewDocId}
        isOpen={previewDocId !== null}
        onClose={() => setPreviewDocId(null)}
        onDeleted={(id) => {
          setDocuments((prev) => prev.filter((d) => d.id !== id));
          setPreviewDocId(null);
        }}
      />
    </motion.div>
  );
}
