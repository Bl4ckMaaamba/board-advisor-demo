"use client";

import { useEffect, useReducer } from "react";
import type { Message, SourceRef } from "@/components/chat/chat-message";
import type { AgentStreamEvent } from "@/lib/agent/types";

export type { Message, SourceRef };

// ─── Module-level state (survives Next.js client-side navigation) ────────────

interface ChatStoreState {
  messagesByConv: Record<string, Message[]>;
  isLoading: boolean;
  isThinking: boolean;
  toolsInProgress: string[];
  convIdMap: Record<string, string>;
  activeId: string | null;
}

let _state: ChatStoreState = {
  messagesByConv: {},
  isLoading: false,
  isThinking: false,
  toolsInProgress: [],
  convIdMap: {},
  activeId: null,
};

// Manual stop flag — not a signal, just a boolean checked inside the loop
let _stopRequested = false;

const _listeners = new Set<() => void>();
function _notify() { _listeners.forEach((l) => l()); }

let _msgCounter = 0;
export function newMsgId() { return `msg-${Date.now()}-${++_msgCounter}`; }
const _newMsgId = newMsgId;

// ─── SSE parser — module-level, no React dependency ─────────────────────────

async function* _parseSSE(response: Response): AsyncGenerator<AgentStreamEvent> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (_stopRequested) { reader.cancel(); break; }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try { yield JSON.parse(line.slice(6)); } catch { /* skip */ }
      }
    }
  }
}

// ─── Store API ───────────────────────────────────────────────────────────────

export const chatStore = {
  getState: () => _state,

  setMessages(updater: (prev: Record<string, Message[]>) => Record<string, Message[]>) {
    _state = { ..._state, messagesByConv: updater(_state.messagesByConv) };
    _notify();
  },

  setLoading(v: boolean) { _state = { ..._state, isLoading: v }; _notify(); },
  setThinking(v: boolean) { _state = { ..._state, isThinking: v }; _notify(); },

  setToolsInProgress(v: string[] | ((prev: string[]) => string[])) {
    const next = typeof v === "function" ? v(_state.toolsInProgress) : v;
    _state = { ..._state, toolsInProgress: next };
    _notify();
  },

  setConvIdMap(updater: (prev: Record<string, string>) => Record<string, string>) {
    _state = { ..._state, convIdMap: updater(_state.convIdMap) };
    _notify();
  },

  setActiveId(id: string | null) { _state = { ..._state, activeId: id }; _notify(); },

  stopStream() {
    _stopRequested = true;
    _state = { ..._state, isLoading: false, isThinking: false, toolsInProgress: [] };
    _notify();
  },

  // ── Module-level stream runner — survives navigation ────────────────────────
  async runStream(params: {
    localId: string;
    serverConvId: string | undefined;
    endpoint: string;
    body: Record<string, unknown>;
    onConvUpdate: (localId: string, title: string) => void;
  }) {
    const { localId, serverConvId, endpoint, body, onConvUpdate } = params;

    _stopRequested = false;
    chatStore.setLoading(true);
    chatStore.setToolsInProgress([]);
    chatStore.setThinking(false);

    const assistantMsgId = _newMsgId();
    let streamingMsgAdded = false;
    let accumulatedText = "";
    let sources: SourceRef[] = [];
    let toolsUsed: string[] = [];
    let latencyMs: number | undefined;

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        // No signal — fetch lives at module level, not tied to any React component
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Erreur serveur" }));
        throw new Error(err.error || "Erreur API agent");
      }

      for await (const event of _parseSSE(res)) {
        if (_stopRequested) break;

        switch (event.type) {
          case "init":
            if (event.conversation_id && !serverConvId) {
              chatStore.setConvIdMap((prev) => ({
                ...prev,
                [localId]: event.conversation_id,
              }));
            }
            break;

          case "thinking_start":
            chatStore.setThinking(true);
            break;

          case "thinking_end":
            chatStore.setThinking(false);
            break;

          case "tools":
            chatStore.setToolsInProgress((prev) => [...prev, ...(event.names ?? [])]);
            break;

          case "text":
            accumulatedText += event.content;
            chatStore.setToolsInProgress([]);
            if (!streamingMsgAdded) {
              streamingMsgAdded = true;
              chatStore.setMessages((prev) => ({
                ...prev,
                [localId]: [
                  ...(prev[localId] ?? []),
                  {
                    id: assistantMsgId,
                    role: "assistant" as const,
                    content: accumulatedText,
                    timestamp: new Date(),
                    isStreaming: true,
                  },
                ],
              }));
            } else {
              chatStore.setMessages((prev) => ({
                ...prev,
                [localId]: (prev[localId] ?? []).map((m) =>
                  m.id === assistantMsgId ? { ...m, content: accumulatedText } : m
                ),
              }));
            }
            break;

          case "sources":
            sources = event.sources as SourceRef[];
            break;

          case "done":
            toolsUsed = event.tools_used ?? [];
            latencyMs = event.latency_ms;
            break;
        }
      }

      // Finalize
      if (accumulatedText && streamingMsgAdded) {
        chatStore.setMessages((prev) => ({
          ...prev,
          [localId]: (prev[localId] ?? []).map((m) =>
            m.id === assistantMsgId
              ? { ...m, content: accumulatedText, isStreaming: false, sources, toolsUsed, latencyMs }
              : m
          ),
        }));
      }

      onConvUpdate(localId, accumulatedText.slice(0, 50));
      return accumulatedText;

    } catch (err) {
      if (_stopRequested) {
        // Stopped intentionally — finalize with what we have
        if (accumulatedText && streamingMsgAdded) {
          chatStore.setMessages((prev) => ({
            ...prev,
            [localId]: (prev[localId] ?? []).map((m) =>
              m.id === assistantMsgId
                ? { ...m, content: accumulatedText + "\n\n*(Génération interrompue)*", isStreaming: false }
                : m
            ),
          }));
        }
      } else {
        const errorMsg: Message = {
          id: _newMsgId(),
          role: "assistant",
          content: `Désolé, une erreur est survenue : ${err instanceof Error ? err.message : "Erreur inconnue"}. Veuillez réessayer.`,
          timestamp: new Date(),
        };
        chatStore.setMessages((prev) => ({
          ...prev,
          [localId]: [...(prev[localId] ?? []), errorMsg],
        }));
      }
      return accumulatedText;
    } finally {
      chatStore.setLoading(false);
      chatStore.setToolsInProgress([]);
      chatStore.setThinking(false);
    }
  },
};

// ─── React hook — subscribes component to store updates ──────────────────────

export function useChatStore() {
  const [, forceRender] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    _listeners.add(forceRender);
    return () => { _listeners.delete(forceRender); };
  }, []);
  return _state;
}
