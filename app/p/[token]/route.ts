import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hashPortalToken, looksLikePortalToken } from "@/lib/portal/token";

// A coordinator's portal link. No sign-up: the link finds the contact it was
// made for, makes sure that person has an account, links them to the job as a
// coordinator (portal_admit), and starts a normal session for them. From then
// on RLS decides what they see, exactly as for staff.
// A link never opens a session for a staff email (the database refuses).
export async function GET(request: NextRequest, ctx: RouteContext<"/p/[token]">) {
  const { token } = await ctx.params;
  const origin = request.nextUrl.origin;
  const fail = (reason: "expired" | "staff" | "error") =>
    NextResponse.redirect(`${origin}/p/expired?reason=${reason}`);

  if (!looksLikePortalToken(token)) return fail("expired");

  const admin = createAdminClient();
  const { data: rows, error: lookupError } = await admin.rpc("portal_link_lookup", {
    p_token_hash: hashPortalToken(token),
  });
  if (lookupError) return fail(lookupError.message.includes("staff") ? "staff" : "error");
  const link = rows?.[0];
  if (!link) return fail("expired");

  let profileId = link.profile_id;
  if (!profileId) {
    const { data: created, error } = await admin.auth.admin.createUser({
      email: link.email,
      email_confirm: true,
      user_metadata: { full_name: link.full_name },
    });
    if (error || !created.user) return fail("error");
    profileId = created.user.id;
  }

  const { data: jobId, error: admitError } = await admin.rpc("portal_admit", {
    p_link_id: link.link_id,
    p_profile_id: profileId,
  });
  if (admitError || !jobId) return fail(admitError?.message.includes("staff") ? "staff" : "error");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user?.id !== profileId) {
    const { data: generated, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: link.email,
    });
    const tokenHash = generated?.properties?.hashed_token;
    if (linkError || !tokenHash) return fail("error");
    const { error: verifyError } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
    if (verifyError) return fail("error");
  }

  return NextResponse.redirect(`${origin}/portal/${jobId}`);
}
