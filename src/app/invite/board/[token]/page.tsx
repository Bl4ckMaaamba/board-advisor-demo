"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Building2, CheckCircle2, XCircle, Loader2 } from "lucide-react";

interface InvitationData {
  id: string;
  email: string;
  role: string;
  status: string;
  expires_at: string;
  board: {
    id: string;
    name: string;
    sector: string | null;
    description: string | null;
  };
}

const roleLabels: Record<string, string> = {
  owner: "Proprietaire",
  admin: "Administrateur",
  member: "Membre",
};

export default function AcceptBoardInvitationPage({
  params,
}: {
  params: { token: string };
}) {
  const router = useRouter();
  const [invitation, setInvitation] = useState<InvitationData | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "accepting" | "accepted" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  // Fetch invitation details
  useEffect(() => {
    async function fetchInvitation() {
      try {
        const res = await fetch(`/api/invitations/${params.token}`);
        if (!res.ok) {
          const data = await res.json();
          setError(data.error || "Invitation introuvable");
          setStatus("error");
          return;
        }
        const data = await res.json();
        setInvitation(data.invitation);
        setStatus("ready");
      } catch {
        setError("Erreur de connexion");
        setStatus("error");
      }
    }
    fetchInvitation();
  }, [params.token]);

  const handleAccept = async () => {
    setStatus("accepting");
    try {
      const res = await fetch(`/api/invitations/${params.token}`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Erreur lors de l'acceptation");
        setStatus("error");
        return;
      }
      const data = await res.json();
      setStatus("accepted");
      // Redirect to the board after a short delay
      setTimeout(() => {
        router.push(`/dashboard/boards/${data.board_id}`);
      }, 2000);
    } catch {
      setError("Erreur de connexion");
      setStatus("error");
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="rounded-2xl border border-border bg-card p-8 shadow-lg">
          {/* Loading */}
          {status === "loading" && (
            <div className="text-center py-8">
              <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-4" />
              <p className="text-sm text-muted-foreground">Verification de l&apos;invitation...</p>
            </div>
          )}

          {/* Error */}
          {status === "error" && (
            <div className="text-center py-8">
              <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-foreground mb-2">Invitation invalide</h2>
              <p className="text-sm text-muted-foreground mb-6">{error}</p>
              <button
                onClick={() => router.push("/dashboard")}
                className="px-6 py-2.5 text-sm font-medium rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Aller au dashboard
              </button>
            </div>
          )}

          {/* Ready to accept */}
          {status === "ready" && invitation && (
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
                <Building2 className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-xl font-semibold text-foreground mb-2">
                Rejoindre le board
              </h2>
              <p className="text-sm text-muted-foreground mb-6">
                Vous etes invite a rejoindre le board{" "}
                <span className="font-medium text-foreground">
                  &ldquo;{invitation.board.name}&rdquo;
                </span>
                {invitation.board.sector && (
                  <span className="text-muted-foreground"> ({invitation.board.sector})</span>
                )}
                {" "}en tant que{" "}
                <span className="font-medium text-foreground">
                  {roleLabels[invitation.role] || invitation.role}
                </span>
                .
              </p>
              {invitation.board.description && (
                <p className="text-xs text-muted-foreground mb-6 leading-relaxed">
                  {invitation.board.description}
                </p>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => router.push("/dashboard")}
                  className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl border border-border text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                >
                  Decliner
                </button>
                <button
                  onClick={handleAccept}
                  className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Accepter
                </button>
              </div>
            </div>
          )}

          {/* Accepting */}
          {status === "accepting" && (
            <div className="text-center py-8">
              <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-4" />
              <p className="text-sm text-muted-foreground">Acceptation en cours...</p>
            </div>
          )}

          {/* Accepted */}
          {status === "accepted" && (
            <div className="text-center py-8">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-foreground mb-2">Bienvenue !</h2>
              <p className="text-sm text-muted-foreground">
                Vous avez rejoint le board. Redirection en cours...
              </p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
