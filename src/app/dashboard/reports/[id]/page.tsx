"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { supabase } from "@/lib/supabase";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ClipboardList, ArrowLeft, Loader2, Printer, Copy, Check } from "lucide-react";

interface Report {
  id: string;
  meeting_id: string;
  title: string | null;
  content: string;
  status: string;
  generated_at: string;
  agenda_used: { order: number; title: string; duration_min?: number }[] | null;
  meetings: {
    title: string;
    scheduled_at: string | null;
    boards: { name: string } | null;
  } | null;
}

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" as const } },
};

export default function ReportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    supabase
      .from("meeting_reports")
      .select("id, meeting_id, title, content, status, generated_at, agenda_used, meetings(title, scheduled_at, boards(name))")
      .eq("id", id)
      .single()
      .then(({ data, error }) => {
        if (error || !data) setNotFound(true);
        else setReport(data as unknown as Report);
        setLoading(false);
      });
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
      </div>
    );
  }

  if (notFound || !report) {
    return (
      <div className="text-center py-24">
        <p className="text-muted-foreground">Compte rendu introuvable.</p>
        <button onClick={() => router.back()} className="mt-4 text-sm text-primary hover:underline">
          Retour
        </button>
      </div>
    );
  }

  const meetingTitle = report.title ?? report.meetings?.title ?? "Réunion";
  const boardName = report.meetings?.boards?.name;
  const scheduledAt = report.meetings?.scheduled_at;
  const dateStr = scheduledAt
    ? new Date(scheduledAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
    : new Date(report.generated_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

  return (
    <motion.div
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
      initial="hidden"
      animate="show"
    >
      {/* Header */}
      <motion.div variants={fadeUp} className="mb-6">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Retour aux comptes rendus
        </button>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <ClipboardList className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-semibold text-foreground">{meetingTitle}</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {boardName && <span>{boardName} · </span>}
                {dateStr}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors print:hidden"
            >
              <Printer className="w-3.5 h-3.5" />
              Exporter en PDF
            </button>
            <button
              onClick={() => {
                if (!report.content) return;
                navigator.clipboard.writeText(report.content);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors print:hidden"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copié" : "Copier"}
            </button>
          </div>
        </div>
      </motion.div>

      {/* Content */}
      <motion.div variants={fadeUp}>
        <SpotlightCard className="rounded-2xl border border-border bg-card">
          <div className="p-6 sm:p-8 prose prose-sm dark:prose-invert max-w-none prose-headings:font-display prose-headings:font-semibold prose-h1:text-xl prose-h2:text-lg prose-h3:text-base prose-p:text-foreground/90 prose-li:text-foreground/90 prose-strong:text-foreground prose-table:text-sm">
            {report.status === "generating" ? (
              <div className="flex flex-col items-center py-12 gap-3">
                <Loader2 className="w-6 h-6 text-primary animate-spin" />
                <p className="text-sm text-muted-foreground">Génération en cours…</p>
              </div>
            ) : (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {report.content}
              </ReactMarkdown>
            )}
          </div>
        </SpotlightCard>
      </motion.div>
    </motion.div>
  );
}
