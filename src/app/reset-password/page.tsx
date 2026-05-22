"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Eye, EyeOff, ArrowRight, Check, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { ShineBorder } from "@/components/ui/shine-border";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "dark") {
      setIsDark(true);
      document.documentElement.classList.add("dark");
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setSuccess(true);
      setTimeout(() => router.push("/dashboard"), 2000);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Une erreur est survenue";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-[420px]">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <ShineBorder
            borderRadius={16}
            borderWidth={isDark ? 1 : 2}
            duration={8}
            color={
              isDark
                ? ["#e3b44a", "#995b20", "#e3b44a"]
                : ["#8c6430", "#c8a060", "#8c6430"]
            }
            className="w-full !min-w-0 !p-0"
          >
            <SpotlightCard
              className="rounded-2xl border-0 bg-card"
              spotlightColor={
                isDark
                  ? "rgba(227, 180, 74, 0.08)"
                  : "rgba(30, 58, 95, 0.06)"
              }
            >
              <div className="p-8 sm:p-10">
                {success ? (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
                      <Check className="w-8 h-8 text-emerald-500" />
                    </div>
                    <h2 className="font-display text-xl font-semibold text-foreground mb-2">
                      Mot de passe mis à jour
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Redirection vers le tableau de bord...
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="mb-8">
                      <h2 className="font-display text-[1.625rem] font-semibold text-foreground mb-1.5">
                        Nouveau mot de passe
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        Choisissez un nouveau mot de passe pour votre compte
                      </p>
                    </div>

                    {error && (
                      <div className="mb-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-sm">
                        {error}
                      </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-foreground/80 mb-2">
                          Nouveau mot de passe
                        </label>
                        <div className="relative">
                          <input
                            type={showPassword ? "text" : "password"}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="8 caractères minimum"
                            className="w-full px-4 py-3 pr-12 rounded-lg bg-secondary/40 border border-border text-foreground text-sm placeholder:text-muted-foreground/50 transition-all"
                            required
                            minLength={8}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {showPassword ? (
                              <EyeOff className="w-4 h-4" />
                            ) : (
                              <Eye className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-foreground/80 mb-2">
                          Confirmer le mot de passe
                        </label>
                        <input
                          type={showPassword ? "text" : "password"}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Répétez le mot de passe"
                          className="w-full px-4 py-3 rounded-lg bg-secondary/40 border border-border text-foreground text-sm placeholder:text-muted-foreground/50 transition-all"
                          required
                          minLength={8}
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                      >
                        {isLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            Mettre à jour
                            <ArrowRight className="w-4 h-4" />
                          </>
                        )}
                      </button>
                    </form>
                  </>
                )}
              </div>
            </SpotlightCard>
          </ShineBorder>
        </motion.div>
      </div>
    </div>
  );
}
