"use client";
import { useActionState, useEffect } from "react";
import { createIdeaAction, type ActionResult } from "@/app/actions";
import { Modal } from "@/app/_components/Modal";

export function IdeaModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [state, formAction, pending] = useActionState<ActionResult<{ id: string; name: string }> | null, FormData>(createIdeaAction, null);
  useEffect(() => { if (state?.ok) onClose(); }, [state]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Modal open={open} onClose={onClose} title="New idea" systemTag="SYS:: NEW IDEA" variant="figma">
      <form action={formAction}>
        <input name="name" required placeholder="Idea name (e.g. bloodonor.com)" className="w-full min-w-0 border border-line bg-paper px-3 py-2 text-sm" />
        {state && !state.ok && <p className="mt-2 text-sm text-magenta">{state.error}</p>}
        <div className="mt-4 flex gap-2">
          <button type="submit" disabled={pending} className="bg-orange px-4 py-2 text-sm font-medium text-paper disabled:opacity-60">
            {pending ? "Creating…" : "Create idea"}
          </button>
          <button type="button" onClick={onClose} className="border border-line px-4 py-2 text-sm">Cancel</button>
        </div>
      </form>
    </Modal>
  );
}
