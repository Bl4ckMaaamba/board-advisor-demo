"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, MessageSquare, ArrowRight } from "lucide-react";
import { DocumentPicker } from "@/components/chat/document-picker";

interface MeetingPrepModalProps {
  meetingId: string;
  meetingTitle: string;
  boardId: string;
  boardName?: string;
  isOpen: boolean;
  onClose: () => void;
}

export function MeetingPrepModal({
  meetingId,
  meetingTitle,
  boardId,
  isOpen,
  onClose,
}: MeetingPrepModalProps) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [allDocIds, setAllDocIds] = useState<string[]>([]);

  const handleConfirm = () => {
    const params = new URLSearchParams();
    params.set("meeting", meetingTitle);
    // If selectedIds is empty it means "all documents" — pass all IDs
    const idsToSend = selectedIds.length > 0 ? selectedIds : allDocIds;
    if (idsToSend.length > 0) {
      params.set("docs", idsToSend.join(","));
    }
    router.push(`/dashboard/chat?${params.toString()}`);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-md mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-6 pb-4">
              <div className="flex items-center gap-3 mb-1">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Calendar className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">
                    Préparer la réunion
                  </h3>
                  <p className="text-sm text-muted-foreground">{meetingTitle}</p>
                </div>
              </div>
            </div>

            {/* Document selection */}
            <div className="px-6 pb-4">
              <p className="text-sm text-muted-foreground mb-3">
                Sélectionnez les documents à utiliser avec le chatbot pour
                préparer cette réunion.
              </p>
              <DocumentPicker
                boardId={boardId}
                meetingId={meetingId}
                selectedIds={selectedIds}
                onSelectionChange={setSelectedIds}
                onDocumentsLoaded={setAllDocIds}
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 px-6 pb-6 pt-2">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleConfirm}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Préparer avec le chatbot
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
