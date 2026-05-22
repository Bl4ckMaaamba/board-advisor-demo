import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase-server";

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

    const { data, error } = await supabase
      .from("board_decisions")
      .select("*")
      .eq("board_id", params.id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ decisions: data || [] });
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

    const { subject, description, meeting_id, vote_result } = await req.json();

    if (!subject) {
      return NextResponse.json({ error: "Sujet requis" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("board_decisions")
      .insert({
        board_id: params.id,
        meeting_id: meeting_id || null,
        subject,
        description: description || null,
        vote_result: vote_result || null,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ decision: data }, { status: 201 });
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

    const { decision_id, subject, description, vote_result, status } = await req.json();

    if (!decision_id) {
      return NextResponse.json({ error: "decision_id requis" }, { status: 400 });
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (subject !== undefined) updates.subject = subject;
    if (description !== undefined) updates.description = description;
    if (vote_result !== undefined) updates.vote_result = vote_result;
    if (status !== undefined) updates.status = status;

    const { data, error } = await supabase
      .from("board_decisions")
      .update(updates)
      .eq("id", decision_id)
      .eq("board_id", params.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ decision: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
