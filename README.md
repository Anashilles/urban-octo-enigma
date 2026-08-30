# Claude Code → OpenRouter

Configuration for pointing Claude Code at [OpenRouter](https://openrouter.ai)'s
Anthropic-compatible Messages endpoint instead of `api.anthropic.com`.

OpenRouter exposes `POST /api/v1/messages` in the Anthropic Messages API format,
so Claude Code speaks its native protocol to it — no translation shim. Billing,
rate limits, and model choice move to your OpenRouter account.

## The three variables

| Variable | Value | Why |
| --- | --- | --- |
| `ANTHROPIC_BASE_URL` | `https://openrouter.ai/api` | Claude Code appends `/v1/messages`. No trailing slash, and don't add `/v1` yourself. |
| `ANTHROPIC_AUTH_TOKEN` | your `sk-or-v1-…` key | Sent as `Authorization: Bearer <value>` — the header OpenRouter reads. Claude Code adds the `Bearer ` prefix. |
| `ANTHROPIC_API_KEY` | empty string | Sent as `X-Api-Key`. Must be **present and empty**, not merely unset, so a value inherited from a shell profile can't leak an Anthropic key to OpenRouter or silently take precedence. |

## Quick start

```bash
cp .env.example .env
chmod 600 .env
$EDITOR .env                      # paste your sk-or-v1-… key

source scripts/openrouter-env.sh  # must be sourced, not executed
scripts/verify-openrouter.sh      # one-token request to the real endpoint
claude
```

`verify-openrouter.sh` hits `$ANTHROPIC_BASE_URL/v1/messages` directly, so a
failure points at the gateway config rather than at Claude Code. It never
prints your key. An "unknown model" error still counts as a pass — the request
was authenticated before the model name was rejected.

## Making it persistent

Shell exports last one terminal session and don't reach editors launched from
the dock, or background agents. For a durable setup, use a settings file `env`
block. When a variable is set in both places, **the settings file wins**.

`.claude/settings.json` in this repo is committed and carries only the
non-secret half:

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://openrouter.ai/api",
    "ANTHROPIC_API_KEY": ""
  }
}
```

Setting `ANTHROPIC_API_KEY` to `""` is the documented way to neutralize a
variable you can't unset from a settings file.

The key goes in a file that is **not** committed. Copy the template:

```bash
cp .claude/settings.local.json.example .claude/settings.local.json
$EDITOR .claude/settings.local.json
```

`.claude/settings.local.json` and `.env` are both gitignored here.

> **First-run caveat.** In an interactive session, an `env` block in a
> *project* settings file applies only after the first-run wizard and the
> folder trust prompt. If Claude Code asks you to log in even though
> `verify-openrouter.sh` passes, that's why — put `ANTHROPIC_AUTH_TOKEN`
> somewhere read earlier: a shell export or the `env` block in
> `~/.claude/settings.json`.

Never put the key in `.claude/settings.json`; that file is committed and
shared with everyone who clones the repo.

## Verify inside Claude Code

Run `/status` and check for two lines:

- `Anthropic base URL` — appears only when a base URL is set. Should read
  `https://openrouter.ai/api`.
- `Auth token` naming `ANTHROPIC_AUTH_TOKEN`. A `Login method` line naming a
  claude.ai account instead means the credential isn't active.

Then send any prompt. A normal response confirms the connection.

## Choosing models

OpenRouter uses `vendor/model` IDs (`anthropic/claude-sonnet-4.6`,
`deepseek/deepseek-chat`, …), which are not Claude Code's built-in IDs. Try the
defaults first; if requests fail with an unknown-model error, map the aliases:

```bash
export ANTHROPIC_DEFAULT_OPUS_MODEL='anthropic/claude-opus-4.6'
export ANTHROPIC_DEFAULT_SONNET_MODEL='anthropic/claude-sonnet-4.6'
export ANTHROPIC_DEFAULT_HAIKU_MODEL='anthropic/claude-haiku-4.5'
```

Those IDs are illustrative — **look up the exact current strings at
<https://openrouter.ai/models>** rather than trusting the ones above.
`ANTHROPIC_DEFAULT_HAIKU_MODEL` also serves background tasks, so it needs to
resolve to something real or background work fails quietly.

To have OpenRouter's catalog appear in the `/model` picker, set
`CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1`.

## What changes when the base URL isn't Anthropic's

Documented behavior, not bugs in this setup:

- **Your claude.ai subscription is not used.** The credential replaces the
  subscription login for that session; usage is billed to the OpenRouter
  account that owns the key.
