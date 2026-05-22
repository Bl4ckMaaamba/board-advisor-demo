import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase-server";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";

async function sendInvitationEmail(params: {
  email: string;
  token: string;
  boardName: string;
  inviterName: string;
  role: string;
}) {
  if (!RESEND_API_KEY) {
    console.warn("[Members] RESEND_API_KEY not set, skipping email");
    return;
  }

  const inviteUrl = `${APP_URL}/invite/board/${params.token}`;
  const roleLabel = params.role === "admin" ? "Administrateur" : "Membre";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Board Advisor <onboarding@resend.dev>",
      to: [params.email],
      subject: `Invitation a rejoindre "${params.boardName}" sur Board Advisor`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
          <div style="text-align: center; margin-bottom: 32px;">
            <h1 style="font-size: 24px; font-weight: 600; color: #111; margin: 0;">Board Advisor</h1>
          </div>
          <div style="background: #f9fafb; border-radius: 12px; padding: 32px; border: 1px solid #e5e7eb;">
            <h2 style="font-size: 20px; font-weight: 600; color: #111; margin: 0 0 12px 0;">
              Vous etes invite a rejoindre un board
            </h2>
            <p style="color: #6b7280; font-size: 15px; line-height: 1.6; margin: 0 0 24px 0;">
              <strong style="color: #111;">${params.inviterName}</strong> vous invite a rejoindre le board
              <strong style="color: #111;">"${params.boardName}"</strong> en tant que <strong style="color: #111;">${roleLabel}</strong>.
            </p>
            <a href="${inviteUrl}" style="display: inline-block; background: #111; color: #fff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 15px; font-weight: 500;">
              Accepter l'invitation
            </a>
            <p style="color: #9ca3af; font-size: 13px; margin: 24px 0 0 0;">
              Cette invitation expire dans 7 jours. Si vous n'avez pas de compte, vous pourrez en creer un en cliquant sur le lien.
            </p>
          </div>
          <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 24px;">
            Board Advisor — Plateforme de gouvernance IA
          </p>
        </div>
      `,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("[Members] Resend API error:", res.status, body);
  } else {
    console.log("[Members] Invitation email sent to", params.email);
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    let supabase;
    try {
      ({ supabase } = await getAuthenticatedUser());
    } catch {
      return NextResponse.json({ error: "Non authentifie" }, { status: 401 });
    }

    const { data: rawMembers, error } = await supabase
      .from("board_members")
      .select("*")
      .eq("board_id", params.id)
      .order("joined_at");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Get profiles separately (no FK between board_members and profiles)
    const userIds = (rawMembers || []).map((m: { user_id: string }) => m.user_id);
    const profilesMap: Record<string, { id: string; email: string; full_name: string | null; avatar_url: string | null }> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, email, full_name, avatar_url")
        .in("id", userIds);
      if (profiles) {
        for (const p of profiles) {
          profilesMap[p.id] = p;
        }
      }
    }

    const members = (rawMembers || []).map((m: { user_id: string }) => ({
      ...m,
      profile: profilesMap[m.user_id] || null,
    }));

    return NextResponse.json({ members });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    let supabase, user;
    try {
      ({ supabase, user } = await getAuthenticatedUser());
    } catch {
      return NextResponse.json({ error: "Non authentifie" }, { status: 401 });
    }

    const { email, role = "member" } = await req.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email requis" }, { status: 400 });
    }

    // Create invitation
    const { data: invitation, error } = await supabase
      .from("board_invitations")
      .insert({
        board_id: params.id,
        email: email.toLowerCase().trim(),
        role,
        invited_by: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error("[POST /api/members] Invitation insert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Send invitation email via Resend (non-blocking)
    const { data: board } = await supabase
      .from("boards")
      .select("name")
      .eq("id", params.id)
      .single();

    const inviterName = user.user_metadata?.full_name || user.email || "Un membre";

    // Fire and forget — don't block the response
    sendInvitationEmail({
      email: invitation.email,
      token: invitation.token,
      boardName: board?.name || "Board",
      inviterName,
      role: invitation.role,
    }).catch((err) => {
      console.error("[Members] Email send failed:", err);
    });

    return NextResponse.json({ invitation }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/members] Exception:", err);
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    let supabase, user;
    try {
      ({ supabase, user } = await getAuthenticatedUser());
    } catch {
      return NextResponse.json({ error: "Non authentifie" }, { status: 401 });
    }

    const { user_id, role } = await req.json();

    if (!user_id || !role || !["admin", "member"].includes(role)) {
      return NextResponse.json({ error: "user_id et role (admin|member) requis" }, { status: 400 });
    }

    // Check that the current user is owner or admin of this board
    const { data: callerMember } = await supabase
      .from("board_members")
      .select("role")
      .eq("board_id", params.id)
      .eq("user_id", user.id)
      .single();

    if (!callerMember || !["owner", "admin"].includes(callerMember.role)) {
      return NextResponse.json({ error: "Seul un admin peut changer les roles" }, { status: 403 });
    }

    // Cannot change owner role
    const { data: targetMember } = await supabase
      .from("board_members")
      .select("role")
      .eq("board_id", params.id)
      .eq("user_id", user_id)
      .single();

    if (!targetMember) {
      return NextResponse.json({ error: "Membre introuvable" }, { status: 404 });
    }

    if (targetMember.role === "owner") {
      return NextResponse.json({ error: "Impossible de modifier le role du proprietaire" }, { status: 403 });
    }

    const { error } = await supabase
      .from("board_members")
      .update({ role })
      .eq("board_id", params.id)
      .eq("user_id", user_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, role });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    let supabase;
    try {
      ({ supabase } = await getAuthenticatedUser());
    } catch {
      return NextResponse.json({ error: "Non authentifie" }, { status: 401 });
    }

    const { board_id, user_id } = await req.json();

    const { data, error } = await supabase.rpc("remove_board_member", {
      target_board_id: board_id,
      target_user_id: user_id,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data.success) {
      return NextResponse.json({ error: data.error }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
