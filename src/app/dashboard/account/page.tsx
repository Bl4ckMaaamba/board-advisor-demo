"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import {
  User,
  Mail,
  Phone,
  Building2,
  Briefcase,
  Shield,
  Bell,
  Globe,
  Sun,
  Moon,
  LogOut,
  Check,
  Loader2,
} from "lucide-react";

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
} as const;

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" as const } },
};

export default function AccountPage() {
  const router = useRouter();

  // Profile
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Security
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Preferences
  const [notifications, setNotifications] = useState(true);
  const [isDark, setIsDark] = useState(false);

  // Load user data from Supabase Auth
  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setEmail(user.email ?? "");
        setFullName(user.user_metadata?.full_name ?? "");
        setPhone(user.user_metadata?.phone ?? "");
        setCompany(user.user_metadata?.company ?? "");
        setRole(user.user_metadata?.role ?? "");
      }
    });
  }, []);

  const handleSaveProfile = async () => {
    setSaving(true);
    setSaved(false);
    await supabase.auth.updateUser({
      data: { full_name: fullName, phone, company, role },
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleChangePassword = async () => {
    setPasswordSaving(true);
    setPasswordMessage(null);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPasswordSaving(false);
    if (error) {
      setPasswordMessage({ type: "error", text: error.message });
    } else {
      setPasswordMessage({ type: "success", text: "Mot de passe mis à jour" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setPasswordMessage(null), 3000);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const initials = fullName
    ? fullName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : email ? email[0].toUpperCase() : "?";

  const toggleTheme = useCallback(() => {
    const next = !isDark;
    setIsDark(next);
    if (next) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [isDark]);

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="max-w-3xl">
      {/* Header */}
      <motion.div variants={fadeUp} className="flex items-center gap-5 mb-10">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-2xl font-semibold text-primary flex-shrink-0">
          {initials}
        </div>
        <div>
          <h1 className="font-display text-3xl font-semibold text-foreground tracking-tight">
            Mon Compte
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm text-muted-foreground">{email}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
              Président
            </span>
          </div>
        </div>
      </motion.div>

      {/* Profil */}
      <motion.div variants={fadeUp} className="mb-6">
        <SpotlightCard className="rounded-2xl border border-border bg-card">
          <div className="p-6">
            <div className="flex items-center gap-2 mb-6">
              <User className="w-4 h-4 text-primary" />
              <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Profil
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="fullName" className="flex items-center gap-1.5">
                  <User className="w-3 h-3 text-muted-foreground" />
                  Nom complet
                </Label>
                <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="flex items-center gap-1.5">
                  <Mail className="w-3 h-3 text-muted-foreground" />
                  Email
                </Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone" className="flex items-center gap-1.5">
                  <Phone className="w-3 h-3 text-muted-foreground" />
                  Téléphone
                </Label>
                <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="company" className="flex items-center gap-1.5">
                  <Building2 className="w-3 h-3 text-muted-foreground" />
                  Société
                </Label>
                <Input id="company" value={company} onChange={(e) => setCompany(e.target.value)} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="role" className="flex items-center gap-1.5">
                  <Briefcase className="w-3 h-3 text-muted-foreground" />
                  Fonction
                </Label>
                <Input id="role" value={role} onChange={(e) => setRole(e.target.value)} />
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-border flex items-center gap-3">
              <button
                onClick={handleSaveProfile}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : null}
                {saved ? "Enregistré" : "Enregistrer"}
              </button>
            </div>
          </div>
        </SpotlightCard>
      </motion.div>

      {/* Sécurité */}
      <motion.div variants={fadeUp} className="mb-6">
        <SpotlightCard className="rounded-2xl border border-border bg-card">
          <div className="p-6">
            <div className="flex items-center gap-2 mb-6">
              <Shield className="w-4 h-4 text-primary" />
              <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Sécurité
              </h2>
            </div>

            <div className="space-y-4 max-w-md">
              <div className="space-y-2">
                <Label htmlFor="currentPassword">Mot de passe actuel</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  placeholder="••••••••"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newPassword">Nouveau mot de passe</Label>
                <Input
                  id="newPassword"
                  type="password"
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirmer le mot de passe</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-border flex items-center gap-3">
              <button
                onClick={handleChangePassword}
                disabled={!currentPassword || !newPassword || newPassword !== confirmPassword || passwordSaving}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {passwordSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                Mettre à jour
              </button>
              {passwordMessage && (
                <span className={cn("text-sm", passwordMessage.type === "success" ? "text-emerald-500" : "text-red-500")}>
                  {passwordMessage.text}
                </span>
              )}
            </div>
          </div>
        </SpotlightCard>
      </motion.div>

      {/* Préférences */}
      <motion.div variants={fadeUp} className="mb-6">
        <SpotlightCard className="rounded-2xl border border-border bg-card">
          <div className="p-6">
            <div className="flex items-center gap-2 mb-6">
              <Globe className="w-4 h-4 text-primary" />
              <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Préférences
              </h2>
            </div>

            <div className="space-y-4">
              {/* Language */}
              <div className="flex items-center justify-between p-3 rounded-xl hover:bg-secondary/20 transition-colors">
                <div className="flex items-center gap-3">
                  <Globe className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Langue</p>
                    <p className="text-xs text-muted-foreground">Langue de l&apos;interface</p>
                  </div>
                </div>
                <span className="text-sm text-muted-foreground">Français</span>
              </div>

              {/* Notifications */}
              <div className="flex items-center justify-between p-3 rounded-xl hover:bg-secondary/20 transition-colors">
                <div className="flex items-center gap-3">
                  <Bell className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Notifications email</p>
                    <p className="text-xs text-muted-foreground">Recevoir les alertes par email</p>
                  </div>
                </div>
                <button
                  onClick={() => setNotifications(!notifications)}
                  className={cn(
                    "w-11 h-6 rounded-full transition-colors relative",
                    notifications ? "bg-primary" : "bg-secondary"
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform",
                      notifications ? "translate-x-[22px]" : "translate-x-0.5"
                    )}
                  />
                </button>
              </div>

              {/* Theme */}
              <div className="flex items-center justify-between p-3 rounded-xl hover:bg-secondary/20 transition-colors">
                <div className="flex items-center gap-3">
                  {isDark ? <Moon className="w-4 h-4 text-muted-foreground" /> : <Sun className="w-4 h-4 text-muted-foreground" />}
                  <div>
                    <p className="text-sm font-medium text-foreground">Thème</p>
                    <p className="text-xs text-muted-foreground">
                      {isDark ? "Mode sombre activé" : "Mode clair activé"}
                    </p>
                  </div>
                </div>
                <button
                  onClick={toggleTheme}
                  className={cn(
                    "w-11 h-6 rounded-full transition-colors relative",
                    isDark ? "bg-primary" : "bg-secondary"
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform",
                      isDark ? "translate-x-[22px]" : "translate-x-0.5"
                    )}
                  />
                </button>
              </div>
            </div>
          </div>
        </SpotlightCard>
      </motion.div>

      {/* Déconnexion */}
      <motion.div variants={fadeUp}>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 text-sm text-red-500 hover:text-red-600 dark:hover:text-red-400 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Se déconnecter
        </button>
      </motion.div>
    </motion.div>
  );
}
