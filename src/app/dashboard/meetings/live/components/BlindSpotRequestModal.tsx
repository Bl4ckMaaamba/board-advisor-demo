"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Sparkles, X, Search } from "lucide-react";

interface BlindSpotRequestModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (query?: string) => void;
  isLoading: boolean;
}

export function BlindSpotRequestModal({
  open,
  onOpenChange,
  onSubmit,
  isLoading,
}: BlindSpotRequestModalProps) {
  const [query, setQuery] = useState("");

  function handleSubmit() {
    onSubmit(query.trim() || undefined);
    setQuery("");
  }

  function handleCancel() {
    setQuery("");
    onOpenChange(false);
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-card border border-border rounded-2xl shadow-xl p-6 focus:outline-none">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-pink-400" />
              <Dialog.Title className="text-base font-semibold text-foreground">
                Analyse d&apos;angles morts
              </Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button
                onClick={handleCancel}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </div>

          <p className="text-sm text-muted-foreground mb-4">
            Identifie ce qui n&apos;a pas été mentionné dans la discussion alors que ça devrait l&apos;être.
          </p>

          <div className="mb-5">
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Sur quel sujet ? <span className="font-normal opacity-70">(optionnel)</span>
            </label>
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ex : risques financiers, impact réglementaire CSRD, position concurrentielle… Laisser vide pour analyser la discussion en cours."
              className="w-full h-24 bg-background border border-border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:ring-1 focus:ring-primary/50"
              disabled={isLoading}
            />
          </div>

          <div className="flex gap-2 justify-end">
            <button
              onClick={handleCancel}
              disabled={isLoading}
              className="px-4 py-2 text-sm rounded-xl border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              onClick={handleSubmit}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2 text-sm rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Analyse en cours…
                </>
              ) : (
                <>
                  <Search className="w-3.5 h-3.5" />
                  Analyser
                </>
              )}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
