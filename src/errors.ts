export class ObsidianApiError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly body: string;

  constructor(status: number, statusText: string, body: string) {
    super(formatApiError(status, statusText, body));
    this.name = "ObsidianApiError";
    this.status = status;
    this.statusText = statusText;
    this.body = body;
  }
}

function formatApiError(status: number, statusText: string, body: string): string {
  const detail = extractErrorMessage(body);
  const suffix = detail ? `: ${detail}` : body ? `: ${truncate(body, 300)}` : "";

  switch (status) {
    case 401:
    case 403:
      return `Obsidian API authentication failed (${status}). Check OBSIDIAN_API_KEY.${suffix}`;
    case 404:
      return `Not found in vault (${status})${suffix}`;
    case 405:
      return `Method not allowed (${status}) — path may point to a directory instead of a file${suffix}`;
    case 409:
      return `Conflict (${status})${suffix}`;
    case 400:
      return `Bad request to Obsidian API (${status})${suffix}`;
    default:
      return `Obsidian API error ${status} ${statusText}${suffix}`;
  }
}

function extractErrorMessage(body: string): string | undefined {
  if (!body) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(body) as {
      message?: string;
      errorCode?: string | number;
      error?: string;
    };
    const parts: string[] = [];
    if (parsed.errorCode !== undefined) {
      parts.push(String(parsed.errorCode));
    }
    if (parsed.message) {
      parts.push(parsed.message);
    } else if (parsed.error) {
      parts.push(parsed.error);
    }
    return parts.length > 0 ? parts.join(" — ") : undefined;
  } catch {
    return undefined;
  }
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

export function toToolErrorMessage(err: unknown): string {
  if (err instanceof ObsidianApiError || err instanceof Error) {
    return err.message;
  }
  return `Unexpected error: ${String(err)}`;
}
