"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import Image from "next/image";
import { Eye, EyeOff, ArrowRight, Sun, Moon } from "lucide-react";
import { TextEffect } from "@/components/ui/text-effect";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { ShineBorder } from "@/components/ui/shine-border";

type AuthTab = "login" | "register" | "forgot";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const [activeTab, setActiveTab] = useState<AuthTab>("login");
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(false);
  const searchParams = useSearchParams();
  const nextUrl = searchParams.get("next") || "/dashboard";

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "dark") {
      setIsDark(true);
      document.documentElement.classList.add("dark");
    }
  }, []);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    if (next) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  };

  const resetMessages = () => {
    setError(null);
    setSuccess(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    resetMessages();

    try {
      const { supabase } = await import("@/lib/supabase");

      if (activeTab === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        window.location.href = nextUrl;
      } else if (activeTab === "register") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextUrl)}`,
          },
        });
        if (error) throw error;
        setSuccess(
          "Vérifiez votre email pour confirmer votre inscription."
        );
      } else if (activeTab === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
        });
        if (error) throw error;
        setSuccess("Un email de réinitialisation a été envoyé.");
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Une erreur est survenue";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    const { supabase } = await import("@/lib/supabase");
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextUrl)}` },
    });
  };

  return (
    <div className="min-h-screen flex">
      {/* ─── Left Panel: Photo + Branding ─── */}
      <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden">
        {/* Background photo */}
        <Image
          src="/images/boardroom.jpg"
          alt="Salle de conseil"
          fill
          className="object-cover"
          priority
        />
        {/* Overlay */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/40 to-black/70" />

        <div className="relative z-10 flex flex-col justify-between p-12 xl:p-16 w-full">
          {/* Tagline */}
          <div className="flex-1 flex flex-col justify-center max-w-lg">
            <TextEffect
              per="word"
              preset="blur"
              as="h1"
              className="font-display text-[2.75rem] xl:text-5xl leading-[1.1] tracking-tight text-white mb-6 font-semibold"
              delay={0.2}
            >
              Votre co-pilote stratégique pour des décisions éclairées
            </TextEffect>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.2, duration: 0.8 }}
              className="text-white/70 text-lg leading-relaxed mb-14 font-light"
            >
              Préparez, animez et documentez vos réunions de board avec
              précision et intelligence.
            </motion.p>

            {/* Feature highlights — simple text, no icons */}
            <div className="space-y-4">
              {[
                {
                  title: "Préparation",
                  desc: "Synthèses et analyses documentaires contextuelles",
                  delay: 1.4,
                },
                {
                  title: "Réunion",
                  desc: "Transcription live et vérification en temps réel",
                  delay: 1.6,
                },
                {
                  title: "Compte rendu",
                  desc: "Synthèse structurée, décisions et actions — export Word & PDF",
                  delay: 1.8,
                },
              ].map((feature) => (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: feature.delay, duration: 0.5 }}
                  className="flex items-baseline gap-3"
                >
                  <span className="w-1 h-1 rounded-full bg-white/50 flex-shrink-0 mt-2" />
                  <div>
                    <span className="text-sm font-medium text-white">
                      {feature.title}
                    </span>
                    <span className="text-sm text-white/50 ml-2">
                      {feature.desc}
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Bottom: credit */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 2.2, duration: 0.6 }}
            className="text-xs text-white/30"
          >
            Photo par Benjamin Child — Unsplash
          </motion.p>
        </div>
      </div>

      {/* ─── Right Panel: Login Form ─── */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-8 bg-background relative">
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="absolute top-6 right-6 w-9 h-9 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label="Changer le thème"
        >
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        <div className="w-full max-w-[420px]">
          {/* Mobile title */}
          <div className="lg:hidden mb-10 text-center">
            <h1 className="font-display text-xl font-semibold text-foreground">
              Board Advisor
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              Assistant de Gouvernance
            </p>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
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
                  {/* Header */}
                  <div className="mb-8">
                    <h2 className="font-display text-[1.625rem] font-semibold text-foreground mb-1.5">
                      {activeTab === "login"
                        ? "Bon retour"
                        : activeTab === "register"
                          ? "Créer un compte"
                          : "Mot de passe oublié"}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {activeTab === "login"
                        ? "Connectez-vous à votre espace de gouvernance"
                        : activeTab === "register"
                          ? "Rejoignez Board Advisor pour piloter vos boards"
                          : "Nous vous enverrons un lien de réinitialisation"}
                    </p>
                  </div>

                  {/* Tabs */}
                  {activeTab !== "forgot" && (
                    <div className="flex mb-8 bg-secondary/60 rounded-lg p-1">
                      {(["login", "register"] as const).map((tab) => (
                        <button
                          key={tab}
                          onClick={() => {
                            setActiveTab(tab);
                            resetMessages();
                          }}
                          className={`flex-1 py-2.5 text-sm font-medium rounded-md transition-all duration-200 ${
                            activeTab === tab
                              ? "bg-card text-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground/80"
                          }`}
                        >
                          {tab === "login" ? "Connexion" : "Inscription"}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Google OAuth */}
                  {activeTab !== "forgot" && (
                    <>
                      <button
                        onClick={handleGoogleAuth}
                        className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-lg border border-border bg-transparent hover:bg-secondary/50 transition-colors duration-200 mb-6"
                      >
                        <svg className="w-5 h-5" viewBox="0 0 24 24">
                          <path
                            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                            fill="#4285F4"
                          />
                          <path
                            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                            fill="#34A853"
                          />
                          <path
                            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                            fill="#FBBC05"
                          />
                          <path
                            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                            fill="#EA4335"
                          />
                        </svg>
                        <span className="text-sm text-foreground/80">
                          Continuer avec Google
                        </span>
                      </button>

                      {/* Divider */}
                      <div className="flex items-center gap-4 mb-6">
                        <div className="flex-1 h-px bg-border" />
                        <span className="text-xs text-muted-foreground uppercase tracking-widest">
                          ou
                        </span>
                        <div className="flex-1 h-px bg-border" />
                      </div>
                    </>
                  )}

                  {/* Messages */}
                  {error && (
                    <div className="mb-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-sm">
                      {error}
                    </div>
                  )}
                  {success && (
                    <div className="mb-4 px-4 py-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-sm">
                      {success}
                    </div>
                  )}

                  {/* Form */}
                  <form onSubmit={handleSubmit} className="space-y-4">
                    {activeTab === "register" && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <label className="block text-sm font-medium text-foreground/80 mb-2">
                          Nom complet
                        </label>
                        <input
                          type="text"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          placeholder="Jean Dupont"
                          className="w-full px-4 py-3 rounded-lg bg-secondary/40 border border-border text-foreground text-sm placeholder:text-muted-foreground/50 transition-all"
                        />
                      </motion.div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-foreground/80 mb-2">
                        Adresse email
                      </label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="vous@entreprise.com"
                        className="w-full px-4 py-3 rounded-lg bg-secondary/40 border border-border text-foreground text-sm placeholder:text-muted-foreground/50 transition-all"
                        required
                      />
                    </div>

                    {activeTab !== "forgot" && (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="block text-sm font-medium text-foreground/80">
                            Mot de passe
                          </label>
                          {activeTab === "login" && (
                            <button
                              type="button"
                              onClick={() => {
                                setActiveTab("forgot");
                                resetMessages();
                              }}
                              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                            >
                              Mot de passe oublié ?
                            </button>
                          )}
                        </div>
                        <div className="relative">
                          <input
                            type={showPassword ? "text" : "password"}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="8 caractères minimum"
                            className="w-full px-4 py-3 pr-12 rounded-lg bg-secondary/40 border border-border text-foreground text-sm placeholder:text-muted-foreground/50 transition-all"
                            required
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
                    )}

                    {/* Submit */}
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                    >
                      {isLoading ? (
                        <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                      ) : (
                        <>
                          {activeTab === "login"
                            ? "Se connecter"
                            : activeTab === "register"
                              ? "Créer mon compte"
                              : "Envoyer le lien"}
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </form>

                  {/* Footer toggle */}
                  <p className="text-center text-sm text-muted-foreground mt-6">
                    {activeTab === "login" ? (
                      <>
                        Pas encore de compte ?{" "}
                        <button
                          onClick={() => {
                            setActiveTab("register");
                            resetMessages();
                          }}
                          className="text-foreground font-medium hover:underline transition-colors"
                        >
                          Créer un compte
                        </button>
                      </>
                    ) : (
                      <>
                        Déjà un compte ?{" "}
                        <button
                          onClick={() => {
                            setActiveTab("login");
                            resetMessages();
                          }}
                          className="text-foreground font-medium hover:underline transition-colors"
                        >
                          Se connecter
                        </button>
                      </>
                    )}
                  </p>
                </div>
              </SpotlightCard>
            </ShineBorder>
          </motion.div>

          {/* Trust indicators */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1, duration: 0.6 }}
            className="mt-8 flex items-center justify-center gap-6 text-xs text-muted-foreground/50"
          >
            <span>Données chiffrées</span>
            <span className="w-px h-3 bg-border" />
            <span>RGPD conforme</span>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
