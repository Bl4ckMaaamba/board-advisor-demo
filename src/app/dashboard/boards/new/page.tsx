"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Plus, X, Mail } from "lucide-react";

const sectors = [
  "Industrie",
  "Technologie",
  "Énergie",
  "Finance",
  "Santé",
  "Services",
  "Luxe & Retail",
  "Immobilier",
  "Agroalimentaire",
  "Transport & Logistique",
  "Média & Communication",
  "Autre",
];

const companySizes = [
  { value: "startup", label: "Startup (< 50 salariés)" },
  { value: "pme", label: "PME (50 - 249 salariés)" },
  { value: "eti", label: "ETI (250 - 4999 salariés)" },
  { value: "grande_entreprise", label: "Grande entreprise (5000+)" },
];

const strategicContexts = [
  { value: "croissance", label: "Croissance" },
  { value: "pre_exit", label: "Pré-exit / Levée de fonds" },
  { value: "post_acquisition", label: "Post-acquisition / Build-up" },
  { value: "restructuration", label: "Restructuration" },
  { value: "stable", label: "Stable / Maturité" },
  { value: "introduction_bourse", label: "Introduction en bourse" },
];

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" as const } },
};

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
} as const;

export default function NewBoardPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sector, setSector] = useState("");
  const [companySiren, setCompanySiren] = useState("");
  const [companySize, setCompanySize] = useState("");
  const [strategicContext, setStrategicContext] = useState("");
  const [companyHeadquarters, setCompanyHeadquarters] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [members, setMembers] = useState<string[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const addMember = () => {
    const email = memberEmail.trim().toLowerCase();
    if (email && email.includes("@") && !members.includes(email)) {
      setMembers((prev) => [...prev, email]);
      setMemberEmail("");
    }
  };

  const removeMember = (email: string) => {
    setMembers((prev) => prev.filter((m) => m !== email));
  };

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      // 1. Create board
      const res = await fetch("/api/boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          sector,
          company_siren: companySiren.trim() || null,
          company_size: companySize || null,
          company_strategic_context: strategicContext || null,
          company_headquarters: companyHeadquarters.trim() || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erreur lors de la creation");
      }

      const { board } = await res.json();

      // 2. Send invitations for each member email
      for (const email of members) {
        await fetch(`/api/boards/${board.id}/members`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, role: "member" }),
        });
      }

      router.push(`/dashboard/boards/${board.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setIsLoading(false);
    }
  };

  const canSubmit = name.trim() && sector;

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="max-w-2xl">
      {/* Back link + header */}
      <motion.div variants={fadeUp} className="mb-8">
        <Link
          href="/dashboard/boards"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Retour aux boards
        </Link>

        <h1 className="font-display text-3xl font-semibold text-foreground tracking-tight">
          Créer un board
        </h1>
        <p className="text-muted-foreground mt-1">
          Configurez un nouveau conseil d&apos;administration ou comité.
        </p>
      </motion.div>

      {/* Form */}
      <motion.div variants={fadeUp}>
        <SpotlightCard className="rounded-2xl border border-border bg-card">
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Nom du board</Label>
              <Input
                id="name"
                placeholder="Ex : Acme Corp — Conseil d'administration"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <textarea
                id="description"
                placeholder="Décrivez l'objet de ce conseil ou comité..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="flex w-full rounded-lg border border-border bg-background/80 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/40 resize-none transition-colors"
              />
            </div>

            {/* Sector */}
            <div className="space-y-2">
              <Label htmlFor="sector">Secteur</Label>
              <select
                id="sector"
                value={sector}
                onChange={(e) => setSector(e.target.value)}
                required
                className="flex h-9 w-full rounded-lg border border-border bg-background/80 px-3 py-1 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/40 transition-colors"
              >
                <option value="" disabled>
                  Sélectionner un secteur
                </option>
                {sectors.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            {/* Advanced toggle */}
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-sm text-primary hover:text-primary/80 transition-colors font-medium"
            >
              {showAdvanced ? "— Masquer le profil entreprise" : "+ Ajouter le profil entreprise (optionnel)"}
            </button>

            {showAdvanced && (
              <div className="space-y-4 p-4 rounded-xl bg-secondary/30 border border-border">
                <p className="text-xs text-muted-foreground">
                  Ces informations enrichissent l&apos;analyse IA (Data Broker, Challenge Engine, Briefings).
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="siren">SIREN / SIRET</Label>
                    <Input
                      id="siren"
                      placeholder="123 456 789"
                      value={companySiren}
                      onChange={(e) => setCompanySiren(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="headquarters">Siège social</Label>
                    <Input
                      id="headquarters"
                      placeholder="Paris, France"
                      value={companyHeadquarters}
                      onChange={(e) => setCompanyHeadquarters(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="companySize">Taille</Label>
                    <select
                      id="companySize"
                      value={companySize}
                      onChange={(e) => setCompanySize(e.target.value)}
                      className="flex h-9 w-full rounded-lg border border-border bg-background/80 px-3 py-1 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/40 transition-colors"
                    >
                      <option value="">Non spécifié</option>
                      {companySizes.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="strategicContext">Contexte stratégique</Label>
                    <select
                      id="strategicContext"
                      value={strategicContext}
                      onChange={(e) => setStrategicContext(e.target.value)}
                      className="flex h-9 w-full rounded-lg border border-border bg-background/80 px-3 py-1 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/40 transition-colors"
                    >
                      <option value="">Non spécifié</option>
                      {strategicContexts.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Members */}
            <div className="space-y-2">
              <Label>Membres initiaux</Label>
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="adresse@email.com"
                  value={memberEmail}
                  onChange={(e) => setMemberEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addMember();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={addMember}
                  className="flex items-center gap-1.5 px-3 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-secondary/50 transition-colors flex-shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Ajouter
                </button>
              </div>

              {members.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-2">
                  {members.map((email) => (
                    <span
                      key={email}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary text-xs text-foreground"
                    >
                      <Mail className="w-3 h-3 text-muted-foreground" />
                      {email}
                      <button
                        type="button"
                        onClick={() => removeMember(email)}
                        className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-destructive/20 transition-colors"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-sm">
                {error}
              </div>
            )}

            {/* Submit */}
            <div className="pt-4 border-t border-border">
              <button
                type="submit"
                disabled={!canSubmit || isLoading}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? "Creation en cours..." : "Creer le board"}
              </button>
            </div>
          </form>
        </SpotlightCard>
      </motion.div>
    </motion.div>
  );
}
