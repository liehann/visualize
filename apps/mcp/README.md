# @visualize/mcp

HTTP-hosted [Model Context Protocol](https://modelcontextprotocol.io) server that exposes the Playwright report database to Claude Code so it can investigate failing PRs (fetch screenshots, diffs, errors, attachments, annotate).

## Endpoints

- `POST /mcp` — JSON-RPC over the MCP **Streamable HTTP** transport (client to server).
- `GET /mcp` — SSE upgrade for server-to-client streams.
- `DELETE /mcp` — session termination (no-op in stateless mode).
- `GET /healthz` — unauthenticated liveness probe.

All `/mcp` requests must include `Authorization: Bearer <MCP_SECRET>`. The token is compared with constant-time equality.

## Tools

| name | purpose |
| ---- | ------- |
| `list_projects` | All projects |
| `list_runs` | Filter runs by project / branch / PR / status |
| `get_run` | Run summary with per-test status + attachment counts |
| `list_failed_tests` | Failed tests in a run with latest error + snapshot triplets |
| `get_test_failure` | Full TestCase + retries + attachment metadata (with `mcp://attachment/<id>` URLs) |
| `get_attachment` | Fetch attachment bytes; images inlined as base64 (<=2MB), trace/video metadata-only |
| `get_snapshot_diff` | actual / expected / diff triplet for a snapshot (image content) |
| `list_runs_for_pr` | Last 10 runs for a PR number |
| `list_runs_for_commit` | Last 10 runs for a commit SHA |
| `list_annotations` | Saved annotations on an attachment |
| `add_annotation` | Create a new Claude-authored annotation on an attachment |

## Environment

| var | required | default | notes |
| --- | -------- | ------- | ----- |
| `DATABASE_URL` | yes | — | Postgres URL |
| `MCP_SECRET` | yes | — | Bearer token clients must send |
| `DATA_DIR` | yes | — | Root of the on-disk attachment store |
| `PORT` | no | `5000` | |
| `NODE_ENV` | no | `development` | |

## Wiring this server into Claude Code

In your Claude Code settings (e.g. `~/.config/claude-code/mcp.json` or via `claude mcp add`), add an HTTP MCP server:

```json
{
  "mcpServers": {
    "visualize": {
      "type": "http",
      "url": "https://mcp.<your-domain>/mcp",
      "headers": {
        "Authorization": "Bearer ${VISUALIZE_MCP_SECRET}"
      }
    }
  }
}
```

The bearer token must match the server's `MCP_SECRET` env var. Keep the secret out of the repo — store it in your shell's environment or your editor's MCP secrets store, never in committed config.

## Local dev

```bash
pnpm --filter @visualize/mcp dev
```
