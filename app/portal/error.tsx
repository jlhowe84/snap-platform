"use client";

import { PageError } from "@/components/page-states";

export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  return <PageError error={error} retry={retry} />;
}
