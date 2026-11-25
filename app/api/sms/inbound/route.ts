import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { replyIntent } from "@/lib/sms/keywords";
import { toUsMobile } from "@/lib/sms/phone";
import { twilioKeys, validTwilioSignature } from "@/lib/sms/twilio";

// Twilio posts each reply to a company number here. Only a signed request is
// read. A STOP-type reply becomes a "no" for every crew member whose newest
// answer was yes at that number, and START a "yes" again for someone who had
// said yes at that number before. Nothing else in a reply is stored, and no
// reply is sent from here (the carrier answers STOP, START and HELP itself).
export const dynamic = "force-dynamic";

const EMPTY = new NextResponse("<Response/>", { headers: { "Content-Type": "text/xml" } });

function publicUrl(request: NextRequest) {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? url.host;
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return `${proto}://${host}${url.pathname}${url.search}`;
}

export async function POST(request: NextRequest) {
  const keys = twilioKeys();
  if (!keys) return NextResponse.json({ error: "texts are not set up" }, { status: 404 });
  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const params: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string") params[k] = v;
  if (!validTwilioSignature(keys.authToken, publicUrl(request), params, request.headers.get("x-twilio-signature"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (params.AccountSid !== keys.accountSid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const intent = replyIntent(params.Body);
  const from = toUsMobile(params.From);
  if (!intent || !from) return EMPTY.clone();

  const admin = createAdminClient();
  const { data: seen } = await admin.from("sms_consents").select("company_id, crew_member_id").eq("phone", from);
  const people = new Map((seen ?? []).map((r) => [r.crew_member_id, r.company_id]));
  for (const [crewId, companyId] of people) {
    const { data: latest } = await admin
      .from("sms_consents")
      .select("opted_in, phone")
      .eq("crew_member_id", crewId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (intent === "stop" && latest?.opted_in && latest.phone === from) {
      await admin.from("sms_consents").insert({ company_id: companyId, crew_member_id: crewId, phone: null, opted_in: false, source: "reply_stop", wording_version: "reply" });
    }
    if (intent === "start" && latest && !latest.opted_in) {
      await admin.from("sms_consents").insert({ company_id: companyId, crew_member_id: crewId, phone: from, opted_in: true, source: "reply_start", wording_version: "reply" });
    }
  }
  return EMPTY.clone();
}
