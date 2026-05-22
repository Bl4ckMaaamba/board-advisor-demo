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

    const { data: board, error } = await supabase
      .from("boards")
      .select("*")
      .eq("id", params.id)
      .single();

    if (error || !board) {
      return NextResponse.json({ error: "Board non trouve" }, { status: 404 });
    }

    // Get members
    const { data: rawMembers } = await supabase
      .from("board_members")
      .select("*")
      .eq("board_id", params.id)
      .order("joined_at");

    // Get profiles for all member user_ids
    const memberUserIds = (rawMembers || []).map((m: { user_id: string }) => m.user_id);
    const profilesMap: Record<string, { id: string; email: string; full_name: string | null; avatar_url: string | null }> = {};
    if (memberUserIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, email, full_name, avatar_url")
        .in("id", memberUserIds);
      if (profiles) {
        for (const p of profiles) {
          profilesMap[p.id] = p;
        }
      }
    }

    // Merge members with their profiles
    const members = (rawMembers || []).map((m: { user_id: string }) => ({
      ...m,
      profile: profilesMap[m.user_id] || null,
    }));

    // Get pending invitations
    const { data: invitations } = await supabase
      .from("board_invitations")
      .select("*")
      .eq("board_id", params.id)
      .eq("status", "pending");

    return NextResponse.json({
      board,
      members: members || [],
      invitations: invitations || [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(
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

    const body = await req.json();
    const {
      name, description, sector,
      company_siren, company_legal_form, company_headquarters,
      company_size, company_revenue, company_employees,
      company_geo_zones, company_listed, company_strategic_context,
      competitors, key_clients, tracked_kpis,
    } = body;

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (sector !== undefined) updates.sector = sector;
    if (company_siren !== undefined) updates.company_siren = company_siren;
    if (company_legal_form !== undefined) updates.company_legal_form = company_legal_form;
    if (company_headquarters !== undefined) updates.company_headquarters = company_headquarters;
    if (company_size !== undefined) updates.company_size = company_size;
    if (company_revenue !== undefined) updates.company_revenue = company_revenue;
    if (company_employees !== undefined) updates.company_employees = company_employees;
    if (company_geo_zones !== undefined) updates.company_geo_zones = company_geo_zones;
    if (company_listed !== undefined) updates.company_listed = company_listed;
    if (company_strategic_context !== undefined) updates.company_strategic_context = company_strategic_context;
    if (competitors !== undefined) updates.competitors = competitors;
    if (key_clients !== undefined) updates.key_clients = key_clients;
    if (tracked_kpis !== undefined) updates.tracked_kpis = tracked_kpis;

    const { data, error } = await supabase
      .from("boards")
      .update(updates)
      .eq("id", params.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ board: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
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

    const { error } = await supabase
      .from("boards")
      .delete()
      .eq("id", params.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
