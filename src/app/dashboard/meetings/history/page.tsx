"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { Input } from "@/components/ui/input";
import { useBoardContext, matchesBoard } from "@/lib/board-context";
import {
  ArrowLeft,
  Calendar,
  Clock,
  Users,
  FileText,
  Search,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";

const pastMeetings = [
  {
    id: 1,
    title: "Revue financière Q4 2025",
    board: "Acme Corp",
    date: "28 fév. 2026",
    time: "14:00 — 16:00",
    participants: 6,
    documents: 4,
    hasReport: true,
  },
  {
    id: 2,
    title: "Comité de nomination",
    board: "Acme Corp",
    date: "15 fév. 2026",
    time: "09:00 — 11:00",
    participants: 5,
    documents: 2,
    hasReport: true,
  },
  {
    id: 3,
    title: "Session stratégie 2026",
    board: "Acme Corp",
    date: "20 janv. 2026",
    time: "14:00 — 17:00",
    participants: 7,
    documents: 6,
    hasReport: true,
  },
  {
    id: 4,
    title: "Board Q4 — Revue produit",
    board: "TechVentures SAS",
    date: "15 fév. 2026",
    time: "10:00 — 12:00",
    participants: 5,
    documents: 3,
    hasReport: true,
  },
  {
    id: 5,
    title: "Comité RSE annuel",
    board: "GreenEnergy SA",
    date: "20 janv. 2026",
    time: "14:00 — 16:00",
    participants: 6,
    documents: 5,
    hasReport: false,
  },
  {
    id: 6,
    title: "Conseil de surveillance Q4",
    board: "FinanceGroup SA",
    date: "10 fév. 2026",
    time: "10:00 — 12:30",
    participants: 8,
    documents: 7,
    hasReport: true,
  },
  {
    id: 7,
    title: "Revue des risques 2025",
    board: "FinanceGroup SA",
    date: "15 déc. 2025",
    time: "14:00 — 16:00",
    participants: 9,
    documents: 4,
    hasReport: true,
  },
  {
    id: 8,
    title: "AG Extraordinaire",
    board: "GreenEnergy SA",
    date: "5 déc. 2025",
    time: "09:00 — 12:00",
    participants: 6,
    documents: 8,
    hasReport: true,
  },
];

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
} as const;

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" as const } },
};

export default function MeetingHistoryPage() {
  const [search, setSearch] = useState("");
  const { selectedBoard } = useBoardContext();

  const boardFiltered = pastMeetings.filter((m) => matchesBoard(m.board, selectedBoard));
  const filtered = boardFiltered.filter(
    (m) =>
      m.title.toLowerCase().includes(search.toLowerCase()) ||
      m.board.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <motion.div variants={stagger} initial="hidden" animate="show">
      {/* Back + header */}
      <motion.div variants={fadeUp} className="mb-8">
        <Link
          href="/dashboard/meetings"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Retour aux réunions
        </Link>
        <h1 className="font-display text-3xl font-semibold text-foreground tracking-tight">
          Historique des réunions
        </h1>
        <p className="text-muted-foreground mt-1">
          {boardFiltered.length} réunions passées
        </p>
      </motion.div>

      {/* Search */}
      <motion.div variants={fadeUp} className="mb-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher une réunion..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      </motion.div>

      {/* Table */}
      <motion.div variants={fadeUp}>
        <SpotlightCard className="rounded-2xl border border-border bg-card">
          <div className="p-2">
            {/* Header row */}
            <div className="hidden sm:grid grid-cols-12 gap-4 px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <div className="col-span-4">Réunion</div>
              <div className="col-span-2">Board</div>
              <div className="col-span-2">Date</div>
              <div className="col-span-1 text-center">Membres</div>
              <div className="col-span-1 text-center">Docs</div>
              <div className="col-span-2 text-right">Compte rendu</div>
            </div>

            <div className="divide-y divide-border">
              {filtered.map((meeting) => (
                <div
                  key={meeting.id}
                  className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-4 px-4 py-3.5 items-center hover:bg-secondary/20 rounded-xl transition-colors"
                >
                  {/* Title */}
                  <div className="sm:col-span-4">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                      <p className="text-sm font-medium text-foreground truncate">
                        {meeting.title}
                      </p>
                    </div>
                  </div>

                  {/* Board */}
                  <div className="sm:col-span-2">
                    <span className="text-xs text-muted-foreground">{meeting.board}</span>
                  </div>

                  {/* Date + time */}
                  <div className="sm:col-span-2">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Calendar className="w-3 h-3" />
                      {meeting.date}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                      <Clock className="w-3 h-3" />
                      {meeting.time}
                    </div>
                  </div>

                  {/* Members */}
                  <div className="sm:col-span-1 flex items-center justify-center gap-1 text-xs text-muted-foreground">
                    <Users className="w-3 h-3" />
                    {meeting.participants}
                  </div>

                  {/* Documents */}
                  <div className="sm:col-span-1 flex items-center justify-center gap-1 text-xs text-muted-foreground">
                    <FileText className="w-3 h-3" />
                    {meeting.documents}
                  </div>

                  {/* Report link */}
                  <div className="sm:col-span-2 flex justify-end">
                    {meeting.hasReport ? (
                      <Link
                        href={`/dashboard/reports/${meeting.id}`}
                        className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                      >
                        Voir le CR
                        <ArrowRight className="w-3 h-3" />
                      </Link>
                    ) : (
                      <span className="text-xs text-muted-foreground italic">Non disponible</span>
                    )}
                  </div>
                </div>
              ))}

              {filtered.length === 0 && (
                <div className="py-12 text-center">
                  <p className="text-sm text-muted-foreground">
                    Aucune réunion trouvée pour &quot;{search}&quot;
                  </p>
                </div>
              )}
            </div>
          </div>
        </SpotlightCard>
      </motion.div>
    </motion.div>
  );
}
