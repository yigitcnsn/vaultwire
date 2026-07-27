# Vaultwire

MCP (Model Context Protocol) server that lets Claude Desktop / Claude Code read and write notes in an Obsidian vault via the [Local REST API](https://github.com/coddingtonbear/obsidian-local-rest-api) plugin.

```
┌─────────────────┐     stdio      ┌────────────┐     HTTPS      ┌──────────────────┐     ┌──────────┐
│ Claude Desktop  │ ─────────────► │  vaultwire │ ─────────────► │ Local REST API   │ ──► │ Obsidian │
│ (MCP client)    │ ◄───────────── │  MCP server│ ◄───────────── │ plugin :27124    │ ◄── │  vault   │
└─────────────────┘                └────────────┘                └──────────────────┘     └──────────┘
```

## Prerequisites

1. [Obsidian](https://obsidian.md/) installed with a vault open
2. Community plugin **Local REST API** (by coddingtonbear) installed and enabled
3. Copy the API key from **Settings → Community plugins → Local REST API**

The plugin’s default secure endpoint is `https://127.0.0.1:27124` (self-signed certificate). You can also enable the insecure HTTP server on port `27123` in plugin settings.

## Install

```bash
# Global
npm install -g vaultwire

# Or run without installing
npx vaultwire
```

From a local clone:

```bash
git clone <repo-url> vaultwire
cd vaultwire
npm install
npm run build
npm link   # optional: exposes `vaultwire` on your PATH
```

## Configuration

### Environment

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OBSIDIAN_API_KEY` | **yes** | — | Bearer token from the Local REST API plugin |
| `OBSIDIAN_BASE_URL` | no | `https://127.0.0.1:27124` | API base URL |
| `OBSIDIAN_ALLOW_INSECURE_SSL` | no | auto for localhost | Set `true` to accept self-signed certs on non-local hosts |

Vaultwire accepts the Local REST API’s self-signed certificate automatically when the host is `localhost` / `127.0.0.1`. You can also set `NODE_TLS_REJECT_UNAUTHORIZED=0` as a fallback (less ideal; prefer the built-in localhost handling or HTTP insecure mode).

See [`.env.example`](./.env.example). Never commit a real `.env`.

### Claude Desktop

Edit your Claude Desktop config (`claude_desktop_config.json`):

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "vaultwire": {
      "command": "npx",
      "args": ["-y", "vaultwire"],
      "env": {
        "OBSIDIAN_API_KEY": "your-api-key-here",
        "OBSIDIAN_BASE_URL": "https://127.0.0.1:27124"
      }
    }
  }
}
```

If you installed globally or linked a local build:

```json
{
  "mcpServers": {
    "vaultwire": {
      "command": "vaultwire",
      "env": {
        "OBSIDIAN_API_KEY": "your-api-key-here",
        "OBSIDIAN_BASE_URL": "https://127.0.0.1:27124"
      }
    }
  }
}
```

Restart Claude Desktop after saving.

## Tools

| Tool | Purpose |
|------|---------|
| `vault_list` | List files/folders (optional subdirectory `path`) |
| `vault_read` | Read a note by path |
| `vault_write` | Create or overwrite a note |
| `vault_append` | Append content to a note |
| `vault_patch` | Patch relative to a heading / block / frontmatter field |
| `vault_delete` | Delete a note (**requires `confirm: true`**) |
| `vault_search` | Simple text search with previews |
| `vault_active_note` | Get or set the active note in Obsidian |

Paths are vault-relative (e.g. `Daily/2026-07-27.md`). Absolute paths and `../` traversal outside the vault are rejected.

### Example calls

**List vault root**

```json
{ "name": "vault_list", "arguments": {} }
```

**List a folder**

```json
{ "name": "vault_list", "arguments": { "path": "Projects" } }
```

**Read a note**

```json
{ "name": "vault_read", "arguments": { "path": "Daily/2026-07-27.md" } }
```

**Write a note**

```json
{
  "name": "vault_write",
  "arguments": {
    "path": "Inbox/vaultwire-test.md",
    "content": "# Vaultwire test\n\nHello from MCP.\n"
  }
}
```

**Append**

```json
{
  "name": "vault_append",
  "arguments": {
    "path": "Inbox/vaultwire-test.md",
    "content": "\n## More\nAppended line.\n"
  }
}
```

**Patch under a heading**

```json
{
  "name": "vault_patch",
  "arguments": {
    "path": "Inbox/vaultwire-test.md",
    "targetType": "heading",
    "target": ["Vaultwire test"],
    "operation": "append",
    "content": "Inserted under the heading."
  }
}
```

**Search**

```json
{
  "name": "vault_search",
  "arguments": { "query": "Vaultwire", "contextLength": 80 }
}
```

**Active note**

```json
{ "name": "vault_active_note", "arguments": { "action": "get" } }
```

```json
{
  "name": "vault_active_note",
  "arguments": { "action": "set", "path": "Inbox/vaultwire-test.md" }
}
```

**Delete (confirmation required)**

```json
{
  "name": "vault_delete",
  "arguments": {
    "path": "Inbox/vaultwire-test.md",
    "confirm": true
  }
}
```

## Manual test checklist

With Obsidian open and Local REST API enabled:

1. Configure Claude Desktop (or run `OBSIDIAN_API_KEY=... npm start`) and confirm the server connects
2. `vault_list` — see files at the vault root
3. `vault_read` — open an existing note
4. `vault_write` — create `Inbox/vaultwire-test.md`
5. `vault_search` — query for a unique string from that note
6. `vault_active_note` with `action: "set"` then `action: "get"`
7. `vault_delete` with `confirm: true` — remove the test note

## Development

```bash
npm install
npm test
npm run build
npm run dev   # tsx src/index.ts
```

## Troubleshooting

### Self-signed certificate errors

Local REST API HTTPS uses a self-signed cert. Vaultwire disables TLS verification for `localhost` / `127.0.0.1` automatically. Alternatives:

- Enable **insecure HTTP** in the plugin and set `OBSIDIAN_BASE_URL=http://127.0.0.1:27123`
- Or set `NODE_TLS_REJECT_UNAUTHORIZED=0` in the MCP `env` block (last resort)

### Authentication errors (401 / 403)

- Re-copy the API key from Obsidian settings into `OBSIDIAN_API_KEY`
- Ensure there is no accidental whitespace or quotes around the key
- Confirm the Local REST API plugin is enabled

### Connection refused / fetch failed

- Obsidian must be running with the vault open
- Check the port in plugin settings (HTTPS `27124`, HTTP `27123`)
- Confirm nothing else is bound to that port
- Verify `OBSIDIAN_BASE_URL` matches the plugin (http vs https)

### 404 Not found

- Paths are relative to the vault root, use `/` separators, and usually include the `.md` extension
- `vault_list` the parent folder to confirm the exact filename

### Accidental deletes

- `vault_delete` refuses to run unless `confirm` is exactly `true`
- By default files go to Obsidian trash; pass `permanent: true` only when you intend permanent deletion

## Safety

- The API key is never written to logs
- Path inputs are sanitized against vault escape (`../`, absolute paths)
- Destructive deletes require explicit confirmation

## License

MIT — see [LICENSE](./LICENSE).
