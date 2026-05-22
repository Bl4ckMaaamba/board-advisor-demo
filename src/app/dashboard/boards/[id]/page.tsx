"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MeetingPrepModal } from "@/components/meetings/meeting-prep-modal";
import { useBoardContext } from "@/lib/board-context";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import type { BoardMember, BoardInvitation } from "@/lib/types/boards";
import {
  ArrowLeft,
  Users,
  Calendar,
  FileText,
  Mail,
  Clock,
  Plus,
  Trash2,
  Upload,
  ExternalLink,
  Loader2,
  Send,
  Shield,
  ShieldOff,
  Crown,
  Pencil,
  X,
  Check,
} from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";

// ── Types ──

interface BoardDetail {
  id: string;
  name: string;
  description: string | null;
  sector: string | null;
  owner_id: string;
  created_at: string;
  company_strategic_context: string | null;
  company_siren: string | null;
  company_employees: string | null;
  company_revenue: string | null;
  competitors: string | null;
  key_clients: string | null;
}

const SECTORS = [
  "Industrie","Technologie","Énergie","Finance","Santé","Services",
  "Luxe & Retail","Immobilier","Agroalimentaire","Transport & Logistique",
  "Média & Communication","Autre",
];

interface BoardDoc {
  id: string;
  name: string;
  type: string;
  size: number;
  board_id: string;
  meeting_id: string | null;
  status: string;
  created_at: string;
}

interface Meeting {
  id: string;
  title: string;
  board_id: string;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  scheduled_at: string | null;
  user_id: string;
  admin_user_id: string;
  created_at: string;
}

// ── Config ──

const roleColors: Record<string, string> = {
  owner: "bg-primary/10 text-primary",
  admin: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  member: "bg-secondary text-muted-foreground",
};

const roleLabels: Record<string, string> = {
  owner: "Proprietaire",
  admin: "Admin",
  member: "Membre",
};

const meetingStatusLabels: Record<string, string> = {
  idle: "Planifiee",
  recording: "En cours",
  paused: "En pause",
  completed: "Terminee",
};

const meetingStatusColors: Record<string, string> = {
  idle: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  recording: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  paused: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  completed: "bg-secondary text-muted-foreground",
};

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
} as const;

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" as const } },
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// ── Invite member form ──

function InviteMemberForm({
  onSubmit,
  onCancel,
  isLoading,
}: {
  onSubmit: (email: string, role: string) => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (email.trim()) onSubmit(email.trim().toLowerCase(), role);
        }}
        className="p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-3"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="invite-email" className="text-sm font-medium text-foreground">
              Email <span className="text-red-500 ml-0.5">*</span>
            </label>
            <input
              id="invite-email"
              type="email"
              placeholder="membre@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2.5 text-sm bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring/40"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="invite-role" className="text-sm font-medium text-foreground">
              Role
            </label>
            <select
              id="invite-role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full px-3 py-2.5 text-sm bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-1 focus:ring-ring/40"
            >
              <option value="member">Membre</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={!email.trim() || isLoading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors"
          >
            {isLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            Inviter
          </button>
        </div>
      </form>
    </motion.div>
  );
}

// ── Page ──

