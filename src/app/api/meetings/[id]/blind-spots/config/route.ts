import { NextResponse } from "next/server";

/** PATCH /api/meetings/[id]/blind-spots/config — obsolète, mode auto supprimé */
export async function PATCH() {
  return NextResponse.json(
    { success: true, message: "Le mode auto a été supprimé — les angles morts sont exclusivement manuels." },
    { status: 200 }
  );
}
