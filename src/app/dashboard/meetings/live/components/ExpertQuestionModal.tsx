"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Brain, X, Send } from "lucide-react";

interface ExpertQuestionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expertName: string;
  onSubmit: (question?: string) => void;
  isLoading: boolean;
}

export function ExpertQuestionModal({
  open,
  onOpenChange,
  expertName,
  onSubmit,
  isLoading,
}: ExpertQuestionModalProps) {
  const [question, setQuestion] = useState("");

  function handleSubmit() {
    onSubmit(question.trim() || undefined);
    setQuestion("");
  }

  function handleCancel() {
    setQuestion("");
    onOpenChange(false);
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-card border border-border rounded-2xl shadow-xl p-6 focus:outline-none">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-violet-400" />
              <Dialog.Title className="text-base font-semibold text-foreground">
                {expertName}
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
            Posez une question précise ou demandez un avis général sur la discussion en cours.
          </p>

          <div className="mb-5">
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Votre question <span className="font-normal opacity-70">(optionnel)</span>
            </label>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value.slice(0, 500))}
              placeholder="Ex : Que pense-t-il de la stratégie d'acquisition évoquée ? Quels risques voit-il ? Laisser vide pour un avis général."
              className="w-full h-24 bg-background border border-border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:ring-1 focus:ring-primary/50"
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground/60 mt-1 text-right">{question.length}/500</p>
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
                  <Send className="w-3.5 h-3.5" />
                  {question.trim() ? "Envoyer la question" : "Avis général"}
                </>
              )}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
