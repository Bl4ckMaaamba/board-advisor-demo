import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase-server";

/**
 * GET /api/meetings/[id]/participants — List participants with profile info
 */
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

    const meetingId = params.id;

    // Fetch participants
    const { data: parts, error } = await supabase
      .from("meeting_participants")
      .select("id, meeting_id, user_id, email, role, type, status")
      .eq("meeting_id", meetingId)
      .order("role", { ascending: true });

    if (error) {
      console.error("[GET participants]", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Fetch profiles for all user_ids
    const userIds = (parts || []).map((p) => p.user_id).filter(Boolean) as string[];
    const profilesMap: Record<string, { full_name: string | null; avatar_url: string | null; email: string | null }> = {};

    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url, email")
        .in("id", userIds);

      if (profiles) {
        for (const p of profiles) {
          profilesMap[p.id] = { full_name: p.full_name, avatar_url: p.avatar_url, email: p.email };
        }
      }
    }

    // Merge profiles into participants
    const participants = (parts || []).map((p) => ({
      ...p,
      profiles: p.user_id ? profilesMap[p.user_id] || null : null,
    }));

    return NextResponse.json({ participants });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/meetings/[id]/participants — Add an exceptional guest
 * Body: { email: string, role?: "member" }
 */
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

    const meetingId = params.id;
    const { email, role = "member" } = await req.json();

    if (!email) {
      return NextResponse.json({ error: "email requis" }, { status: 400 });
    }

    // Verify caller is admin of this meeting or board
    const { data: meeting } = await supabase
      .from("meetings")
      .select("board_id, admin_user_id")
      .eq("id", meetingId)
      .single();

    if (!meeting) {
      return NextResponse.json({ error: "Reunion introuvable" }, { status: 404 });
    }

    const isAdmin = meeting.admin_user_id === user.id;

    if (!isAdmin) {
      const { data: boardMember } = await supabase
        .from("board_members")
        .select("role")
        .eq("board_id", meeting.board_id)
        .eq("user_id", user.id)
        .single();

      if (!boardMember || !["owner", "admin"].includes(boardMember.role)) {
        return NextResponse.json({ error: "Seul un admin peut ajouter des participants" }, { status: 403 });
      }
    }

    // Check if participant already exists
    const { data: existing } = await supabase
      .from("meeting_participants")
      .select("id")
      .eq("meeting_id", meetingId)
      .eq("email", email)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: "Ce participant est deja ajoute" }, { status: 409 });
    }

    // Look up user_id from profiles if they have an account
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    const { data: participant, error } = await supabase
      .from("meeting_participants")
      .insert({
        meeting_id: meetingId,
        user_id: profile?.id || null,
        email,
        role,
        type: "exceptional",
        status: "invited",
      })
      .select("id, meeting_id, user_id, email, role, type, status")
      .single();

    if (error) {
      console.error("[POST participants]", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ participant }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/meetings/[id]/participants — Update participant role
 * Body: { participant_id: string, role: "admin" | "member" }
 */
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

    const meetingId = params.id;
    const { participant_id, role } = await req.json();

    if (!participant_id || !role) {
      return NextResponse.json({ error: "participant_id et role requis" }, { status: 400 });
    }

    if (!["admin", "member"].includes(role)) {
      return NextResponse.json({ error: "Role invalide" }, { status: 400 });
    }

    // Verify caller is admin
    const { data: meeting } = await supabase
      .from("meetings")
      .select("board_id, admin_user_id")
      .eq("id", meetingId)
      .single();

    if (!meeting) {
      return NextResponse.json({ error: "Reunion introuvable" }, { status: 404 });
    }

    const isAdmin = meeting.admin_user_id === user.id;
    if (!isAdmin) {
      const { data: boardMember } = await supabase
        .from("board_members")
        .select("role")
        .eq("board_id", meeting.board_id)
        .eq("user_id", user.id)
        .single();

      if (!boardMember || !["owner", "admin"].includes(boardMember.role)) {
        return NextResponse.json({ error: "Seul un admin peut modifier les roles" }, { status: 403 });
      }
    }

    // If promoting to admin, transfer admin role (demote current admin to member)
    if (role === "admin") {
      // Get the participant being promoted
      const { data: targetParticipant } = await supabase
        .from("meeting_participants")
        .select("user_id")
        .eq("id", participant_id)
        .single();

      if (targetParticipant?.user_id) {
        // Demote current admin to member
        await supabase
          .from("meeting_participants")
          .update({ role: "member" })
          .eq("meeting_id", meetingId)
          .eq("role", "admin");

        // Update meeting admin_user_id
        await supabase
          .from("meetings")
          .update({ admin_user_id: targetParticipant.user_id })
          .eq("id", meetingId);
      }
    }

    const { data: updated, error } = await supabase
      .from("meeting_participants")
      .update({ role })
      .eq("id", participant_id)
      .select("id, meeting_id, user_id, email, role, type, status")
      .single();

    if (error) {
      console.error("[PATCH participants]", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ participant: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/meetings/[id]/participants — Remove a participant
 * Body: { participant_id: string }
 */
export async function DELETE(
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

    const meetingId = params.id;
    const { participant_id } = await req.json();

    if (!participant_id) {
      return NextResponse.json({ error: "participant_id requis" }, { status: 400 });
    }

    // Verify caller is admin
    const { data: meeting } = await supabase
      .from("meetings")
      .select("board_id, admin_user_id")
      .eq("id", meetingId)
      .single();

    if (!meeting) {
      return NextResponse.json({ error: "Reunion introuvable" }, { status: 404 });
    }

    const isAdmin = meeting.admin_user_id === user.id;
    if (!isAdmin) {
      const { data: boardMember } = await supabase
        .from("board_members")
        .select("role")
        .eq("board_id", meeting.board_id)
        .eq("user_id", user.id)
        .single();

      if (!boardMember || !["owner", "admin"].includes(boardMember.role)) {
        return NextResponse.json({ error: "Seul un admin peut supprimer des participants" }, { status: 403 });
      }
    }

    // Prevent removing the admin
    const { data: target } = await supabase
      .from("meeting_participants")
      .select("role")
      .eq("id", participant_id)
      .single();

    if (target?.role === "admin") {
      return NextResponse.json({ error: "Impossible de supprimer l'admin de la reunion" }, { status: 400 });
    }

    const { error } = await supabase
      .from("meeting_participants")
      .delete()
      .eq("id", participant_id)
      .eq("meeting_id", meetingId);

    if (error) {
      console.error("[DELETE participants]", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
