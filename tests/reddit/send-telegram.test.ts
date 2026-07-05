import { describe, it, expect } from "vitest";
import { buildSendUrl, sendMessage } from "../../scripts/reddit/send-telegram.mjs";

describe("buildSendUrl", () => {
  it("builds the Bot API sendMessage URL from the token", () => {
    expect(buildSendUrl("123:ABC")).toBe("https://api.telegram.org/bot123:ABC/sendMessage");
  });
  it("throws when the token is missing", () => {
    expect(() => buildSendUrl("")).toThrow(/token/i);
  });
});

describe("sendMessage", () => {
  it("POSTs chat_id + text as JSON and resolves on ok", async () => {
    let seenUrl, seenBody, seenHeaders;
    const fetchImpl = async (url, opts) => {
      seenUrl = url; seenBody = JSON.parse(opts.body); seenHeaders = opts.headers;
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    };
    await sendMessage({ token: "123:ABC", chatId: "999", text: "hello" }, { fetchImpl });
    expect(seenUrl).toBe("https://api.telegram.org/bot123:ABC/sendMessage");
    expect(seenHeaders["Content-Type"]).toBe("application/json");
    expect(seenBody).toEqual({ chat_id: "999", text: "hello", disable_web_page_preview: true });
  });

  it("throws a clear error when Telegram returns non-ok", async () => {
    const fetchImpl = async () => ({ ok: false, status: 400, text: async () => '{"description":"chat not found"}' });
    await expect(
      sendMessage({ token: "123:ABC", chatId: "bad", text: "x" }, { fetchImpl })
    ).rejects.toThrow(/400|chat not found/i);
  });

  it("throws when chatId or text is missing", async () => {
    const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({}) });
    await expect(sendMessage({ token: "t", chatId: "", text: "x" }, { fetchImpl })).rejects.toThrow(/chat/i);
    await expect(sendMessage({ token: "t", chatId: "1", text: "" }, { fetchImpl })).rejects.toThrow(/text/i);
  });
});
