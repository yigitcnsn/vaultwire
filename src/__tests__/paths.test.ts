import { describe, expect, it } from "vitest";
import { PathValidationError, sanitizeVaultPath, encodeVaultPath } from "../paths.js";

describe("sanitizeVaultPath", () => {
  it("normalizes relative paths", () => {
    expect(sanitizeVaultPath("Notes/Hello.md")).toBe("Notes/Hello.md");
    expect(sanitizeVaultPath("Notes\\Hello.md")).toBe("Notes/Hello.md");
    expect(sanitizeVaultPath("./Notes/./Hello.md")).toBe("Notes/Hello.md");
  });

  it("allows empty path for vault root", () => {
    expect(sanitizeVaultPath("", { allowEmpty: true })).toBe("");
    expect(sanitizeVaultPath("  ", { allowEmpty: true })).toBe("");
  });

  it("rejects path traversal", () => {
    expect(() => sanitizeVaultPath("../secret.md")).toThrow(PathValidationError);
    expect(() => sanitizeVaultPath("a/../../b.md")).toThrow(PathValidationError);
    expect(() => sanitizeVaultPath("ok/../..")).toThrow(PathValidationError);
  });

  it("rejects absolute paths", () => {
    expect(() => sanitizeVaultPath("/etc/passwd")).toThrow(PathValidationError);
    expect(() => sanitizeVaultPath("C:\\Windows\\note.md")).toThrow(PathValidationError);
  });

  it("allows safe parent references that stay inside the vault", () => {
    expect(sanitizeVaultPath("a/b/../c.md")).toBe("a/c.md");
  });
});

describe("encodeVaultPath", () => {
  it("encodes each segment", () => {
    expect(encodeVaultPath("Notes/My Note.md")).toBe("Notes/My%20Note.md");
    expect(encodeVaultPath("résumé.md")).toBe("r%C3%A9sum%C3%A9.md");
  });
});
