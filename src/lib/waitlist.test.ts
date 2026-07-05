import { describe, it, expect } from "vitest";
import { isValidEmail, classifySubmission, isInsertSuccess } from "./waitlist";

// DECISIONS D-WAITLIST — the pre-launch demand capture's decision rules:
// email validity mirrors the DB CHECK, the honeypot silently drops bots, and a
// duplicate signup (23505) is a success, not an error.

describe("waitlist: isValidEmail", () => {
  it("accepts a normal address", () => {
    expect(isValidEmail("you@company.com")).toBe(true);
  });
  it("trims surrounding whitespace before checking", () => {
    expect(isValidEmail("  you@company.com  ")).toBe(true);
  });
  it.each(["", "you", "you@", "@company.com", "you@company", "a b@c.com", "you@company.com "])(
    "rejects malformed: %j",
    (bad) => {
      // note: the trailing-space case passes because we trim first
      expect(isValidEmail(bad)).toBe(bad === "you@company.com ");
    }
  );
});

describe("waitlist: classifySubmission", () => {
  it("routes a valid, honeypot-free submission to insert", () => {
    expect(classifySubmission("you@company.com", "")).toBe("insert");
  });
  it("treats a filled honeypot as a bot regardless of email validity", () => {
    expect(classifySubmission("you@company.com", "http://spam")).toBe("honeypot");
    expect(classifySubmission("not-an-email", "anything")).toBe("honeypot");
  });
  it("flags an invalid email (empty honeypot) as invalid", () => {
    expect(classifySubmission("nope", "")).toBe("invalid");
  });
});

describe("waitlist: isInsertSuccess", () => {
  it("treats no error as success", () => {
    expect(isInsertSuccess(null)).toBe(true);
    expect(isInsertSuccess(undefined)).toBe(true);
  });
  it("treats a unique violation (already on the list) as success", () => {
    expect(isInsertSuccess("23505")).toBe(true);
  });
  it("treats any other error code as failure", () => {
    expect(isInsertSuccess("23514")).toBe(false); // check_violation
    expect(isInsertSuccess("42501")).toBe(false); // insufficient_privilege
  });
});
