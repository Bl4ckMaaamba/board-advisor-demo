"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

export interface Board {
  id: string;
  name: string;
  role: string;
  sector: string | null;
  description?: string | null;
}

interface BoardContextValue {
  selectedBoard: string; // UUID or "Tous"
  setSelectedBoard: (boardId: string) => void;
  boards: Board[];
  isFiltered: boolean;
  loading: boolean;
  /** True once localStorage has been checked and selectedBoard is final. */
  ready: boolean;
  refreshBoards: () => Promise<void>;
  selectedBoardData: Board | null;
}

const BoardContext = createContext<BoardContextValue | null>(null);

export function BoardProvider({ children }: { children: ReactNode }) {
  const [selectedBoard, setSelectedBoardState] = useState("Tous");
  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(true);
  const [restored, setRestored] = useState(false);

  const fetchBoards = useCallback(async () => {
    try {
      const res = await fetch("/api/boards");
      if (res.ok) {
        const data = await res.json();
        setBoards(data.boards || []);
      }
    } catch {
      // Silent fail — boards will be empty
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBoards();
  }, [fetchBoards]);

  // Restore saved selection from localStorage
  useEffect(() => {
    if (loading) return; // wait for boards to load first
    const saved = localStorage.getItem("selectedBoard");
    if (saved && boards.some((b) => b.id === saved)) {
      setSelectedBoardState(saved);
    }
    setRestored(true);
  }, [boards, loading]);

  const setSelectedBoard = useCallback((boardId: string) => {
    setSelectedBoardState(boardId);
    if (boardId === "Tous") {
      localStorage.removeItem("selectedBoard");
    } else {
      localStorage.setItem("selectedBoard", boardId);
    }
  }, []);

  const selectedBoardData = boards.find((b) => b.id === selectedBoard) || null;

  return (
    <BoardContext.Provider
      value={{
        selectedBoard,
        setSelectedBoard,
        boards,
        isFiltered: selectedBoard !== "Tous",
        loading,
        ready: restored,
        refreshBoards: fetchBoards,
        selectedBoardData,
      }}
    >
      {children}
    </BoardContext.Provider>
  );
}

export function useBoardContext() {
  const ctx = useContext(BoardContext);
  if (!ctx) throw new Error("useBoardContext must be used within BoardProvider");
  return ctx;
}

export function matchesBoard(itemBoardId: string | null | undefined, selectedBoard: string): boolean {
  if (selectedBoard === "Tous") return true;
  return itemBoardId === selectedBoard;
}
