import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Google sign-in returns here with a one-time code. Access itself comes from
// a staff invite (applied by the database when the profile is created), so a
// person with no invite lands on /waiting rather than seeing any data.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }
  return NextResponse.redirect(`${origin}/login?error=signin`);
}

function safeNext(value: string | null) {
  // Only same-site paths, never "//host" or a full URL.
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}
