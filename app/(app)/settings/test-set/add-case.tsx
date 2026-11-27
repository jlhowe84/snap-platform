"use client";

import { useActionState } from "react";
import { useToast } from "@/components/toast";
import { addConversationToTestSet, type TestSetState } from "./actions";

/** On a support conversation: keep it, with our latest reply, as a test case. */
export function AddToTestSet({ conversationId, already }: { conversationId: string; already: boolean }) {
  const [state, action, pending] = useActionState<TestSetState, FormData>(() => addConversationToTestSet(conversationId), null);
  useToast(state);
  return (
    <form action={action} className="space-y-1">
      <button disabled={pending} className="text-sm text-muted hover:text-accent disabled:opacity-60">
        {pending ? "Adding…" : already ? "Refresh in the test set" : "Add to the test set"}
      </button>
      <p className="text-xs text-muted">Keeps this conversation and our latest reply as a case the assistant&apos;s drafts are checked against.</p>
    </form>
  );
}
