"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { useBoardContext, matchesBoard } from "@/lib/board-context";
import { supabase } from "@/lib/supabase";
import {
  Calendar,
  Users,
  FileText,
  ArrowRight,
  MessageSquare,
  Upload,
  Building2,
  Loader2,
  Mail,
  CheckCircle2,
} from "lucide-react";

const roleLabels: Record<string, string> = {
  owner: "Proprietaire",
  admin: "Admin",
  member: "Membre",
};

const stagger = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.08,
    },
  },
} as const;

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" as const } },
};

interface DashboardDoc {
  id: string;
  name: string;
  board_id: string;
  created_at: string;
}

interface PendingInvitation {
  id: string;
  email: string;
  role: string;
  token: string;
  expires_at: string;
  created_at: string;
  board: {
    id: string;
    name: string;
    sector: string | null;
    description: string | null;
  };
}

export default function DashboardPage() {
  const router = useRouter();
  const { selectedBoard, boards, loading: boardsLoading } = useBoardContext();
  const [userName, setUserName] = useState("");
  const [recentDocs, setRecentDocs] = useState<DashboardDoc[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [pendingInvitations, setPendingInvitations] = useState<PendingInvitation[]>([]);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        const name = user.user_metadata?.full_name;
        if (name) {
          setUserName(name.split(" ")[0]);
        } else if (user.email) {
          setUserName(user.email.split("@")[0]);
        }
      }
    });
  }, []);

  // Fetch recent documents
  useEffect(() => {
    async function fetchDocs() {
      try {
        const res = await fetch("/api/documents");
        if (res.ok) {
          const data = await res.json();
          setRecentDocs((data.documents || []).slice(0, 5));
        }
      } catch {
        // silent
      } finally {
        setDocsLoading(false);
      }
    }
    fetchDocs();
  }, []);

  // Fetch pending invitations
  useEffect(() => {
    async function fetchInvitations() {
      try {
        const res = await fetch("/api/invitations/pending");
        if (res.ok) {
          const data = await res.json();
          setPendingInvitations(data.invitations || []);
        }
      } catch {
        // silent
      }
    }
    fetchInvitations();
  }, []);

  const handleAcceptInvitation = async (token: string, invId: string) => {
    setAcceptingId(invId);
    try {
      const res = await fetch(`/api/invitations/${token}`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setPendingInvitations((prev) => prev.filter((inv) => inv.id !== invId));
        // Refresh boards in context
        window.location.href = `/dashboard/boards/${data.board_id}`;
      }
    } catch {
      // silent
    } finally {
      setAcceptingId(null);
    }
  };

  const filteredBoards = selectedBoard === "Tous"
    ? boards
    : boards.filter((b) => b.id === selectedBoard);

  const filteredDocs = recentDocs.filter((d) => matchesBoard(d.board_id, selectedBoard));

  return (
    <motion.div variants={stagger} initial="hidden" animate="show">
      {/* Welcome header */}
      <motion.div variants={fadeUp} className="mb-10">
        <h1 className="font-display text-3xl font-semibold text-foreground tracking-tight">
          Bonjour{userName ? `, ${userName}` : ""}
        </h1>
        <p className="text-muted-foreground mt-1">
          Voici un apercu de votre activite de gouvernance.
        </p>
      </motion.div>

      {/* Stats */}
      <motion.div variants={fadeUp} className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Boards", value: filteredBoards.length, icon: Building2 },
          { label: "Documents", value: filteredDocs.length, icon: FileText },
          { label: "Reunions", value: "—", icon: Calendar },
          { label: "Membres", value: "—", icon: Users },
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

      {/* Pending Invitations */}
      {pendingInvitations.length > 0 && (
        <motion.div variants={fadeUp} className="mb-8">
          <div className="rounded-2xl border border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-950/20 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Mail className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <h3 className="text-sm font-medium text-amber-800 dark:text-amber-300">
                {pendingInvitations.length === 1
                  ? "Vous avez une invitation en attente"
                  : `Vous avez ${pendingInvitations.length} invitations en attente`}
              </h3>
            </div>
            <div className="space-y-3">
              {pendingInvitations.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between gap-4 p-3 rounded-xl bg-white/60 dark:bg-white/5 border border-amber-100 dark:border-amber-800/30"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Building2 className="w-4 h-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {inv.board.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Role : {roleLabels[inv.role] || inv.role}
                        {inv.board.sector && ` · ${inv.board.sector}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => router.push(`/invite/board/${inv.token}`)}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                    >
                      Voir
                    </button>
                    <button
                      onClick={() => handleAcceptInvitation(inv.token, inv.id)}
                      disabled={acceptingId === inv.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                      {acceptingId === inv.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-3 h-3" />
                      )}
                      Accepter
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* Grid layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ─── Quick Actions ─── */}
        <motion.div variants={fadeUp} className="lg:col-span-2">
          <SpotlightCard className="rounded-2xl border border-border bg-card h-full">
            <div className="p-6">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-6">
                Actions rapides
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={() => router.push("/dashboard/chat")}
                  className="flex items-center gap-3 p-4 rounded-xl border border-border hover:border-primary/30 hover:bg-secondary/30 transition-all text-left group"
                >
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <MessageSquare className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                      Chatbot IA
                    </p>
                    <p className="text-xs text-muted-foreground">Preparer une reunion, analyser des documents</p>
                  </div>
                </button>
                <button
                  onClick={() => router.push("/dashboard/documents")}
                  className="flex items-center gap-3 p-4 rounded-xl border border-border hover:border-primary/30 hover:bg-secondary/30 transition-all text-left group"
                >
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Upload className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                      Importer des documents
                    </p>
                    <p className="text-xs text-muted-foreground">PDF, DOCX, XLSX, TXT</p>
                  </div>
                </button>
                <button
                  onClick={() => router.push("/dashboard/meetings")}
                  className="flex items-center gap-3 p-4 rounded-xl border border-border hover:border-primary/30 hover:bg-secondary/30 transition-all text-left group"
                >
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Calendar className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                      Reunions
                    </p>
                    <p className="text-xs text-muted-foreground">Planifier et gerer vos reunions</p>
                  </div>
                </button>
                <button
                  onClick={() => router.push("/dashboard/boards/new")}
                  className="flex items-center gap-3 p-4 rounded-xl border border-border hover:border-primary/30 hover:bg-secondary/30 transition-all text-left group"
                >
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                      Creer un board
                    </p>
                    <p className="text-xs text-muted-foreground">Nouveau conseil ou comite</p>
                  </div>
                </button>
              </div>
            </div>
          </SpotlightCard>
        </motion.div>

        {/* ─── Recent Documents ─── */}
        <motion.div variants={fadeUp}>
          <SpotlightCard className="rounded-2xl border border-border bg-card h-full">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Documents recents
                </h3>
                <button
                  onClick={() => router.push("/dashboard/documents")}
                  className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                >
                  Voir tous
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>

              {docsLoading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
                </div>
              ) : filteredDocs.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Aucun document
                </p>
              ) : (
                <div className="space-y-3">
                  {filteredDocs.map((doc) => {
                    const boardData = boards.find((b) => b.id === doc.board_id);
                    return (
                      <div key={doc.id} className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <FileText className="w-3.5 h-3.5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground/80 leading-snug truncate">
                            {doc.name}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {boardData && (
                              <span className="text-xs text-muted-foreground">{boardData.name}</span>
                            )}
                            <span className="text-xs text-muted-foreground">
                              {new Date(doc.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </SpotlightCard>
        </motion.div>

        {/* ─── My Boards ─── */}
        <motion.div variants={fadeUp} className="lg:col-span-3">
          <SpotlightCard className="rounded-2xl border border-border bg-card">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Mes Boards
                </h3>
                <button
                  onClick={() => router.push("/dashboard/boards")}
                  className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                >
                  Voir tous
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>

              {boardsLoading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
                </div>
              ) : filteredBoards.length === 0 ? (
                <div className="text-center py-8">
                  <Building2 className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground mb-3">Aucun board pour le moment</p>
                  <button
                    onClick={() => router.push("/dashboard/boards/new")}
                    className="text-sm font-medium text-primary hover:text-primary/80 transition-colors"
                  >
                    Creer votre premier board
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {filteredBoards.map((board) => (
                    <button
                      key={board.id}
                      onClick={() => router.push(`/dashboard/boards/${board.id}`)}
                      className="text-left p-4 rounded-xl border border-border hover:border-primary/30 hover:bg-secondary/30 transition-all group"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                          {board.sector || "—"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {roleLabels[board.role] || board.role}
                        </span>
                      </div>
                      <h4 className="font-display text-base font-semibold text-foreground mb-2 group-hover:text-primary transition-colors">
                        {board.name}
                      </h4>
                      {board.description && (
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {board.description}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </SpotlightCard>
        </motion.div>
      </div>
    </motion.div>
  );
}