export default function BoardDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const { setSelectedBoard } = useBoardContext();

  // Current user
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Data states
  const [board, setBoard] = useState<BoardDetail | null>(null);
  const [members, setMembers] = useState<BoardMember[]>([]);
  const [invitations, setInvitations] = useState<BoardInvitation[]>([]);
  const [docs, setDocs] = useState<BoardDoc[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI states
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [memberToDelete, setMemberToDelete] = useState<BoardMember | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [roleLoading, setRoleLoading] = useState<string | null>(null);
  const [roleChangeAction, setRoleChangeAction] = useState<{ userId: string; newRole: "admin" | "member"; name: string } | null>(null);
  const [prepMeeting, setPrepMeeting] = useState<Meeting | null>(null);
  const [activeTab, setActiveTab] = useState("membres");

  // Get current user
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setCurrentUserId(data.user.id);
    });
  }, []);

  // Derive current user's role
  const currentUserRole = members.find((m) => m.user_id === currentUserId)?.role;
  const isAdmin = currentUserRole === "owner" || currentUserRole === "admin";

  // ── Edit board profile modal ──
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [editSector, setEditSector] = useState("");
  const [editStrategicContext, setEditStrategicContext] = useState("");
  const [editSiren, setEditSiren] = useState("");
  const [editEmployees, setEditEmployees] = useState("");
  const [editRevenue, setEditRevenue] = useState("");
  const [editCompetitors, setEditCompetitors] = useState("");
  const [editKeyClients, setEditKeyClients] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  function openEditProfile() {
    if (!board) return;
    setEditSector(board.sector ?? "");
    setEditStrategicContext(board.company_strategic_context ?? "");
    setEditSiren(board.company_siren ?? "");
    setEditEmployees(board.company_employees ?? "");
    setEditRevenue(board.company_revenue ?? "");
    setEditCompetitors(board.competitors ?? "");
    setEditKeyClients(board.key_clients ?? "");
    setEditProfileOpen(true);
  }

  // ── Data fetching ──

  const fetchBoardData = useCallback(async () => {
    try {
      const res = await fetch(`/api/boards/${id}`);
      if (!res.ok) {
        setError("Board introuvable");
        return;
      }
      const data = await res.json();
      setBoard(data.board);
      setMembers(data.members || []);
      setInvitations(data.invitations || []);
    } catch {
      setError("Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [id]);

  const handleSaveProfile = useCallback(async () => {
    if (!board) return;
    setSavingProfile(true);
    try {
      const res = await fetch(`/api/boards/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sector: editSector || undefined,
          company_strategic_context: editStrategicContext || undefined,
          company_siren: editSiren || undefined,
          company_employees: editEmployees || undefined,
          company_revenue: editRevenue || undefined,
          competitors: editCompetitors || undefined,
          key_clients: editKeyClients || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Erreur lors de la sauvegarde");
        return;
      }
      await fetchBoardData();
      setEditProfileOpen(false);
    } catch {
      alert("Erreur réseau");
    } finally {
      setSavingProfile(false);
    }
  }, [board, id, editSector, editStrategicContext, editSiren, editEmployees, editRevenue, editCompetitors, editKeyClients, fetchBoardData]);

  const fetchDocs = useCallback(async () => {
    try {
      const res = await fetch(`/api/documents?board_id=${id}`);
      if (res.ok) {
        const data = await res.json();
        setDocs(data.documents || []);
      }
    } catch {
      // silent
    }
  }, [id]);

  const fetchMeetings = useCallback(async () => {
    try {
      const res = await fetch(`/api/meetings?board_id=${id}`);
      if (res.ok) {
        const data = await res.json();
        setMeetings(data.meetings || []);
      }
    } catch {
      // silent
    }
  }, [id]);

  useEffect(() => {
    fetchBoardData();
    fetchDocs();
    fetchMeetings();
  }, [fetchBoardData, fetchDocs, fetchMeetings]);

  useEffect(() => {
    if (board) {
      setSelectedBoard(id);
    }
  }, [board, id, setSelectedBoard]);

  // ── Handlers ──

  const handleInvite = async (email: string, role: string) => {
    setInviteLoading(true);
    try {
      const res = await fetch(`/api/boards/${id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Erreur lors de l'invitation");
        return;
      }
      setShowInviteForm(false);
      await fetchBoardData();
    } catch {
      alert("Erreur reseau");
    } finally {
      setInviteLoading(false);
    }
  };

  const handleRemoveMember = async (member: BoardMember) => {
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/boards/${id}/members`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ board_id: id, user_id: member.user_id }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Erreur lors de la suppression");
        return;
      }
      setMemberToDelete(null);
      await fetchBoardData();
    } catch {
      alert("Erreur reseau");
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleChangeRole = async (userId: string, newRole: "admin" | "member") => {
    setRoleLoading(userId);
    try {
      const res = await fetch(`/api/boards/${id}/members`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, role: newRole }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Erreur lors du changement de role");
        return;
      }
      await fetchBoardData();
    } catch {
      alert("Erreur reseau");
    } finally {
      setRoleLoading(null);
    }
  };

  // ── Helper: find member name by user_id ──

  const getMemberName = (userId: string | null): string => {
    if (!userId) return "Non defini";
    const m = members.find((mem) => mem.user_id === userId);
    return m?.profile?.full_name || m?.profile?.email || "Inconnu";
  };

  // ── Loading / error states ──

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
      </div>
    );
  }

  if (error || !board) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground mb-4">{error || "Board introuvable"}</p>
        <Link
          href="/dashboard/boards"
          className="text-sm font-medium text-primary hover:text-primary/80 transition-colors"
        >
          Retour aux boards
        </Link>
      </div>
    );
  }

  const activeMeetings = meetings.filter((m) => m.status !== "completed");
  const pastMeetings = meetings.filter((m) => m.status === "completed");

  return (
    <motion.div variants={stagger} initial="hidden" animate="show">
      {/* Back link + header */}
      <motion.div variants={fadeUp} className="mb-8">
        <Link
          href="/dashboard/boards"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Retour aux boards
        </Link>

        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="font-display text-3xl font-semibold text-foreground tracking-tight">
                {board.name}
              </h1>
              {board.sector && (
                <span className="text-xs px-2.5 py-1 rounded-full bg-secondary text-muted-foreground font-medium">
                  {board.sector}
                </span>
              )}
            </div>
            {board.description && (
              <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
                {board.description}
              </p>
            )}
          </div>
          {/* Right side: role badge + edit button */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {isAdmin && (
              <button
                onClick={openEditProfile}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
                Modifier le profil
              </button>
            )}
            {currentUserRole && (
              <span className={cn(
                "text-xs px-3 py-1.5 rounded-full font-medium",
                roleColors[currentUserRole] || "bg-secondary text-muted-foreground"
              )}>
                {roleLabels[currentUserRole] || currentUserRole}
              </span>
            )}
          </div>
        </div>
      </motion.div>

      {/* Tabs */}
      <motion.div variants={fadeUp}>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="membres" className="gap-1.5">
              <Users className="w-3.5 h-3.5" />
              Membres ({members.length})
            </TabsTrigger>
            <TabsTrigger value="reunions" className="gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              Reunions ({meetings.length})
            </TabsTrigger>
            <TabsTrigger value="documents" className="gap-1.5">
              <FileText className="w-3.5 h-3.5" />
              Documents ({docs.length})
            </TabsTrigger>
          </TabsList>

          {/* ── Membres ── */}
          <TabsContent value="membres">
            <SpotlightCard className="rounded-2xl border border-border bg-card">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-foreground">
                    {members.length} membre{members.length > 1 ? "s" : ""}
                    {invitations.length > 0 && (
                      <span className="text-muted-foreground font-normal">
                        {" "}+ {invitations.length} invitation{invitations.length > 1 ? "s" : ""} en attente
                      </span>
                    )}
                  </h3>
                  {isAdmin && (
                    <button
                      onClick={() => setShowInviteForm(!showInviteForm)}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Inviter
                    </button>
                  )}
                </div>

                <AnimatePresence>
                  {showInviteForm && (
                    <div className="mb-4">
                      <InviteMemberForm
                        onSubmit={handleInvite}
                        onCancel={() => setShowInviteForm(false)}
                        isLoading={inviteLoading}
                      />
                    </div>
                  )}
                </AnimatePresence>

                {/* Active members */}
                <div className="space-y-1">
                  {members.map((member) => {
                    const displayName = member.profile?.full_name || member.profile?.email || "Utilisateur";
                    const displayEmail = member.profile?.email || "";
                    const initials = getInitials(displayName);
                    const roleLabel = roleLabels[member.role] || member.role;
                    const roleColor = roleColors[member.role] || "bg-secondary text-muted-foreground";
                    const isCurrentUser = member.user_id === currentUserId;
                    const canChangeRole = isAdmin && member.role !== "owner" && !isCurrentUser;

                    return (
                      <div
                        key={member.id}
                        className={cn(
                          "group flex items-center gap-4 p-3 rounded-xl hover:bg-secondary/30 transition-colors",
                          isCurrentUser && "bg-primary/5"
                        )}
                      >
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary flex-shrink-0">
                          {initials}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-foreground">{displayName}</p>
                            {isCurrentUser && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
                                vous
                              </span>
                            )}
                          </div>
                          {displayEmail && (
                            <div className="flex items-center gap-2 mt-0.5">
                              <Mail className="w-3 h-3 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">{displayEmail}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", roleColor)}>
                            {roleLabel}
                          </span>
                          {canChangeRole && (
                            <button
                              onClick={() =>
                                setRoleChangeAction({
                                  userId: member.user_id,
                                  newRole: member.role === "admin" ? "member" : "admin",
                                  name: displayName,
                                })
                              }
                              disabled={roleLoading === member.user_id}
                              className={cn(
                                "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
                                member.role === "admin"
                                  ? "text-blue-500 hover:text-muted-foreground hover:bg-secondary/50"
                                  : "text-muted-foreground hover:text-blue-500 hover:bg-blue-500/10"
                              )}
                              title={member.role === "admin" ? "Retirer admin" : "Promouvoir admin"}
                            >
                              {roleLoading === member.user_id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : member.role === "admin" ? (
                                <ShieldOff className="w-3.5 h-3.5" />
                              ) : (
                                <Shield className="w-3.5 h-3.5" />
                              )}
                            </button>
                          )}
                          {isAdmin && member.role !== "owner" && !isCurrentUser && (
                            <button
                              onClick={() => setMemberToDelete(member)}
                              className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
                              aria-label={`Retirer ${displayName}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Pending invitations */}
                {invitations.length > 0 && (
                  <>
                    <div className="my-4 h-px bg-border" />
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                      Invitations en attente
                    </h4>
                    <div className="space-y-1">
                      {invitations.map((inv) => (
                        <div
                          key={inv.id}
                          className="flex items-center gap-4 p-3 rounded-xl bg-amber-500/5 border border-amber-500/10"
                        >
                          <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                            <Send className="w-4 h-4 text-amber-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground">{inv.email}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <Clock className="w-3 h-3 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">
                                Invitee le {new Date(inv.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                              </span>
                            </div>
                          </div>
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400">
                            {roleLabels[inv.role] || inv.role}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {members.length === 0 && invitations.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    Aucun membre
                  </p>
                )}
              </div>
            </SpotlightCard>
          </TabsContent>

          {/* ── Reunions ── */}
          <TabsContent value="reunions">
            <div className="space-y-6">
              {/* Link to meetings page */}
              <div className="flex justify-end">
                <Link
                  href="/dashboard/meetings"
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Planifier une reunion
                  <ExternalLink className="w-3 h-3 opacity-60" />
                </Link>
              </div>

              {/* Reunions actives / planifiees */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Calendar className="w-4 h-4 text-emerald-500" />
                  <h3 className="text-sm font-semibold text-foreground">Reunions</h3>
                  <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                    {activeMeetings.length}
                  </span>
                </div>

                <SpotlightCard className="rounded-2xl border border-border bg-card">
                  <div className="p-4">
                    {activeMeetings.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-6">
                        Aucune reunion planifiee
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {activeMeetings.map((meeting) => (
                          <div
                            key={meeting.id}
                            className="flex items-center gap-4 p-3 rounded-xl hover:bg-secondary/30 transition-colors"
                          >
                            <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-emerald-500/10">
                              <Calendar className="w-4 h-4 text-emerald-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground">{meeting.title}</p>
                              <div className="flex items-center gap-3 mt-0.5">
                                {meeting.scheduled_at && (
                                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <Clock className="w-3 h-3" />
                                    {new Date(meeting.scheduled_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                                  </span>
                                )}
                                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Crown className="w-3 h-3" />
                                  Admin : {getMemberName(meeting.admin_user_id)}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={cn(
                                "text-xs px-2 py-0.5 rounded-full font-medium",
                                meetingStatusColors[meeting.status] || "bg-secondary text-muted-foreground"
                              )}>
                                {meetingStatusLabels[meeting.status] || meeting.status}
                              </span>
                              <button
                                onClick={() => setPrepMeeting(meeting)}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                              >
                                Preparer
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </SpotlightCard>
              </div>

              {/* Reunions passees */}
              {pastMeetings.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold text-foreground">Reunions passees</h3>
                    <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                      {pastMeetings.length}
                    </span>
                  </div>
                  <SpotlightCard className="rounded-2xl border border-border bg-card">
                    <div className="p-4">
                      <div className="space-y-2">
                        {pastMeetings.map((meeting) => (
                          <div
                            key={meeting.id}
                            className="flex items-center gap-4 p-3 rounded-xl hover:bg-secondary/30 transition-colors opacity-75"
                          >
                            <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-secondary">
                              <Calendar className="w-4 h-4 text-muted-foreground" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground">{meeting.title}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <Crown className="w-3 h-3 text-muted-foreground" />
                                <span className="text-xs text-muted-foreground">
                                  Admin : {getMemberName(meeting.admin_user_id)}
                                </span>
                              </div>
                            </div>
                            <span className={cn(
                              "text-xs px-2.5 py-1 rounded-full font-medium",
                              meetingStatusColors.completed
                            )}>
                              Terminee
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </SpotlightCard>
                </div>
              )}
            </div>
          </TabsContent>

          {/* ── Documents ── */}
          <TabsContent value="documents">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">
                  {docs.length} document{docs.length !== 1 ? "s" : ""}
                </h3>
                {isAdmin && (
                  <Link
                    href="/dashboard/documents"
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Gerer les documents
                    <ExternalLink className="w-3 h-3 opacity-60" />
                  </Link>
                )}
              </div>

              {docs.length === 0 ? (
                <SpotlightCard className="rounded-2xl border border-border bg-card">
                  <div className="py-8 text-center">
                    <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-3 opacity-40" />
                    <p className="text-sm text-muted-foreground mb-3">Aucun document uploade pour ce board</p>
                    {isAdmin && (
                      <Link
                        href="/dashboard/documents"
                        className="text-sm font-medium text-primary hover:text-primary/80 transition-colors"
                      >
                        Importer des documents
                      </Link>
                    )}
                  </div>
                </SpotlightCard>
              ) : (
                (() => {
                  // Group docs by meeting
                  const byMeeting: Record<string, BoardDoc[]> = {};
                  const noMeeting: BoardDoc[] = [];
                  for (const doc of docs) {
                    if (doc.meeting_id) {
                      if (!byMeeting[doc.meeting_id]) byMeeting[doc.meeting_id] = [];
                      byMeeting[doc.meeting_id].push(doc);
                    } else {
                      noMeeting.push(doc);
                    }
                  }

                  // Build meeting name map
                  const meetingNameMap: Record<string, string> = {};
                  for (const m of meetings) {
                    meetingNameMap[m.id] = m.title;
                  }

                  const meetingGroups = Object.entries(byMeeting);

                  return (
                    <div className="space-y-4">
                      {meetingGroups.map(([meetingId, meetingDocs]) => (
                        <SpotlightCard key={meetingId} className="rounded-2xl border border-border bg-card">
                          <div className="p-4">
                            <div className="flex items-center gap-2 mb-3">
                              <Calendar className="w-4 h-4 text-primary" />
                              <h4 className="text-sm font-semibold text-foreground">
                                {meetingNameMap[meetingId] || "Reunion inconnue"}
                              </h4>
                              <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                                {meetingDocs.length} doc{meetingDocs.length > 1 ? "s" : ""}
                              </span>
                            </div>
                            <div className="space-y-1">
                              {meetingDocs.map((doc) => {
                                const sizeStr =
                                  doc.size >= 1024 * 1024
                                    ? `${(doc.size / (1024 * 1024)).toFixed(1)} MB`
                                    : `${Math.round(doc.size / 1024)} KB`;
                                return (
                                  <div
                                    key={doc.id}
                                    className="flex items-center gap-4 p-3 rounded-xl hover:bg-secondary/30 transition-colors"
                                  >
                                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                                      <FileText className="w-4 h-4 text-primary" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium text-foreground">{doc.name}</p>
                                      <div className="flex items-center gap-3 mt-0.5">
                                        <span className="text-xs text-muted-foreground">{doc.type}</span>
                                        <span className="w-px h-3 bg-border" />
                                        <span className="text-xs text-muted-foreground">{sizeStr}</span>
                                      </div>
                                    </div>
                                    <span className="text-xs text-muted-foreground">
                                      {new Date(doc.created_at).toLocaleDateString("fr-FR", {
                                        day: "numeric",
                                        month: "short",
                                        year: "numeric",
                                      })}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </SpotlightCard>
                      ))}

                      {noMeeting.length > 0 && (
                        <SpotlightCard className="rounded-2xl border border-border bg-card">
                          <div className="p-4">
                            <div className="flex items-center gap-2 mb-3">
                              <FileText className="w-4 h-4 text-muted-foreground" />
                              <h4 className="text-sm font-semibold text-muted-foreground">
                                Sans reunion associee
                              </h4>
                              <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                                {noMeeting.length}
                              </span>
                            </div>
                            <div className="space-y-1">
                              {noMeeting.map((doc) => {
                                const sizeStr =
                                  doc.size >= 1024 * 1024
                                    ? `${(doc.size / (1024 * 1024)).toFixed(1)} MB`
                                    : `${Math.round(doc.size / 1024)} KB`;
                                return (
                                  <div
                                    key={doc.id}
                                    className="flex items-center gap-4 p-3 rounded-xl hover:bg-secondary/30 transition-colors"
                                  >
                                    <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
                                      <FileText className="w-4 h-4 text-muted-foreground" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium text-foreground">{doc.name}</p>
                                      <div className="flex items-center gap-3 mt-0.5">
                                        <span className="text-xs text-muted-foreground">{doc.type}</span>
                                        <span className="w-px h-3 bg-border" />
                                        <span className="text-xs text-muted-foreground">{sizeStr}</span>
                                      </div>
                                    </div>
                                    <span className="text-xs text-muted-foreground">
                                      {new Date(doc.created_at).toLocaleDateString("fr-FR", {
                                        day: "numeric",
                                        month: "short",
                                        year: "numeric",
                                      })}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </SpotlightCard>
                      )}
                    </div>
                  );
                })()
              )}
            </div>
          </TabsContent>
        </Tabs>
      </motion.div>

      {/* Delete member confirmation dialog */}
      <AnimatePresence>
        {memberToDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={() => setMemberToDelete(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="bg-card border border-border rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-base font-semibold text-foreground mb-2">
                Retirer ce membre ?
              </h3>
              <p className="text-sm text-muted-foreground mb-6">
                Etes-vous sur de vouloir retirer{" "}
                <span className="font-medium text-foreground">
                  {memberToDelete.profile?.full_name || memberToDelete.profile?.email || "ce membre"}
                </span>{" "}
                du board ? Cette action est irreversible.
              </p>
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => setMemberToDelete(null)}
                  className="px-4 py-2 text-sm font-medium rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={() => handleRemoveMember(memberToDelete)}
                  disabled={deleteLoading}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 transition-colors"
                >
                  {deleteLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Supprimer
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Role change confirmation dialog */}
      <AnimatePresence>
        {roleChangeAction && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={() => setRoleChangeAction(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="bg-card border border-border rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-base font-semibold text-foreground mb-2">
                {roleChangeAction.newRole === "admin" ? "Promouvoir en admin ?" : "Retirer le role admin ?"}
              </h3>
              <p className="text-sm text-muted-foreground mb-6">
                {roleChangeAction.newRole === "admin"
                  ? <>Promouvoir <span className="font-medium text-foreground">{roleChangeAction.name}</span> en admin du board ?</>
                  : <>Retirer le role admin de <span className="font-medium text-foreground">{roleChangeAction.name}</span> et le passer en membre ?</>
                }
              </p>
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => setRoleChangeAction(null)}
                  className="px-4 py-2 text-sm font-medium rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={async () => {
                    await handleChangeRole(roleChangeAction.userId, roleChangeAction.newRole);
                    setRoleChangeAction(null);
                  }}
                  disabled={roleLoading === roleChangeAction.userId}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50",
                    roleChangeAction.newRole === "admin"
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "bg-amber-500 text-white hover:bg-amber-600"
                  )}
                >
                  {roleLoading === roleChangeAction.userId && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {roleChangeAction.newRole === "admin" ? "Promouvoir" : "Confirmer"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <MeetingPrepModal
        meetingId={prepMeeting?.id ?? ""}
        meetingTitle={prepMeeting?.title ?? ""}
        boardId={id}
        boardName={board.name}
        isOpen={!!prepMeeting}
        onClose={() => setPrepMeeting(null)}
      />

      {/* ── Edit board profile modal ── */}
      <Dialog.Root open={editProfileOpen} onOpenChange={setEditProfileOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-lg bg-card border border-border rounded-2xl shadow-xl p-6 focus:outline-none max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Pencil className="w-4 h-4 text-primary" />
                <Dialog.Title className="text-base font-semibold text-foreground">
                  Modifier le profil du board
                </Dialog.Title>
              </div>
              <Dialog.Close asChild>
                <button className="text-muted-foreground hover:text-foreground transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </Dialog.Close>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Secteur</label>
                <select
                  value={editSector}
                  onChange={(e) => setEditSector(e.target.value)}
                  className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                >
                  <option value="">— Non renseigné —</option>
                  {SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                  Contexte stratégique
                  <span className="ml-1 font-normal opacity-70">(utilisé par les IA en réunion)</span>
                </label>
                <textarea
                  value={editStrategicContext}
                  onChange={(e) => setEditStrategicContext(e.target.value)}
                  placeholder="Ex : Phase de croissance internationale, ouverture de 3 marchés européens en 18 mois…"
                  className="w-full h-24 bg-background border border-border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">SIREN</label>
                  <input
                    type="text"
                    value={editSiren}
                    onChange={(e) => setEditSiren(e.target.value)}
                    placeholder="123 456 789"
                    className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Effectif</label>
                  <input
                    type="text"
                    value={editEmployees}
                    onChange={(e) => setEditEmployees(e.target.value)}
                    placeholder="Ex : 250"
                    className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Chiffre d&apos;affaires</label>
                <input
                  type="text"
                  value={editRevenue}
                  onChange={(e) => setEditRevenue(e.target.value)}
                  placeholder="Ex : 12M€"
                  className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Concurrents principaux</label>
                <input
                  type="text"
                  value={editCompetitors}
                  onChange={(e) => setEditCompetitors(e.target.value)}
                  placeholder="Ex : Concurrent A, Concurrent B"
                  className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Clients clés</label>
                <input
                  type="text"
                  value={editKeyClients}
                  onChange={(e) => setEditKeyClients(e.target.value)}
                  placeholder="Ex : Client A, Client B"
                  className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end mt-6">
              <Dialog.Close asChild>
                <button
                  disabled={savingProfile}
                  className="px-4 py-2 text-sm rounded-xl border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
                >
                  Annuler
                </button>
              </Dialog.Close>
              <button
                onClick={handleSaveProfile}
                disabled={savingProfile}
                className="flex items-center gap-2 px-4 py-2 text-sm rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {savingProfile ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Enregistrement…</>
                ) : (
                  <><Check className="w-3.5 h-3.5" /> Enregistrer</>
                )}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </motion.div>
  );
}
