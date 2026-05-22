"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import {
  ClipboardList,
  Search,
  ArrowRight,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
} from "lucide-react";

interface Report {
  id: string;
  meeting_id: string;
  title: string | null;
  status: "generating" | "generated" | "error";
  generated_at: string;
  board_id: string | null;
  meetings: {
    title: string;
    scheduled_at: string | null;
    boards: { name: string } | null;
  } | null;
}

const statusConfig = {
  generated: { label: "Généré", className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", icon: CheckCircle2 },
  generating: { label: "En cours…", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400", icon: Clock },
  error: { label: "Erreur", className: "bg-red-500/10 text-red-500", icon: FileText },
};

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } } as const;
const fadeUp = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" as const } } };

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchReports = useCallback(async () => {
    const { data } = await supabase
      .from("meeting_reports")
      .select("id, meeting_id, title, status, generated_at, board_id, meetings(title, scheduled_at, boards(name))")
      .order("generated_at", { ascending: false });
    setReports((data as unknown as Report[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  // Auto-refresh generating reports every 5s
  useEffect(() => {
    const hasGenerating = reports.some((r) => r.status === "generating");
    if (!hasGenerating) return;
    const t = setTimeout(fetchReports, 5000);
    return () => clearTimeout(t);
  }, [reports, fetchReports]);

  const filtered = reports.filter((r) => {
    const title = r.title ?? r.meetings?.title ?? "";
    const board = r.meetings?.boards?.name ?? "";
    const q = search.toLowerCase();
    return title.toLowerCase().includes(q) || board.toLowerCase().includes(q);
  });

  const generatedCount = reports.filter((r) => r.status === "generated").length;
  const generatingCount = reports.filter((r) => r.status === "generating").length;

  return (
    <motion.div variants={stagger} initial="hidden" animate="show">
      <motion.div variants={fadeUp} className="mb-8">
        <h1 className="font-display text-3xl font-semibold text-foreground tracking-tight">
          Comptes Rendus
        </h1>
        <p className="text-muted-foreground mt-1">
          Générés automatiquement à la fin de chaque réunion.
        </p>
      </motion.div>

      <motion.div variants={fadeUp} className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
        {[
          { label: "Total", value: reports.length, icon: ClipboardList },
          { label: "Générés", value: generatedCount, icon: CheckCircle2 },
          { label: "En cours", value: generatingCount, icon: Clock },
        ].map((stat) => (
          <div key={stat.label} className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card/60">
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

      <motion.div variants={fadeUp} className="flex gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Rechercher…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
      </motion.div>

      <motion.div variants={fadeUp}>
        <SpotlightCard className="rounded-2xl border border-border bg-card">
          <div className="p-2">
            <div className="hidden sm:grid grid-cols-12 gap-4 px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <div className="col-span-5">Compte rendu</div>
              <div className="col-span-2">Board</div>
              <div className="col-span-2">Réunion du</div>
              <div className="col-span-1 text-center">Statut</div>
              <div className="col-span-2 text-right">Action</div>
            </div>

            <div className="divide-y divide-border">
              {loading ? (
                <div className="py-12 flex justify-center">
                  <Loader2 className="w-5 h-5 text-primary animate-spin" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-sm text-muted-foreground">
                    {reports.length === 0
                      ? "Les comptes rendus apparaîtront ici automatiquement à la fin de chaque réunion."
                      : "Aucun compte rendu trouvé."}
                  </p>
                </div>
              ) : (
                filtered.map((report) => {
                  const cfg = statusConfig[report.status] ?? statusConfig.error;
                  const meetingTitle = report.title ?? report.meetings?.title ?? "Réunion";
                  const boardName = report.meetings?.boards?.name ?? "—";
                  const scheduledAt = report.meetings?.scheduled_at;
                  const dateStr = scheduledAt
                    ? new Date(scheduledAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })
                    : new Date(report.generated_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
                  const generatedStr = new Date(report.generated_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });

                  return (
                    <div key={report.id} className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-4 px-4 py-3.5 items-center hover:bg-secondary/20 rounded-xl transition-colors">
                      <div className="sm:col-span-5 flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                          {report.status === "generating"
                            ? <Loader2 className="w-4 h-4 text-primary animate-spin" />
                            : <ClipboardList className="w-4 h-4 text-primary" />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{meetingTitle}</p>
                          <p className="text-xs text-muted-foreground">Généré le {generatedStr}</p>
                        </div>
                      </div>
                      <div className="sm:col-span-2">
                        <span className="text-xs text-muted-foreground">{boardName}</span>
                      </div>
                      <div className="sm:col-span-2">
                        <span className="text-xs text-muted-foreground">{dateStr}</span>
                      </div>
                      <div className="sm:col-span-1 flex justify-center">
                        <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", cfg.className)}>
                          {cfg.label}
                        </span>
                      </div>
                      <div className="sm:col-span-2 flex justify-end">
                        {report.status === "generated" ? (
                          <Link href={`/dashboard/reports/${report.id}`} className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors">
                            Consulter <ArrowRight className="w-3 h-3" />
                          </Link>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </SpotlightCard>
      </motion.div>
    </motion.div>
  );
}
