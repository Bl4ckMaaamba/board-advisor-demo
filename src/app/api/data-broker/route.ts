import { NextRequest, NextResponse } from "next/server";
import { queryDataBroker } from "@/lib/data-broker";
import { DataBrokerRequestSchema } from "@/lib/data-broker/schemas/query-params";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = DataBrokerRequestSchema.parse(body);
    const response = await queryDataBroker(parsed);

    return NextResponse.json(response, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json(
        { error: "Invalid request", details: String(error) },
        { status: 400 }
      );
    }

    const message = error instanceof Error ? error.message : "Internal server error";
    const code = error instanceof Error && "code" in error ? (error as { code: string }).code : "UNKNOWN";

    return NextResponse.json(
      { error: message, code },
      { status: 500 }
    );
  }
}
