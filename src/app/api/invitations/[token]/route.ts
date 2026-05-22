import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, createSupabaseServiceClient } from "@/lib/supabase-server";

/**
 * GET /api/invitations/[token] — Verify invitation token
 * Uses service role to bypass RLS on boards (invitee isn't a member yet)
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    // Still require auth — we need to know who's viewing
    try {
      await getAuthenticatedUser();
    } catch {
      return NextResponse.json({ error: "Non authentifie" }, { status: 401 });
    }

    // Use service role to bypass RLS — invitee can't see boards yet
    const serviceClient = createSupabaseServiceClient();

    const { data, error } = await serviceClient
      .from("board_invitations")
      .select(`
        id, email, role, status, expires_at, created_at,
        board:boards(id, name, sector, description)
      `)
      .eq("token", params.token)
      .eq("status", "pending")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: "Invitation introuvable ou expiree" },
        { status: 404 }
      );
    }

    // Check expiry
    if (new Date(data.expires_at) < new Date()) {
      return NextResponse.json(
        { error: "Cette invitation a expire" },
        { status: 410 }
      );
    }

    return NextResponse.json({ invitation: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/invitations/[token] — Accept invitation
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    let supabase;
    try {
      ({ supabase } = await getAuthenticatedUser());
    } catch {
      return NextResponse.json({ error: "Non authentifie" }, { status: 401 });
    }

    const { data, error } = await supabase.rpc("accept_board_invitation", {
      invitation_token: params.token,
    });

    if (error) {
      console.error("[POST /api/invitations] RPC error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data?.success) {
      return NextResponse.json(
        { error: data?.error || "Impossible d'accepter l'invitation" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      board_id: data.board_id,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
