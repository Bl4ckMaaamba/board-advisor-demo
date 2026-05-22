"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, X, Trash2, Loader2, AlertTriangle, Calendar, FileType } from "lucide-react";
import { useEffect, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";

interface DocumentMeta {
  id: string;
  name: string;
  type: string;
  size: number;
  created_at: string;
  status?: string;
}

interface ContentSection {
  title: string | null;
  content: string;
}

interface DocumentPreviewModalProps {
  documentId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onDeleted?: (documentId: string) => void;
  canDelete?: boolean;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// Strip "[Section: XXX]" prefix that the chunker prepends to content
function cleanSectionPrefix(content: string): string {
  return content.replace(/^\[Section\s*:\s*[^\]]+\]\s*\n?/i, "");
}

export function DocumentPreviewModal({
  documentId,
  isOpen,
  onClose,
  onDeleted,
  canDelete = true,
}: DocumentPreviewModalProps) {
  const [doc, setDoc] = useState<DocumentMeta | null>(null);
  const [sections, setSections] = useState<ContentSection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadContent = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    setSections([]);
    setDoc(null);
    try {
      const res = await fetch(`/api/documents/${id}/content`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Erreur lors du chargement");
      }
      const data = await res.json();
      setDoc(data.document);
      setSections(data.sections || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && documentId) {
      loadContent(documentId);
      setShowConfirmDelete(false);
    } else {
      setDoc(null);
      setSections([]);
      setError(null);
    }
  }, [isOpen, documentId, loadContent]);

  const handleDelete = async () => {
    if (!documentId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/documents/${documentId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Erreur lors de la suppression");
      }
      onDeleted?.(documentId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
      setShowConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  };

  const fullText = sections.map((s) => cleanSectionPrefix(s.content)).join("\n\n");
  const isMarkdown = doc?.type?.toUpperCase() === "MD" || doc?.type?.toUpperCase() === "TXT";

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <AnimatePresence>
        {isOpen && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
              />
            </Dialog.Overlay>

            <Dialog.Content
              onOpenAutoFocus={(e) => e.preventDefault()}
              className="fixed inset-0 z-[101] flex items-center justify-center p-4 sm:p-6 pointer-events-none focus:outline-none"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 8 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="pointer-events-auto w-full max-w-3xl max-h-[88vh] flex flex-col rounded-2xl border border-border bg-card shadow-2xl overflow-hidden"
              >
                <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-border shrink-0">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-5 h-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <Dialog.Title className="font-playfair text-lg text-foreground truncate">
                        {doc?.name || (loading ? "Chargement..." : "Document")}
                      </Dialog.Title>
                      {doc && (
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <FileType className="w-3 h-3" />
                            {doc.type.toUpperCase()}
                          </span>
                          <span>{formatSize(doc.size)}</span>
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {formatDate(doc.created_at)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  <Dialog.Close asChild>
                    <button
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors flex-shrink-0"
                      aria-label="Fermer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </Dialog.Close>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-5 font-dm-sans min-h-0">
                  {loading && (
                    <div className="flex items-center justify-center py-16">
                      <Loader2 className="w-6 h-6 text-primary animate-spin" />
                    </div>
                  )}

                  {!loading && error && (
                    <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
                      <AlertTriangle className="w-8 h-8 text-red-500" />
                      <p className="text-sm text-foreground">{error}</p>
                    </div>
                  )}

                  {!loading && !error && sections.length === 0 && doc && (
                    <p className="text-sm text-muted-foreground text-center py-12">
                      Aucun contenu textuel disponible pour ce document.
                    </p>
                  )}

                  {!loading && !error && sections.length > 0 && (
                    <div className="space-y-4">
                      <p className="text-xs text-muted-foreground italic border-l-2 border-border pl-3">
                        Aperçu du contenu textuel extrait du document. La mise en page originale n&apos;est pas conservée.
                      </p>
                      {isMarkdown ? (
                        <div className="prose prose-sm max-w-none text-foreground/90 [&_h1]:font-playfair [&_h1]:text-xl [&_h1]:mt-4 [&_h1]:mb-2 [&_h2]:font-playfair [&_h2]:text-lg [&_h2]:mt-4 [&_h2]:mb-2 [&_h3]:font-playfair [&_h3]:text-base [&_h3]:mt-3 [&_h3]:mb-1.5 [&_p]:text-sm [&_p]:leading-relaxed [&_p]:my-2 [&_ul]:my-2 [&_ul]:pl-5 [&_ul]:list-disc [&_ol]:my-2 [&_ol]:pl-5 [&_ol]:list-decimal [&_li]:text-sm [&_li]:my-0.5 [&_strong]:font-semibold [&_strong]:text-foreground [&_em]:italic [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:bg-secondary/60 [&_code]:text-xs [&_hr]:my-4 [&_hr]:border-border [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-muted-foreground [&_a]:text-primary [&_a]:underline">
                          <ReactMarkdown>{fullText}</ReactMarkdown>
                        </div>
                      ) : (
                        <div className="space-y-5">
                          {sections.map((section, i) => {
                            const cleaned = cleanSectionPrefix(section.content);
                            return (
                              <div key={i}>
                                {section.title && (
                                  <h3 className="font-playfair text-base text-foreground mb-2">
                                    {section.title}
                                  </h3>
                                )}
                                <div className="text-sm text-foreground/85 leading-relaxed whitespace-pre-wrap">
                                  {cleaned}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {doc && canDelete && !showConfirmDelete && (
                  <div className="px-6 py-3 border-t border-border flex justify-end shrink-0">
                    <button
                      onClick={() => setShowConfirmDelete(true)}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-red-500 hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      Supprimer le document
                    </button>
                  </div>
                )}

                {showConfirmDelete && (
                  <div className="border-t border-red-500/30 bg-red-500/5 shrink-0">
                    <div className="px-6 py-4 flex items-center justify-between gap-4">
                      <div className="flex items-start gap-3 min-w-0">
                        <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">Supprimer ce document ?</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Cette action est irréversible. Le document et son indexation seront supprimés définitivement.
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => setShowConfirmDelete(false)}
                          disabled={deleting}
                          className="px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors disabled:opacity-50"
                        >
                          Annuler
                        </button>
                        <button
                          onClick={handleDelete}
                          disabled={deleting}
                          className={cn(
                            "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-50"
                          )}
                        >
                          {deleting ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                          {deleting ? "Suppression..." : "Confirmer"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
