const MESSAGES: Record<string, { title: string; body: string }> = {
  expired: {
    title: "This link has expired",
    body: "Portal links stay open until a while after your photo day. Reply to the email it came in and we will send a fresh one.",
  },
  staff: {
    title: "This link is for a league contact",
    body: "Staff accounts sign in with Google instead. Use the normal sign-in page.",
  },
  error: {
    title: "We could not open your portal",
    body: "Something went wrong on our side. Try the link again in a minute, or reply to the email it came in.",
  },
  signin: {
    title: "Open the link from your email",
    body: "Your photo day portal opens from the personal link we emailed you. There is no password to remember.",
  },
};

export default async function PortalLinkProblem({ searchParams }: PageProps<"/p/expired">) {
  const { reason } = await searchParams;
  const m = MESSAGES[typeof reason === "string" ? reason : "expired"] ?? MESSAGES.expired;
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Photo day portal</p>
      <h1 className="font-display text-4xl font-semibold uppercase tracking-wide">{m.title}</h1>
      <p className="text-muted">{m.body}</p>
    </main>
  );
}
