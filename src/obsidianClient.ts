import { Agent, fetch as undiciFetch, type RequestInit as UndiciRequestInit } from "undici";
import type { VaultwireConfig } from "./config.js";
import { ObsidianApiError } from "./errors.js";
import { encodeVaultPath, sanitizeVaultPath } from "./paths.js";

export interface ListResult {
  files: string[];
}

export interface SearchMatch {
  context: string;
  match: { start: number; end: number };
}

export interface SearchResultItem {
  filename: string;
  score: number;
  matches: SearchMatch[];
}

export interface ActiveNoteResult {
  path: string | null;
  content: string;
}

export interface PatchInstruction {
  targetType: "heading" | "block" | "frontmatter";
  target: string | string[] | null;
  operation: "append" | "prepend" | "replace" | "delete";
  scope?: "content" | "marker" | "markerAndContent" | "parent";
  content?: string;
  value?: unknown;
  createTargetIfMissing?: boolean;
  within?: number;
}

type FetchLike = (
  input: string,
  init?: UndiciRequestInit,
) => Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
  json(): Promise<unknown>;
}>;

/**
 * Thin HTTP client for Obsidian Local REST API.
 * Uses undici fetch so self-signed localhost HTTPS certs can be accepted.
 */
export class ObsidianClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly dispatcher: Agent | undefined;
  private readonly fetchImpl: FetchLike;

  constructor(
    config: VaultwireConfig,
    options: { fetchImpl?: FetchLike; dispatcher?: Agent } = {},
  ) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.fetchImpl = options.fetchImpl ?? (undiciFetch as unknown as FetchLike);

    if (options.dispatcher) {
      this.dispatcher = options.dispatcher;
    } else if (config.allowInsecureSsl && this.baseUrl.startsWith("https:")) {
      this.dispatcher = new Agent({
        connect: { rejectUnauthorized: false },
      });
    }
  }

  async list(path = ""): Promise<ListResult> {
    const clean = sanitizeVaultPath(path, { allowEmpty: true, label: "path" });
    const url = clean
      ? `${this.baseUrl}/vault/${encodeVaultPath(clean)}/`
      : `${this.baseUrl}/vault/`;
    return this.requestJson<ListResult>("GET", url);
  }

  async read(path: string): Promise<string> {
    const clean = sanitizeVaultPath(path, { label: "path" });
    const url = `${this.baseUrl}/vault/${encodeVaultPath(clean)}`;
    return this.requestText("GET", url, {
      Accept: "text/markdown",
    });
  }

  async write(path: string, content: string): Promise<void> {
    const clean = sanitizeVaultPath(path, { label: "path" });
    const url = `${this.baseUrl}/vault/${encodeVaultPath(clean)}`;
    await this.request("PUT", url, {
      headers: { "Content-Type": "text/markdown" },
      body: content,
      expectEmpty: true,
    });
  }

  async append(path: string, content: string): Promise<void> {
    const clean = sanitizeVaultPath(path, { label: "path" });
    const url = `${this.baseUrl}/vault/${encodeVaultPath(clean)}`;
    await this.request("POST", url, {
      headers: { "Content-Type": "text/markdown" },
      body: content,
      expectEmpty: true,
    });
  }

  async patch(path: string, instruction: PatchInstruction): Promise<void> {
    const clean = sanitizeVaultPath(path, { label: "path" });
    const url = `${this.baseUrl}/vault/${encodeVaultPath(clean)}`;
    await this.request("PATCH", url, {
      headers: {
        "Content-Type": "application/vnd.olrapi.patch-instruction+json",
      },
      body: JSON.stringify(instruction),
      expectEmpty: true,
    });
  }

  async delete(path: string, permanent = false): Promise<void> {
    const clean = sanitizeVaultPath(path, { label: "path" });
    const qs = permanent ? "?permanent=true" : "";
    const url = `${this.baseUrl}/vault/${encodeVaultPath(clean)}${qs}`;
    await this.request("DELETE", url, { expectEmpty: true });
  }

  async search(query: string, contextLength = 100): Promise<SearchResultItem[]> {
    if (!query.trim()) {
      throw new Error("query must not be empty");
    }
    const params = new URLSearchParams({
      query,
      contextLength: String(contextLength),
    });
    const url = `${this.baseUrl}/search/simple/?${params.toString()}`;
    return this.requestJson<SearchResultItem[]>("POST", url);
  }

  async getActiveNote(): Promise<ActiveNoteResult> {
    const response = await this.rawRequest("GET", `${this.baseUrl}/active/`, {
      headers: { Accept: "text/markdown" },
    });

    if (response.status === 404) {
      return { path: null, content: "" };
    }

    if (!response.ok) {
      const body = await response.text();
      throw new ObsidianApiError(response.status, response.statusText, body);
    }

    const location = response.headers.get("Content-Location");
    const path = location ? decodeURIComponent(location) : null;
    const content = await response.text();
    return { path, content };
  }

  async openNote(path: string, newLeaf = false): Promise<void> {
    const clean = sanitizeVaultPath(path, { label: "path" });
    const qs = newLeaf ? "?newLeaf=true" : "";
    const url = `${this.baseUrl}/open/${encodeVaultPath(clean)}${qs}`;
    await this.request("POST", url, { expectEmpty: true });
  }

  private async requestJson<T>(method: string, url: string): Promise<T> {
    const text = await this.requestText(method, url, {
      Accept: "application/json",
    });
    if (!text) {
      return {} as T;
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`Obsidian API returned invalid JSON from ${method} ${safeUrl(url)}`);
    }
  }

  private async requestText(
    method: string,
    url: string,
    headers: Record<string, string> = {},
  ): Promise<string> {
    return this.request(method, url, { headers });
  }

  private async request(
    method: string,
    url: string,
    options: {
      headers?: Record<string, string>;
      body?: string;
      expectEmpty?: boolean;
    } = {},
  ): Promise<string> {
    const response = await this.rawRequest(method, url, {
      headers: options.headers,
      body: options.body,
    });

    const body = await response.text();
    if (!response.ok) {
      throw new ObsidianApiError(response.status, response.statusText, body);
    }
    return body;
  }

  private async rawRequest(
    method: string,
    url: string,
    options: { headers?: Record<string, string>; body?: string } = {},
  ) {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      ...options.headers,
    };

    try {
      return await this.fetchImpl(url, {
        method,
        headers,
        body: options.body,
        dispatcher: this.dispatcher,
      });
    } catch (err) {
      throw new Error(
        `Failed to reach Obsidian Local REST API at ${this.baseUrl} (${method} ${safeUrl(url)}): ${
          err instanceof Error ? err.message : String(err)
        }. Is Obsidian running with the Local REST API plugin enabled?`,
      );
    }
  }
}

/** Strip query values that might be sensitive from error messages. */
function safeUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return "<url>";
  }
}
