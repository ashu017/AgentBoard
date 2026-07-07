"use server";
import { revalidatePath } from "next/cache";
import {
  createAgent as _createAgent,
  updateAgent as _updateAgent,
  revokeAgent as _revokeAgent,
  deleteAgent as _deleteAgent,
  createTask as _createTask,
  createChildTask as _createChildTask,
  createProject as _createProject,
  updateTask as _updateTask,
  updateProject as _updateProject,
  deleteTask as _deleteTask,
  moveTask as _moveTask,
  resolveReview as _resolveReview,
  type CreatedAgent,
  type CreatedProject,
  type ReviewVerdict,
} from "@/lib/manager-actions";

// Server-action wrappers for the manager UI forms. Thin: validate-via-lib,
// revalidate the affected route. Each returns a typed result the client renders
// with the pending pattern (design.md 2A — not optimistic).

export interface ActionResult<T = undefined> {
  ok: boolean;
  error?: string;
  data?: T;
}

/** Coerce a raw form value into a valid task/project priority (defaults medium). */
function normalizePriority(raw: FormDataEntryValue | null): "high" | "medium" | "low" {
  const v = String(raw ?? "");
  return v === "high" || v === "low" ? v : "medium";
}

export async function createAgentAction(
  _prev: ActionResult<CreatedAgent> | null,
  formData: FormData
): Promise<ActionResult<CreatedAgent>> {
  try {
    const name = String(formData.get("name") ?? "");
    const description = String(formData.get("description") ?? "");
    const agent = await _createAgent(name, description);
    revalidatePath("/board/agents");
    revalidatePath("/board"); // board's assignee list + no-agents state depend on this
    return { ok: true, data: agent };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to create agent" };
  }
}

export async function updateAgentAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    const agentId = String(formData.get("agentId") ?? "");
    const name = String(formData.get("name") ?? "");
    const description = String(formData.get("description") ?? "");
    await _updateAgent(agentId, name, description);
    revalidatePath("/board/agents");
    revalidatePath("/board");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to update agent" };
  }
}

export async function revokeAgentAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    await _revokeAgent(String(formData.get("agentId") ?? ""));
    revalidatePath("/board/agents");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to revoke" };
  }
}

export async function deleteAgentAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    await _deleteAgent(String(formData.get("agentId") ?? ""));
    revalidatePath("/board/agents");
    revalidatePath("/board");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to delete" };
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
    const projectId = String(formData.get("projectId") ?? "");
    const priority = normalizePriority(formData.get("priority"));
    await _createTask(title, assignee, description, projectId || undefined, priority);
    revalidatePath("/board");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to create task" };
  }
}

export async function createProjectAction(
  _prev: ActionResult<CreatedProject> | null,
  formData: FormData
): Promise<ActionResult<CreatedProject>> {
  try {
    const title = String(formData.get("title") ?? "");
    const leadAgentId = String(formData.get("leadAgentId") ?? "");
    const description = String(formData.get("description") ?? "");
    const spec = String(formData.get("spec") ?? "");
    const priority = normalizePriority(formData.get("priority"));
    const project = await _createProject(title, leadAgentId || undefined, description, priority, spec);
    revalidatePath("/board");
    return { ok: true, data: project };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to create project" };
  }
}

export async function createChildTaskAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    const parentTaskId = String(formData.get("parentTaskId") ?? "");
    const title = String(formData.get("title") ?? "");
    const description = String(formData.get("description") ?? "");
    await _createChildTask(parentTaskId, title, description);
    revalidatePath("/board");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to add subtask" };
  }
}

export async function updateTaskAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    const taskId = String(formData.get("taskId") ?? "");
    const title = String(formData.get("title") ?? "");
    const description = String(formData.get("description") ?? "");
    await _updateTask(taskId, title, description);
    revalidatePath("/board");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to update task" };
  }
}

export async function updateProjectAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    const projectId = String(formData.get("projectId") ?? "");
    const title = String(formData.get("title") ?? "");
    const leadAgentId = String(formData.get("leadAgentId") ?? "");
    const description = String(formData.get("description") ?? "");
    const spec = String(formData.get("spec") ?? "");
    await _updateProject(projectId, title, leadAgentId || undefined, description, spec);
    revalidatePath("/board");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to update project" };
  }
}

export async function deleteTaskAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    const taskId = String(formData.get("taskId") ?? "");
    await _deleteTask(taskId);
    revalidatePath("/board");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to delete" };
  }
}

/**
 * Resolve an in_review task from the board (approval loop AL-E). Form-based:
 * the verdict comes from the submit button's value; optional selectedOptionId +
 * note carry the chosen option / manager note.
 */
export async function resolveReviewAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    const taskId = String(formData.get("taskId") ?? "");
    const verdict = String(formData.get("verdict") ?? "") as ReviewVerdict;
    const selectedOptionId = String(formData.get("selectedOptionId") ?? "");
    const note = String(formData.get("note") ?? "");
    await _resolveReview(taskId, verdict, selectedOptionId || undefined, note || undefined);
    revalidatePath("/board");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to resolve review" };
  }
}

/**
 * Move a task to a new status (drag-and-drop). Called directly with args (not a
 * form). Returns ActionResult so the board can surface an illegal-move error.
 */
export async function moveTaskAction(taskId: string, to: string): Promise<ActionResult> {
  try {
    await _moveTask(taskId, to);
    revalidatePath("/board");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to move task" };
  }
}
