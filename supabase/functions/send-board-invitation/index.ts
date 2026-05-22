import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const APP_URL = Deno.env.get("APP_URL") || "http://localhost:3000";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY not configured");
    }

    const { email, token, board_name, inviter_name } = await req.json();

    if (!email || !token) {
      return new Response(
        JSON.stringify({ error: "email and token required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const inviteUrl = `${APP_URL}/invite/board/${token}`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Board Advisor <noreply@boardadvisor.app>",
        to: [email],
        subject: `Invitation au board "${board_name}"`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
            <h2 style="color: #111; font-size: 22px; margin-bottom: 8px;">Invitation au board</h2>
            <p style="color: #555; font-size: 15px; line-height: 1.6;">
              <strong>${inviter_name}</strong> vous invite a rejoindre le board <strong>"${board_name}"</strong> sur Board Advisor.
            </p>
            <a href="${inviteUrl}" style="display: inline-block; margin-top: 24px; padding: 12px 28px; background: #111; color: #fff; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 600;">
              Accepter l'invitation
            </a>
            <p style="color: #999; font-size: 12px; margin-top: 32px;">
              Ce lien expire dans 7 jours. Si vous n'avez pas demande cette invitation, ignorez cet email.
            </p>
          </div>
        `,
      }),
    });

    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(`Resend error: ${JSON.stringify(errorData)}`);
    }

    const data = await res.json();
    return new Response(
      JSON.stringify({ success: true, id: data.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