- **MCP tool search is disabled by default.** Set `ENABLE_TOOL_SEARCH=true`
  only if the gateway forwards `tool_reference` blocks.
- **Remote Control is disabled** when the base URL points anywhere other than
  `api.anthropic.com` (Claude Code v2.1.196+).
- **Fast mode reports unavailable.** Its availability check needs a claude.ai
  login or an Anthropic API key; with only a bearer token, Claude Code treats
  it as disabled. `CLAUDE_CODE_SKIP_FAST_MODE_ORG_CHECK=1` works around it.
- **Non-model background traffic still leaves the gateway path** (version
  checks, telemetry) without your gateway credential attached. Set
  `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` to stop it — this also disables
  auto-update, so arrange another update path.
- Anthropic doesn't endorse, maintain, or audit third-party gateway products,
  and doesn't support routing Claude Code to non-Claude models through any
  gateway. This config works, but it's outside the supported path.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| Startup warning about two credential sources, ending `auth may not work as expected` | A saved claude.ai login and the token are both active | `/logout`, or unset `ANTHROPIC_AUTH_TOKEN` to go back to the login |
| `401` naming an invalid or unrecognized token | Key is in the wrong header, revoked, or out of credit | Confirm it's in `ANTHROPIC_AUTH_TOKEN` (not `ANTHROPIC_API_KEY`) and still valid on OpenRouter |
| `API returned an empty or malformed response (HTTP 200)` | Something in front of the endpoint returned HTML | Run `scripts/verify-openrouter.sh`; check for a captive portal or corporate proxy |
| `400` naming `context_management` or `Extra inputs are not permitted` | Upstream rejects pre-release fields Claude Code sends | `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1` |
| `400` naming `thinking` or `adaptive` | The upstream model build doesn't accept adaptive reasoning | Pick a model whose upstream supports it; on Opus/Sonnet 4.6, `CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING=1` |
| `ContextWindowExceededError`, or a token-limit error in OpenRouter's own wording | The gateway enforces a smaller context than the model's native window, so Claude Code doesn't recognize it and won't auto-compact | `/compact` to recover; set `CLAUDE_CODE_AUTO_COMPACT_WINDOW` (clamped to ≥100,000) and `CLAUDE_CODE_MAX_OUTPUT_TOKENS` below the gateway's limits |
| Models missing from `/model` | OpenRouter's IDs aren't in the built-in list | `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1`, or set the `ANTHROPIC_DEFAULT_*_MODEL` variables |
| Prompted to log in although the curl test passes | Project-scope `env` applies only after the first-run wizard and trust prompt | Export the token in your shell or put it in `~/.claude/settings.json` |
| `ConnectionRefused` / `ENOTFOUND` | Nothing answered at the base URL | Check for a typo or trailing slash; confirm your network allows `openrouter.ai` |

## Files

```
.claude/settings.json                    committed; base URL + empty API key, no secrets
.claude/settings.local.json.example      template for the key (copy, don't commit the copy)
.claude/skills/analyze-pester-failures/  vendored Claude Code skill (MIT; see its NOTICE.md)
.env.example                             template for the shell-export path
scripts/openrouter-env.sh                source this to load .env into your shell
scripts/verify-openrouter.sh             one-token smoke test against /v1/messages
```

## Bundled skill

`.claude/skills/analyze-pester-failures/` is vendored from
[PowerShell/PowerShell](https://github.com/PowerShell/PowerShell) (MIT). It is a
troubleshooting workflow for Pester test failures in that project's CI — unrelated
to the gateway config, and inert unless you ask Claude Code to use it. Its script
needs an authenticated `gh` CLI. Provenance and the local path rewrites are in
[NOTICE.md](.claude/skills/analyze-pester-failures/NOTICE.md).

## Security

`.env`, `.env.*`, and `.claude/settings.local.json` are gitignored. Keep
`.env` at mode `600` — `openrouter-env.sh` warns if it isn't. If a key is ever
committed or pasted somewhere shared, rotate it at
<https://openrouter.ai/keys>; scrubbing history is not enough on its own.

## References

- [Connect Claude Code to an LLM gateway](https://code.claude.com/docs/en/llm-gateway-connect)
- [Claude Code environment variables](https://code.claude.com/docs/en/env-vars)
- [Claude Code settings](https://code.claude.com/docs/en/settings)
- [Model configuration](https://code.claude.com/docs/en/model-config)
- [OpenRouter: Claude Code integration](https://openrouter.ai/docs/cookbook/coding-agents/claude-code-integration)
