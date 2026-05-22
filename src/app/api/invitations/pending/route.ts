import { NextResponse } from "next/server";
import { getAuthenticatedUser, createSupabaseServiceClient } from "@/lib/supabase-server";

/**
 * GET /api/invitations/pending — Get pending invitations for the current user
 * Uses service role client to bypass RLS on boards (invitee isn't a member yet)
 */
export async function GET() {
  try {
    let user;
    try {
      ({ user } = await getAuthenticatedUser());
    } catch {
      return NextResponse.json({ error: "Non authentifie" }, { status: 401 });
    }

    const userEmail = user.email;
    if (!userEmail) {
      return NextResponse.json({ invitations: [] });
    }

    // Use service role to bypass RLS — the invitee can't see boards yet
    const serviceClient = createSupabaseServiceClient();

    const { data, error } = await serviceClient
      .from("board_invitations")
      .select(`
        id, email, role, status, token, expires_at, created_at,
        board:boards(id, name, sector, description)
      `)
      .eq("email", userEmail.toLowerCase())
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[GET /api/invitations/pending] Error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Filter out expired invitations
    const now = new Date();
    const valid = (data || []).filter(
      (inv) => new Date(inv.expires_at) > now && inv.board !== null
    );

    return NextResponse.json({ invitations: valid });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
