import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase-server";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    let supabase;
    try {
      ({ supabase } = await getAuthenticatedUser());
    } catch {
      return NextResponse.json({ error: "Non authentifie" }, { status: 401 });
    }

    const url = new URL(req.url);
    const statusFilter = url.searchParams.get("status");
    const assigneeFilter = url.searchParams.get("assignee_id");

    let query = supabase
      .from("board_actions")
      .select("*")
      .eq("board_id", params.id)
      .order("created_at", { ascending: false });

    if (statusFilter) {
      query = query.eq("status", statusFilter);
    }
    if (assigneeFilter) {
      query = query.eq("assignee_id", assigneeFilter);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Fetch assignee profiles
    const assigneeIds = Array.from(new Set((data || []).map((a: { assignee_id: string | null }) => a.assignee_id).filter(Boolean))) as string[];
    const profilesMap: Record<string, { full_name: string | null; email: string | null; avatar_url: string | null }> = {};

    if (assigneeIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url")
        .in("id", assigneeIds);
      if (profiles) {
        for (const p of profiles) {
          profilesMap[p.id] = p;
        }
      }
    }

    const actions = (data || []).map((a: { assignee_id: string | null }) => ({
      ...a,
      assignee_profile: a.assignee_id ? profilesMap[a.assignee_id] || null : null,
    }));

    return NextResponse.json({ actions });
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

    const { description, decision_id, meeting_id, assignee_id, assignee_name, deadline, priority } = await req.json();

    if (!description) {
      return NextResponse.json({ error: "Description requise" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("board_actions")
      .insert({
        board_id: params.id,
        decision_id: decision_id || null,
        meeting_id: meeting_id || null,
        description,
        assignee_id: assignee_id || null,
        assignee_name: assignee_name || null,
        deadline: deadline || null,
        priority: priority || "medium",
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ action: data }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    let supabase;
    try {
      ({ supabase } = await getAuthenticatedUser());
    } catch {
      return NextResponse.json({ error: "Non authentifie" }, { status: 401 });
    }

    const { action_id, description, assignee_id, assignee_name, deadline, status, priority, notes } = await req.json();

    if (!action_id) {
      return NextResponse.json({ error: "action_id requis" }, { status: 400 });
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (description !== undefined) updates.description = description;
    if (assignee_id !== undefined) updates.assignee_id = assignee_id;
    if (assignee_name !== undefined) updates.assignee_name = assignee_name;
    if (deadline !== undefined) updates.deadline = deadline;
    if (status !== undefined) {
      updates.status = status;
      if (status === "done") updates.completed_at = new Date().toISOString();
    }
    if (priority !== undefined) updates.priority = priority;
    if (notes !== undefined) updates.notes = notes;

    const { data, error } = await supabase
      .from("board_actions")
      .update(updates)
      .eq("id", action_id)
      .eq("board_id", params.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ action: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    let supabase;
    try {
      ({ supabase } = await getAuthenticatedUser());
    } catch {
      return NextResponse.json({ error: "Non authentifie" }, { status: 401 });
    }

    const { action_id } = await req.json();

    if (!action_id) {
      return NextResponse.json({ error: "action_id requis" }, { status: 400 });
    }

    const { error } = await supabase
      .from("board_actions")
      .delete()
      .eq("id", action_id)
      .eq("board_id", params.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
