import { describe, it, expect } from "vitest";
import { rollUpByIdea, type IdeaRollupInput } from "./ideas";

describe("ideas: rollUpByIdea", () => {
  const ideas = [
    { id: "i1", name: "AgentBoard" },
    { id: "i2", name: "bloodonor.com" },
  ];
  const projects = [
    { id: "p1", idea_id: "i1" },
    { id: "p2", idea_id: "i2" },
  ];
  const tasks = [
    { parent_id: "p1", status: "in_review", pr_url: "http://x" },
    { parent_id: "p1", status: "in_progress", pr_url: null },
    { parent_id: "p1", status: "done", pr_url: null },
    { parent_id: "p2", status: "in_progress", pr_url: null },
  ];
  const input: IdeaRollupInput = { ideas, projects, tasks };

  it("aggregates per-idea counts from its projects' tasks", () => {
    const rows = rollUpByIdea(input);
    const ab = rows.find((r) => r.id === "i1")!;
    expect(ab).toMatchObject({ name: "AgentBoard", inReview: 1, inProgress: 1, done: 1, prsRaised: 1 });
    const bd = rows.find((r) => r.id === "i2")!;
    expect(bd).toMatchObject({ inReview: 0, inProgress: 1, done: 0, prsRaised: 0 });
  });

  it("returns a row for an idea with no projects (all zeros)", () => {
    const rows = rollUpByIdea({ ideas: [...ideas, { id: "i3", name: "office" }], projects, tasks });
    expect(rows.find((r) => r.id === "i3")).toMatchObject({ inReview: 0, inProgress: 0, done: 0, prsRaised: 0 });
  });
});
