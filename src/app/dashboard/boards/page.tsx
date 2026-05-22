"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { useBoardContext } from "@/lib/board-context";
import {
  Users,
  Calendar,
  FileText,
  ArrowRight,
  Plus,
  Building2,
} from "lucide-react";

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
} as const;

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" as const } },
};

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

export default function BoardsPage() {
  const { boards, selectedBoard, setSelectedBoard, loading } = useBoardContext();

  // If a specific board is selected, show only that one; otherwise show all
  const filteredBoards = selectedBoard === "Tous"
    ? boards
    : boards.filter((b) => b.id === selectedBoard);

  return (
    <motion.div variants={stagger} initial="hidden" animate="show">
      {/* Header */}
      <motion.div variants={fadeUp} className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl font-semibold text-foreground tracking-tight">
            Mes Boards
          </h1>
          <p className="text-muted-foreground mt-1">
            Gerez vos conseils d&apos;administration et comites.
          </p>
        </div>
        <Link
          href="/dashboard/boards/new"
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Creer un board
        </Link>
      </motion.div>

      {/* Stats */}
      <motion.div variants={fadeUp} className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
        {[
          { label: "Boards", value: filteredBoards.length, icon: Building2 },
          { label: "Membres", value: "—", icon: Users },
          { label: "Documents", value: "—", icon: FileText },
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

      {/* Board grid */}
      {loading ? (
        <p className="text-center text-muted-foreground py-12">Chargement...</p>
      ) : filteredBoards.length === 0 ? (
        <motion.div variants={fadeUp} className="text-center py-16">
          <Building2 className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-muted-foreground mb-4">Aucun board pour le moment.</p>
          <Link
            href="/dashboard/boards/new"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Creer votre premier board
          </Link>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredBoards.map((board) => {
            const roleLabel = roleLabels[board.role] || board.role;
            const roleColor = roleColors[board.role] || "bg-secondary text-muted-foreground";
            return (
              <motion.div key={board.id} variants={fadeUp}>
                <Link href={`/dashboard/boards/${board.id}`} onClick={() => setSelectedBoard(board.id)}>
                  <SpotlightCard className="rounded-2xl border border-border bg-card h-full group">
                    <div className="p-6 flex flex-col h-full">
                      {/* Badges */}
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-xs px-2.5 py-1 rounded-full bg-secondary text-muted-foreground font-medium">
                          {board.sector || "—"}
                        </span>
                        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${roleColor}`}>
                          {roleLabel}
                        </span>
                      </div>

                      {/* Name & description */}
                      <h3 className="font-display text-lg font-semibold text-foreground mb-1.5 group-hover:text-primary transition-colors">
                        {board.name}
                      </h3>
                      <p className="text-sm text-muted-foreground leading-relaxed mb-5 line-clamp-2">
                        {board.description || "Aucune description"}
                      </p>

                      {/* Meta */}
                      <div className="grid grid-cols-2 gap-3 mb-5 mt-auto">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Calendar className="w-3.5 h-3.5" />
                          {board.sector || "—"}
                        </div>
                      </div>

                      {/* CTA */}
                      <div className="flex items-center gap-1.5 text-xs font-medium text-primary group-hover:gap-2.5 transition-all">
                        Voir le board
                        <ArrowRight className="w-3 h-3" />
                      </div>
                    </div>
                  </SpotlightCard>
                </Link>
              </motion.div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
