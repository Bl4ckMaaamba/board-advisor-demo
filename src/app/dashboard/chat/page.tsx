"use client";

import { useState, useRef, useEffect, useLayoutEffect, useCallback, Suspense } from "react";
import { useChatStore, chatStore, newMsgId } from "@/lib/chat-store";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Building2, ArrowRight, Calendar } from "lucide-react";
import { ChatSidebar, type Conversation } from "@/components/chat/chat-sidebar";
import { ChatMessage, type Message, type SourceRef } from "@/components/chat/chat-message";
import { ChatInput, type ActiveModes } from "@/components/chat/chat-input";
import { ChatEmptyState } from "@/components/chat/chat-empty-state";
import { ToolActivityIndicator } from "@/components/chat/tool-activity";
import { DocumentPicker } from "@/components/chat/document-picker";
import { DocumentPreviewModal } from "@/components/documents/DocumentPreviewModal";
import { useBoardContext } from "@/lib/board-context";
import type { BoardContext } from "@/lib/data-broker/schemas/query-params";

async function loadConversations(boardId?: string): Promise<Conversation[]> {
  try {
    const url = boardId
      ? `/api/conversations?board_id=${encodeURIComponent(boardId)}`
      : "/api/conversations";
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.conversations ?? []).map(
      (c: { id: string; title: string; board_id: string | null; updated_at: string }) => ({
        id: c.id,
        title: c.title,
        boardId: c.board_id,
        lastMessage: "",
        date: new Date(c.updated_at),
      })
    );
  } catch {
    return [];
  }
}


export default function ChatPage() {
  return (
    <Suspense fallback={null}>
      <ChatPageContent />
    </Suspense>
  );
}

