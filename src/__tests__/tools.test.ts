import { describe, expect, it, vi } from "vitest";
import { ObsidianClient } from "../obsidianClient.js";

/**
 * Lightweight coverage of tool-facing client methods used by vault_read,
 * vault_write, and vault_search (handlers themselves are thin wrappers).
 */
describe("tool client contract", () => {
  const config = {
    apiKey: "k",
    baseUrl: "http://127.0.0.1:27123",
    allowInsecureSsl: false,
  };

  it("read / write / search happy paths", async () => {
    const calls: Array<{ method?: string; url: string; body?: string }> = [];

    const fetchImpl = vi.fn(async (url: string, init?: { method?: string; body?: string; headers?: Record<string, string> }) => {
      calls.push({ method: init?.method, url, body: init?.body });
      if (init?.method === "GET") {
        return jsonResponse(200, "# hi");
      }
      if (init?.method === "PUT") {
        return jsonResponse(204, "");
      }
      if (url.includes("/search/simple/")) {
        return jsonResponse(
          200,
          JSON.stringify([
            {
              filename: "a.md",
              score: 2,
              matches: [{ context: "preview text", match: { start: 0, end: 7 } }],
            },
          ]),
        );
      }
      return jsonResponse(500, "unexpected");
    });

    const client = new ObsidianClient(config, { fetchImpl: fetchImpl as never });

    expect(await client.read("a.md")).toBe("# hi");
    await client.write("a.md", "# hi\n");
    const search = await client.search("preview");
    expect(search[0]?.filename).toBe("a.md");
    expect(search[0]?.matches[0]?.context).toBe("preview text");

    expect(calls.map((c) => c.method)).toEqual(["GET", "PUT", "POST"]);
  });
});

function jsonResponse(status: number, body: string) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    headers: { get: () => null },
    text: async () => body,
    json: async () => (body ? JSON.parse(body) : {}),
  };
}
