export interface VaultwireConfig {
  apiKey: string;
  baseUrl: string;
  allowInsecureSsl: boolean;
}

const DEFAULT_BASE_URL = "https://127.0.0.1:27124";

/**
 * Load config from environment. Fails fast if OBSIDIAN_API_KEY is missing.
 * Never logs the API key.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): VaultwireConfig {
  const apiKey = env.OBSIDIAN_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "OBSIDIAN_API_KEY is required. Set it to the API key from Obsidian → Settings → Local REST API.",
    );
  }

  const baseUrl = (env.OBSIDIAN_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(
    /\/+$/,
    "",
  );

  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error(
      `OBSIDIAN_BASE_URL is not a valid URL: ${baseUrl}. Example: https://127.0.0.1:27124`,
    );
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      `OBSIDIAN_BASE_URL must use http or https (got ${parsed.protocol})`,
    );
  }

  const allowInsecureSsl =
    env.OBSIDIAN_ALLOW_INSECURE_SSL === "true" ||
    env.NODE_TLS_REJECT_UNAUTHORIZED === "0" ||
    isLocalhost(parsed.hostname);

  return { apiKey, baseUrl, allowInsecureSsl };
}

function isLocalhost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
}