function ChatPageContent() {
  const searchParams = useSearchParams();
  const meetingParam = searchParams.get("meeting");
  const docsParam = searchParams.get("docs");

  const { selectedBoard } = useBoardContext();
  // Persistent store — survives client-side navigation
  const { messagesByConv, isLoading, isThinking, toolsInProgress, activeId } = useChatStore();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const sidebarWidth = sidebarExpanded ? 280 : 60;
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [allDocIds, setAllDocIds] = useState<string[]>([]);
  const [docsInitialized, setDocsInitialized] = useState(false);
  const [previewDocId, setPreviewDocId] = useState<string | null>(null);
  const [sourceLookupError, setSourceLookupError] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const shouldFollowRef = useRef(true); // true = snap to bottom when content grows
  const prevBoardRef = useRef<string | undefined>(undefined);

  const activeMessages = activeId ? messagesByConv[activeId] ?? [] : [];

  // Resolve current board context from DB-fetched boards
  const { selectedBoardData } = useBoardContext();
  const boardContext: BoardContext | undefined = selectedBoardData
    ? {
        board_id: selectedBoardData.id,
        name: selectedBoardData.name,
        role: selectedBoardData.role,
        sector: selectedBoardData.sector || "",
      }
    : undefined;

  // Initialize document selection from URL query params (meeting prep flow)
  useEffect(() => {
    if (!docsInitialized && docsParam) {
      setSelectedDocIds(docsParam.split(",").filter(Boolean));
      setDocsInitialized(true);
    }
  }, [docsParam, docsInitialized]);

  // Load message history for a conversation from the API
  const loadMessages = useCallback(async (convId: string) => {
    try {
      const res = await fetch(`/api/conversations/${convId}/messages`);
      if (!res.ok) return;
      const data = await res.json();
      const msgs: Message[] = (data.messages ?? []).map(
        (m: { id: string; role: "user" | "assistant"; content: string; sources?: SourceRef[]; tools_used?: string[]; created_at: string }) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp: new Date(m.created_at),
          sources: m.sources?.length ? m.sources : undefined,
          toolsUsed: m.tools_used?.length ? m.tools_used : undefined,
        })
      );
      chatStore.setMessages((prev) => {
        // If the user already typed something or a stream populated the conv
        // while we were fetching, don't overwrite — local state is authoritative.
        if ((prev[convId] ?? []).length > 0) return prev;
        return { ...prev, [convId]: msgs };
      });
    } catch {
      // silently fail
    }
  }, []);

  const handleSelectConversation = useCallback((id: string) => {
    chatStore.setActiveId(id);
    shouldFollowRef.current = true;
    // Load messages if not already in memory
    if (!chatStore.getState().messagesByConv[id]) {
      loadMessages(id);
    }
  }, [loadMessages]);

  // Load conversations from Supabase — filtered by board
  useEffect(() => {
    const boardId = selectedBoardData?.id;
    const boardChanged = prevBoardRef.current !== undefined && prevBoardRef.current !== selectedBoard;
    prevBoardRef.current = selectedBoard;

    loadConversations(boardId).then((convs) => {
      setConversations(convs);
      // Reset active conversation only when the board actually changes — not on navigation back
      if (boardChanged) chatStore.setActiveId(null);
      const map: Record<string, string> = {};
      convs.forEach((c) => { map[c.id] = c.id; });
      chatStore.setConvIdMap((prev) => ({ ...prev, ...map }));
    });
  }, [selectedBoard]); // eslint-disable-line react-hooks/exhaustive-deps

  // Track if user is scrolling up → stop following
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    shouldFollowRef.current = distFromBottom < 80;
  }, []);

  // After every render: if we should follow, snap to bottom (no animation → no fighting)
  useLayoutEffect(() => {
    const el = scrollContainerRef.current;
    if (!el || !shouldFollowRef.current) return;
    el.scrollTop = el.scrollHeight;
  });

  // On conversation switch: always snap to bottom and re-enable follow
  useEffect(() => {
    shouldFollowRef.current = true;
    const el = scrollContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [activeId]);

  const handleNewConversation = () => {
    const id = Date.now().toString();
    const newConv: Conversation = {
      id,
      title: "Nouvelle conversation",
      lastMessage: "",
      date: new Date(),
    };
    setConversations((prev) => [newConv, ...prev]);
    chatStore.setActiveId(id);
    shouldFollowRef.current = true;
  };

  const handleCanvasGeneration = useCallback(async (
    query: string,
    serverConvId: string | undefined,
    localId: string,
    msgId: string,
    signal: AbortSignal,
    prefilledContent?: string
  ) => {
    chatStore.setToolsInProgress(["canvas_generation"]);
    try {
      const res = await fetch("/api/agent-canvas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          conversation_id: serverConvId,
          board_context: boardContext,
          // When "Tous" (empty selection) → send all available doc IDs so canvas can read them
          document_ids: selectedDocIds.length > 0 ? selectedDocIds : allDocIds.length > 0 ? allDocIds : undefined,
          ...(prefilledContent ? { prefilled_content: prefilledContent } : {}),
        }),
        signal,
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: "Erreur serveur" }));
        const msg: string = errBody.error ?? "Erreur génération présentation";
        // Surface credit error clearly
        if (msg.includes("credit balance")) throw new Error("Crédits Anthropic insuffisants. Rechargez votre compte sur console.anthropic.com.");
        throw new Error(msg);
      }

      const presentationTitle = decodeURIComponent(res.headers.get("X-Presentation-Title") ?? "Présentation");
      const summary = decodeURIComponent(res.headers.get("X-Summary") ?? "");
      const convIdHeader = res.headers.get("X-Conv-Id");
      const isNewHeader = res.headers.get("X-Is-New") === "true";
      const latencyMs = parseInt(res.headers.get("X-Latency") ?? "0");
      const toolsHeader = res.headers.get("X-Tools-Used") ?? "";

      if (convIdHeader && !serverConvId) {
        chatStore.setConvIdMap((prev) => ({ ...prev, [localId]: convIdHeader }));
      }
      if (isNewHeader) {
        setConversations((prev) => prev.map((c) =>
          c.id === localId ? { ...c, title: presentationTitle } : c
        ));
      }

      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const safeTitle = presentationTitle.replace(/[^a-zA-Z0-9\s\-_]/g, "").trim() || "presentation";
      const filename = `${safeTitle}.pptx`;

      chatStore.setToolsInProgress([]);
      chatStore.setMessages((prev) => ({
        ...prev,
        [localId]: [
          ...(prev[localId] ?? []),
          {
            id: msgId,
            role: "assistant" as const,
            content: summary ? `**${presentationTitle}**\n\n${summary}` : `**${presentationTitle}**`,
            timestamp: new Date(),
            isStreaming: false,
            latencyMs,
            toolsUsed: toolsHeader ? toolsHeader.split(",") : [],
            pptxDownload: { title: presentationTitle, filename, blobUrl },
          },
        ],
      }));
    } catch (err) {
      chatStore.setToolsInProgress([]);
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        chatStore.setMessages((prev) => ({
          ...prev,
          [localId]: [
            ...(prev[localId] ?? []),
            { id: msgId, role: "assistant" as const, content: `Erreur génération présentation : ${err instanceof Error ? err.message : err}`, timestamp: new Date(), isStreaming: false },
          ],
        }));
      }
    } finally {
      chatStore.setLoading(false);
    }
  }, [boardContext, selectedDocIds, allDocIds]); // eslint-disable-line react-hooks/exhaustive-deps

  const sendMessage = useCallback(
    (text: string, files?: File[], modes: ActiveModes = { search: false, think: false, canvas: false }) => {
      if (!text.trim() && (!files || files.length === 0)) return;
      if (chatStore.getState().isLoading) return;

      let localId = chatStore.getState().activeId;
      if (!localId) {
        localId = Date.now().toString();
        const newConv: Conversation = {
          id: localId,
          title: text.slice(0, 40) + (text.length > 40 ? "..." : ""),
          lastMessage: text,
          date: new Date(),
        };
        setConversations((prev) => [newConv, ...prev]);
        chatStore.setActiveId(localId);
      }
      shouldFollowRef.current = true;

      const previewImageFile = files?.find((f) => f.type.startsWith("image/"));
      const userMsg: Message = {
        id: newMsgId(),
        role: "user",
        content: text || "📎 Image jointe",
        timestamp: new Date(),
        imagePreview: previewImageFile ? URL.createObjectURL(previewImageFile) : undefined,
      };

      chatStore.setMessages((prev) => ({
        ...prev,
        [localId!]: [...(prev[localId!] ?? []), userMsg],
      }));

      const capturedLocalId = localId;
      const serverConvId = chatStore.getState().convIdMap[capturedLocalId];
      const capturedFiles = files ?? [];

      // Lock immediately — before any async work — so concurrent calls are blocked
      chatStore.setLoading(true);
      chatStore.setToolsInProgress([]);
      chatStore.setThinking(false);

      // Run async work in an IIFE (sendMessage callback itself is sync)
      (async () => {
        // Convert image to base64 if needed (must happen in React context for FileReader)
        let image_base64: string | undefined;
        let image_media_type: string | undefined;
        const imageFile = capturedFiles.find((f) => f.type.startsWith("image/"));
        if (imageFile) {
          image_base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve((e.target?.result as string).split(",")[1]);
            reader.onerror = reject;
            reader.readAsDataURL(imageFile);
          });
          image_media_type = imageFile.type;
        }

        // Canvas-only → direct canvas generation (no stream)
        const canvasOnly = modes.canvas && !modes.think && !modes.search;
        if (canvasOnly) {
          const dummyController = new AbortController();
          await handleCanvasGeneration(text, serverConvId, capturedLocalId, newMsgId(), dummyController.signal);
          return;
        }

        // SSE stream — runs entirely at module level, survives navigation
        const needsUnified = modes.think || modes.search;
        const endpoint = needsUnified ? "/api/agent-unified" : "/api/agent";

        chatStore.runStream({
        localId: capturedLocalId,
        serverConvId,
        endpoint,
        body: {
          query: text,
          conversation_id: serverConvId,
          board_context: boardContext,
          document_ids: selectedDocIds.length > 0 ? selectedDocIds : undefined,
          ...(needsUnified ? { modes: { search: modes.search, think: modes.think } } : {}),
          ...(image_base64 ? { image_base64, image_media_type } : {}),
        },
        onConvUpdate: (id, lastMsg) => {
          setConversations((prev) =>
            prev.map((c) => c.id === id ? { ...c, lastMessage: lastMsg + "..." } : c)
          );
        },
      }).then(async (accumulatedText) => {
        // Canvas alongside think/search → generate PPTX from response
        if (modes.canvas && accumulatedText) {
          const dummyController = new AbortController();
          await handleCanvasGeneration(
            text,
            serverConvId ?? chatStore.getState().convIdMap[capturedLocalId],
            capturedLocalId,
            newMsgId(),
            dummyController.signal,
            accumulatedText
          );
        }
      });
      })();
    },
    [boardContext, selectedDocIds, handleCanvasGeneration]
  );

  const handleStop = useCallback(() => {
    chatStore.stopStream();
  }, []);

  const showEmptyState = activeMessages.length === 0 && !isLoading;
  const hasStreamingMsg = activeMessages.some((m) => m.isStreaming);
  const showToolActivity = isLoading && !hasStreamingMsg;
  const needsBoardSelection = !selectedBoardData;

  // Source click → lookup doc by name, open preview
  const handleSourceClick = useCallback(async (source: SourceRef) => {
    if (source.type !== "internal") return;
    setSourceLookupError(null);
    try {
      const boardId = selectedBoardData?.id;
      const url = boardId ? `/api/documents?board_id=${encodeURIComponent(boardId)}` : "/api/documents";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Erreur de recherche");
      const data = await res.json();
      const docs = (data.documents ?? []) as { id: string; name: string }[];
      const match = docs.find((d) => d.name === source.name);
      if (!match) {
        setSourceLookupError(`Document "${source.name}" introuvable.`);
        setTimeout(() => setSourceLookupError(null), 4000);
        return;
      }
      setPreviewDocId(match.id);
    } catch (err) {
      setSourceLookupError(err instanceof Error ? err.message : "Erreur inconnue");
      setTimeout(() => setSourceLookupError(null), 4000);
    }
  }, [selectedBoardData?.id]);

  // Board selection gate
  if (needsBoardSelection) {
    return <BoardSelectionGate />;
  }

  return (
    <div className="fixed inset-0 z-20 pt-[72px] flex bg-background">
      {/* Sidebar */}
      <ChatSidebar
        conversations={conversations}
        activeId={activeId}
        onSelect={handleSelectConversation}
        onNew={handleNewConversation}
        onExpandedChange={setSidebarExpanded}
      />

      {/* Main chat area */}
      <div
        className="flex-1 flex flex-col min-w-0 transition-[margin-left] duration-300"
        style={{ marginLeft: sidebarWidth }}
      >
        {/* Meeting prep banner */}
        {meetingParam && (
          <div className="px-6 pt-3">
            <div className="max-w-3xl mx-auto flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/5 border border-primary/15">
              <Calendar className="w-4 h-4 text-primary flex-shrink-0" />
              <span className="text-sm text-foreground font-medium truncate">
                Préparation : {decodeURIComponent(meetingParam)}
              </span>
              {selectedDocIds.length > 0 && (
                <span className="text-xs text-muted-foreground ml-auto flex-shrink-0">
                  {selectedDocIds.length} doc{selectedDocIds.length > 1 ? "s" : ""} sélectionné{selectedDocIds.length > 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>
        )}

        {showEmptyState ? (
          <ChatEmptyState onSuggestion={sendMessage} meetingTitle={meetingParam ? decodeURIComponent(meetingParam) : undefined} />
        ) : (
          <div className="flex-1 overflow-y-auto" ref={scrollContainerRef} onScroll={handleScroll}>
            <div className="divide-y divide-border/30">
              {activeMessages.map((msg, i) => (
                <ChatMessage key={msg.id} message={msg} index={i} onSourceClick={handleSourceClick} />
              ))}
              {showToolActivity && (
                <div className="py-6">
                  <div className="max-w-3xl mx-auto">
                    <ToolActivityIndicator tools={toolsInProgress} isThinking={isThinking} />
                  </div>
                </div>
              )}
            </div>
            <div className="h-4" />
          </div>
        )}

        {/* Document filter + Input */}
        <div className="px-6 pb-0">
          <div className="max-w-3xl mx-auto flex items-center gap-2 mb-2">
            <DocumentPicker
              boardId={selectedBoardData?.id ?? ""}
              selectedIds={selectedDocIds}
              onSelectionChange={setSelectedDocIds}
              onDocumentsLoaded={setAllDocIds}
            />
          </div>
        </div>
        <ChatInput
          onSend={(text, files, modes) => sendMessage(text, files, modes)}
          onStop={handleStop}
          isLoading={isLoading}
        />
      </div>

      {sourceLookupError && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl border border-red-500/40 bg-red-500/10 text-sm text-red-500 shadow-lg backdrop-blur-sm">
          {sourceLookupError}
        </div>
      )}

      <DocumentPreviewModal
        documentId={previewDocId}
        isOpen={previewDocId !== null}
        onClose={() => setPreviewDocId(null)}
        onDeleted={() => setPreviewDocId(null)}
      />
    </div>
  );
}

/** Full-screen board selection when no board is chosen */
function BoardSelectionGate() {
  const { setSelectedBoard, boards, loading } = useBoardContext();

  return (
    <div className="fixed inset-0 z-20 pt-[72px] flex items-center justify-center bg-background">
      <div className="max-w-2xl w-full px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="text-center mb-10"
        >
          <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-5">
            <Building2 className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold text-foreground mb-2">
            Selectionnez une entreprise
          </h1>
          <p className="text-muted-foreground text-base">
            Choisissez le board pour lequel vous souhaitez preparer votre session.
            L&apos;assistant adaptera ses analyses au contexte de l&apos;entreprise.
          </p>
        </motion.div>

        <div className="grid gap-3">
          {loading ? (
            <p className="text-center text-muted-foreground text-sm">Chargement...</p>
          ) : boards.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm">
              Aucun board. Creez-en un depuis la page Boards.
            </p>
          ) : (
            boards.map((board, i) => (
              <motion.button
                key={board.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.1 + i * 0.05 }}
                onClick={() => setSelectedBoard(board.id)}
                className="group w-full flex items-center gap-4 px-5 py-4 rounded-xl border border-border bg-card hover:bg-secondary/40 hover:border-primary/30 transition-all text-left"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/8 border border-primary/15 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/15 transition-colors">
                  <Building2 className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-base font-medium text-foreground">{board.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {board.role} &middot; {board.sector}
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
              </motion.button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
