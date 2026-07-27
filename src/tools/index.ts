import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { toToolErrorMessage } from "../errors.js";
import type { ObsidianClient } from "../obsidianClient.js";

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

function ok(data: unknown): ToolResult {
  const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  return { content: [{ type: "text", text }] };
}

function fail(err: unknown): ToolResult {
  return {
    content: [{ type: "text", text: toToolErrorMessage(err) }],
    isError: true,
  };
}

export function registerTools(server: McpServer, client: ObsidianClient): void {
  server.registerTool(
    "vault_list",
    {
      title: "List vault files",
      description:
        "List files and folders in the Obsidian vault. Optionally pass a relative path to list a subdirectory.",
      inputSchema: {
        path: z
          .string()
          .optional()
          .describe(
            'Vault-relative directory path to list (default: vault root). Example: "Projects" or "" for root.',
          ),
      },
    },
    async ({ path }) => {
      try {
        const result = await client.list(path ?? "");
        return ok({
          path: path?.trim() || "/",
          files: result.files ?? [],
        });
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "vault_read",
    {
      title: "Read vault note",
      description: "Read the full markdown content of a note by vault-relative path.",
      inputSchema: {
        path: z
          .string()
          .describe('Vault-relative note path, e.g. "Daily/2026-07-27.md"'),
      },
    },
    async ({ path }) => {
      try {
        const content = await client.read(path);
        return ok({ path, content });
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "vault_write",
    {
      title: "Write vault note",
      description:
        "Create or overwrite a note at the given vault-relative path with the provided markdown content.",
      inputSchema: {
        path: z
          .string()
          .describe('Vault-relative note path, e.g. "Inbox/idea.md"'),
        content: z.string().describe("Full markdown content to write"),
      },
    },
    async ({ path, content }) => {
      try {
        await client.write(path, content);
        return ok({ ok: true, path, bytes: Buffer.byteLength(content, "utf8") });
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "vault_append",
    {
      title: "Append to vault note",
      description:
        "Append markdown content to the end of an existing note (creates the file if missing).",
      inputSchema: {
        path: z.string().describe("Vault-relative note path"),
        content: z.string().describe("Markdown content to append"),
      },
    },
    async ({ path, content }) => {
      try {
        await client.append(path, content);
        return ok({ ok: true, path, appendedBytes: Buffer.byteLength(content, "utf8") });
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "vault_patch",
    {
      title: "Patch vault note",
      description:
        "Insert or modify content relative to a heading, block reference, or frontmatter field using the Local REST API PATCH instruction format.",
      inputSchema: {
        path: z.string().describe("Vault-relative note path"),
        targetType: z
          .enum(["heading", "block", "frontmatter"])
          .describe("What to target inside the note"),
        target: z
          .union([z.string(), z.array(z.string()), z.null()])
          .describe(
            'For heading: array of heading texts from root, e.g. ["Overview","Details"]. For block: bare id without ^. For frontmatter: field name. Use null or [] for document root (heading only).',
          ),
        operation: z
          .enum(["append", "prepend", "replace", "delete"])
          .describe("Patch operation to apply"),
        content: z
          .string()
          .optional()
          .describe("Markdown/text payload (for heading/block body or marker rename)"),
        value: z
          .unknown()
          .optional()
          .describe("JSON value payload (for frontmatter fields or table rows)"),
        scope: z
          .enum(["content", "marker", "markerAndContent", "parent"])
          .optional()
          .describe("Which part of the target to edit (default: content)"),
        createTargetIfMissing: z
          .boolean()
          .optional()
          .describe("Create the target if it does not exist"),
        within: z
          .number()
          .int()
          .optional()
          .describe(
            "Optional positional block index within a heading section (0-based; negative from end)",
          ),
      },
    },
    async (args) => {
      try {
        if (args.content === undefined && args.value === undefined && args.operation !== "delete") {
          return fail(
            new Error(
              'Provide "content" (markdown/text) or "value" (JSON) unless operation is "delete"',
            ),
          );
        }
        await client.patch(args.path, {
          targetType: args.targetType,
          target: args.target,
          operation: args.operation,
          scope: args.scope,
          content: args.content,
          value: args.value,
          createTargetIfMissing: args.createTargetIfMissing,
          within: args.within,
        });
        return ok({
          ok: true,
          path: args.path,
          targetType: args.targetType,
          operation: args.operation,
        });
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "vault_delete",
    {
      title: "Delete vault note",
      description:
        "Delete a note from the vault. Requires confirm: true. By default moves to Obsidian trash; set permanent: true to delete permanently.",
      inputSchema: {
        path: z.string().describe("Vault-relative note path to delete"),
        confirm: z
          .literal(true)
          .describe("Must be true to proceed — prevents accidental deletes"),
        permanent: z
          .boolean()
          .optional()
          .describe("If true, permanently delete instead of moving to trash"),
      },
    },
    async ({ path, confirm, permanent }) => {
      try {
        if (confirm !== true) {
          return fail(
            new Error('vault_delete requires confirm: true to proceed'),
          );
        }
        await client.delete(path, permanent === true);
        return ok({ ok: true, path, permanent: permanent === true });
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "vault_search",
    {
      title: "Search vault",
      description:
        "Simple text search across the vault. Returns matching file paths with short content previews.",
      inputSchema: {
        query: z.string().describe("Text to search for"),
        contextLength: z
          .number()
          .int()
          .positive()
          .max(2000)
          .optional()
          .describe("Characters of context around each match (default 100)"),
      },
    },
    async ({ query, contextLength }) => {
      try {
        const results = await client.search(query, contextLength ?? 100);
        const simplified = (results ?? []).map((item) => ({
          path: item.filename,
          score: item.score,
          previews: (item.matches ?? []).map((m) => m.context),
        }));
        return ok({ query, count: simplified.length, results: simplified });
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "vault_active_note",
    {
      title: "Get or set active note",
      description:
        "Get the currently active note in Obsidian, or open/set a note as active by path.",
      inputSchema: {
        action: z
          .enum(["get", "set"])
          .describe('Use "get" to read the active note, or "set" to open a note'),
        path: z
          .string()
          .optional()
          .describe('Required when action is "set": vault-relative path to open'),
        newLeaf: z
          .boolean()
          .optional()
          .describe('When action is "set", open in a new leaf/tab if true'),
      },
    },
    async ({ action, path, newLeaf }) => {
      try {
        if (action === "get") {
          const note = await client.getActiveNote();
          return ok({
            action: "get",
            path: note.path,
            content: note.content,
            hasActiveNote: note.path !== null,
          });
        }

        if (!path?.trim()) {
          return fail(new Error('path is required when action is "set"'));
        }
        await client.openNote(path, newLeaf === true);
        return ok({ action: "set", path, newLeaf: newLeaf === true });
      } catch (err) {
        return fail(err);
      }
    },
  );
}
