import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../config.js";
import { ObsidianApiError } from "../errors.js";
import { ObsidianClient } from "../obsidianClient.js";

function mockFetch(handler: (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => {
  status: number;
  statusText?: string;
  headers?: Record<string, string>;
  body?: string;
}) {
  return vi.fn(async (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => {
    const res = handler(url, init);
    const headerMap = res.headers ?? {};
    return {
      ok: res.status >= 200 && res.status < 300,
      status: res.status,
      statusText: res.statusText ?? "",
      headers: {
        get(name: string) {
          const key = Object.keys(headerMap).find(
            (k) => k.toLowerCase() === name.toLowerCase(),
          );
          return key ? headerMap[key] : null;
        },
      },
      async text() {
        return res.body ?? "";
      },
      async json() {
        return JSON.parse(res.body ?? "{}");
      },
    };
  });
}

const config = {
  apiKey: "test-key",
  baseUrl: "https://127.0.0.1:27124",
  allowInsecureSsl: true,
};

describe("loadConfig", () => {
  it("fails fast when API key is missing", () => {
    expect(() => loadConfig({})).toThrow(/OBSIDIAN_API_KEY is required/);
  });

  it("uses default base URL", () => {
    const cfg = loadConfig({ OBSIDIAN_API_KEY: "abc" });
    expect(cfg.baseUrl).toBe("https://127.0.0.1:27124");
    expect(cfg.apiKey).toBe("abc");
  });
});

describe("ObsidianClient", () => {
  it("vault_read: GETs note content", async () => {
    const fetchImpl = mockFetch((url, init) => {
      expect(url).toBe("https://127.0.0.1:27124/vault/Daily/note.md");
      expect(init?.method).toBe("GET");
      expect(init?.headers?.Authorization).toBe("Bearer test-key");
      return { status: 200, body: "# Hello\n\nWorld" };
    });

    const client = new ObsidianClient(config, { fetchImpl: fetchImpl as never });
    await expect(client.read("Daily/note.md")).resolves.toBe("# Hello\n\nWorld");
  });

  it("vault_write: PUTs markdown content", async () => {
    const fetchImpl = mockFetch((url, init) => {
      expect(url).toBe("https://127.0.0.1:27124/vault/Inbox/idea.md");
      expect(init?.method).toBe("PUT");
      expect(init?.headers?.["Content-Type"]).toBe("text/markdown");
      expect(init?.body).toBe("# Idea\n");
      return { status: 204, body: "" };
    });

    const client = new ObsidianClient(config, { fetchImpl: fetchImpl as never });
    await expect(client.write("Inbox/idea.md", "# Idea\n")).resolves.toBeUndefined();
  });

  it("vault_search: POSTs simple search and returns matches", async () => {
    const payload = [
      {
        filename: "Daily/note.md",
        score: 1.5,
        matches: [
          {
            context: "...hello world...",
            match: { start: 3, end: 8 },
          },
        ],
      },
    ];

    const fetchImpl = mockFetch((url, init) => {
      expect(url).toContain("/search/simple/?");
      expect(url).toContain("query=hello");
      expect(init?.method).toBe("POST");
      return { status: 200, body: JSON.stringify(payload) };
    });

    const client = new ObsidianClient(config, { fetchImpl: fetchImpl as never });
    const results = await client.search("hello", 50);
    expect(results).toEqual(payload);
  });

  it("surfaces auth failures clearly", async () => {
    const fetchImpl = mockFetch(() => ({
      status: 401,
      statusText: "Unauthorized",
      body: JSON.stringify({ message: "Invalid token", errorCode: 40101 }),
    }));

    const client = new ObsidianClient(config, { fetchImpl: fetchImpl as never });
    await expect(client.read("a.md")).rejects.toBeInstanceOf(ObsidianApiError);
    await expect(client.read("a.md")).rejects.toThrow(/authentication failed/);
  });

  it("rejects path traversal before calling the API", async () => {
    const fetchImpl = mockFetch(() => {
      throw new Error("should not be called");
    });
    const client = new ObsidianClient(config, { fetchImpl: fetchImpl as never });
    await expect(client.read("../outside.md")).rejects.toThrow(/escape the vault/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
