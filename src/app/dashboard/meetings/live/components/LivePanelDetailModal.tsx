"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import type { ReactNode } from "react";

interface LivePanelDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  icon?: ReactNode;
  accentColor?: string;
  children: ReactNode;
}

/**
 * Modal de détail pour afficher un item d'un panel live en grand.
 * Utilisé pour fact-check, modération, suggestion, expert, angle mort
 * quand l'utilisateur clique pour lire en détail.
 */
export function LivePanelDetailModal({
  isOpen,
  onClose,
  title,
  icon,
  accentColor,
  children,
}: LivePanelDetailModalProps) {
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
                className="pointer-events-auto w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl border border-border bg-card shadow-2xl overflow-hidden"
                style={accentColor ? { borderTop: `3px solid ${accentColor}` } : {}}
              >
                <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-border">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {icon && <div className="flex-shrink-0">{icon}</div>}
                    <Dialog.Title className="font-playfair text-lg text-foreground truncate">
                      {title}
                    </Dialog.Title>
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

                <div className="flex-1 overflow-y-auto px-6 py-5 font-dm-sans">
                  {children}
                </div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
