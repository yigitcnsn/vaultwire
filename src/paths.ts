/**
 * Vault-relative path sanitization.
 * Rejects absolute paths and any `..` segment that would escape the vault root.
 */

export class PathValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PathValidationError";
  }
}

/**
 * Normalize and validate a vault-relative path.
 * Returns a clean path using `/` separators without a leading slash.
 * Empty string is allowed (vault root) when `allowEmpty` is true.
 */
export function sanitizeVaultPath(
  input: string,
  options: { allowEmpty?: boolean; label?: string } = {},
): string {
  const label = options.label ?? "path";
  if (typeof input !== "string") {
    throw new PathValidationError(`${label} must be a string`);
  }

  const trimmed = input.trim();
  if (!trimmed) {
    if (options.allowEmpty) {
      return "";
    }
    throw new PathValidationError(`${label} must not be empty`);
  }

  // Reject Windows drive letters and UNC / absolute POSIX paths
  if (/^[a-zA-Z]:/.test(trimmed) || trimmed.startsWith("\\\\")) {
    throw new PathValidationError(
      `${label} must be relative to the vault root (got absolute path)`,
    );
  }
  if (trimmed.startsWith("/")) {
    throw new PathValidationError(
      `${label} must be relative to the vault root (do not start with "/")`,
    );
  }

  const parts = trimmed.replace(/\\/g, "/").split("/");
  const resolved: string[] = [];

  for (const part of parts) {
    if (part === "" || part === ".") {
      continue;
    }
    if (part === "..") {
      if (resolved.length === 0) {
        throw new PathValidationError(
          `${label} must not escape the vault root (contains "..")`,
        );
      }
      resolved.pop();
      continue;
    }
    // Null bytes and control characters are never valid in vault paths
    if (/[\0-\x1f\x7f]/.test(part)) {
      throw new PathValidationError(`${label} contains invalid characters`);
    }
    resolved.push(part);
  }

  const result = resolved.join("/");
  if (!result && !options.allowEmpty) {
    throw new PathValidationError(`${label} must not be empty`);
  }
  return result;
}

/**
 * Encode each path segment for use in a URL path (keeps `/` as separators).
 */
export function encodeVaultPath(path: string): string {
  if (!path) {
    return "";
  }
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}
