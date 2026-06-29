"use server";
import { revalidatePath } from "next/cache";
import {
  createAgent as _createAgent,
  revokeAgent as _revokeAgent,
  createTask as _createTask,
  type CreatedAgent,
} from "@/lib/manager-actions";

// Server-action wrappers for the manager UI forms. Thin: validate-via-lib,
// revalidate the affected route. Each returns a typed result the client renders
// with the pending pattern (design.md 2A — not optimistic).

export interface ActionResult<T = undefined> {
  ok: boolean;
  error?: string;
  data?: T;
}

export async function createAgentAction(
  _prev: ActionResult<CreatedAgent> | null,
  formData: FormData
): Promise<ActionResult<CreatedAgent>> {
  try {
    const name = String(formData.get("name") ?? "");
    const description = String(formData.get("description") ?? "");
    const agent = await _createAgent(name, description);
    revalidatePath("/agents");
    return { ok: true, data: agent };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to create agent" };
  }
}

export async function revokeAgentAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    await _revokeAgent(String(formData.get("agentId") ?? ""));
    revalidatePath("/agents");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to revoke" };
  }
}

export async function createTaskAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    const title = String(formData.get("title") ?? "");
    const assignee = String(formData.get("assignedAgentId") ?? "");
    const description = String(formData.get("description") ?? "");
    await _createTask(title, assignee, description);
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to create task" };
  }
}
