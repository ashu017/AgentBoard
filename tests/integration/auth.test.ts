import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  hasDbEnv,
  applyEnv,
  admin,
  userClient,
  seedTenant,
  seedTask,
  teardownTenant,
  type SeededTenant,
} from "./helpers";
import { generateApiKey } from "../../src/lib/api-key";

const d = hasDbEnv ? describe : describe.skip;
applyEnv();

d("auth foundation (live DB)", () => {
  let A: SeededTenant;
  let B: SeededTenant;

  beforeAll(async () => {
    A = await seedTenant(generateApiKey(), "authA");
    B = await seedTenant(generateApiKey(), "authB");
  });

  afterAll(async () => {
    if (A) await teardownTenant(A);
    if (B) await teardownTenant(B);
  });

  // design.md "Must-have tests" → workspace bootstrap: exactly one per user.
  describe("getOrCreateWorkspace (D2)", () => {
    it("is idempotent — returns the same workspace, never a second row", async () => {
      const { getOrCreateWorkspace } = await import("../../src/lib/workspace");
      const clientA = await userClient(A.userId);

      const w1 = await getOrCreateWorkspace(clientA, A.userId);
      const w2 = await getOrCreateWorkspace(clientA, A.userId);
      expect(w1.id).toBe(w2.id);
      expect(w1.id).toBe(A.workspaceId); // the one seeded

      // DB truly has exactly one workspace for this user.
      const { data } = await admin().from("workspaces").select("id").eq("owner_user_id", A.userId);
      expect(data).toHaveLength(1);
    });

    it("creates a workspace for a brand-new user with none", async () => {
      // New user, no workspace seeded.
      const db = admin();
      const { data: u } = await db.auth.admin.createUser({
        email: `authnew-${Date.now()}@example.test`,
        email_confirm: true,
      });
      const newUserId = u.user!.id;
      try {
        const { getOrCreateWorkspace } = await import("../../src/lib/workspace");
        const client = await userClient(newUserId);
        const ws = await getOrCreateWorkspace(client, newUserId);
        expect(ws.owner_user_id).toBe(newUserId);

        const { data } = await db.from("workspaces").select("id").eq("owner_user_id", newUserId);
        expect(data).toHaveLength(1);
      } finally {
        await db.from("workspaces").delete().eq("owner_user_id", newUserId);
        await db.auth.admin.deleteUser(newUserId);
      }
    });
  });

  // design.md "Must-have tests" → human-plane RLS: user A cannot read user B's rows.
  describe("human-plane RLS deny (CRITICAL)", () => {
    it("user A's session cannot SELECT user B's workspace", async () => {
      const clientA = await userClient(A.userId);
      const { data } = await clientA.from("workspaces").select("*");
      // RLS: A sees only their own workspace, never B's.
      expect(data?.every((w) => w.owner_user_id === A.userId)).toBe(true);
      expect(data?.some((w) => w.id === B.workspaceId)).toBe(false);
    });

    it("user A's session cannot SELECT user B's tasks", async () => {
      await seedTask(B, { title: "B-private", status: "todo" });
      const clientA = await userClient(A.userId);
      const { data } = await clientA.from("tasks").select("*");
      expect(data?.some((t) => t.title === "B-private")).toBe(false);
      expect(data?.every((t) => t.workspace_id === A.workspaceId)).toBe(true);
    });

    it("user A cannot INSERT a task into user B's workspace (RLS WITH CHECK denies)", async () => {
      const clientA = await userClient(A.userId);
      const { error } = await clientA.from("tasks").insert({
        workspace_id: B.workspaceId,
        assigned_agent_id: B.agentId,
        title: "smuggled",
        status: "todo",
        created_by_user_id: A.userId,
      });
      expect(error).not.toBeNull(); // WITH CHECK violation
    });
  });
});
