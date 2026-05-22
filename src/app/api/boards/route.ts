import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase-server";

export async function GET() {
  try {
    let supabase;
    try {
      ({ supabase } = await getAuthenticatedUser());
    } catch {
      return NextResponse.json({ error: "Non authentifie" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("my_boards")
      .select("id, name, description, sector, role, joined_at")
      .order("name");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ boards: data || [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    let supabase, user;
    try {
      ({ supabase, user } = await getAuthenticatedUser());
    } catch {
      return NextResponse.json({ error: "Non authentifie" }, { status: 401 });
    }

    const body = await req.json();
    const { name, description, sector } = body;

    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "Nom requis" }, { status: 400 });
    }

    const insert: Record<string, unknown> = {
      name,
      description: description || null,
      sector: sector || null,
      owner_id: user.id,
    };
    // Optional profile fields
    const profileFields = [
      "company_siren", "company_legal_form", "company_headquarters",
      "company_size", "company_revenue", "company_employees",
      "company_geo_zones", "company_listed", "company_strategic_context",
      "competitors", "key_clients", "tracked_kpis",
    ];
    for (const f of profileFields) {
      if (body[f] !== undefined && body[f] !== null) insert[f] = body[f];
    }

    const { data, error } = await supabase
      .from("boards")
      .insert(insert)
      .select()
      .single();

    if (error) {
      console.error("[POST /api/boards] Supabase error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ board: data }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/boards] Exception:", err);
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
