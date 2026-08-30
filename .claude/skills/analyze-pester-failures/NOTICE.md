# Provenance and license

This skill is vendored from the PowerShell repository, not written here.

| | |
| --- | --- |
| Upstream | <https://github.com/PowerShell/PowerShell> |
| Upstream path | `.github/skills/analyze-pester-failures/` |
| Commit | `eb8b76e7c669423a016b5b405be5c9431849a338` (`master`, 2026-08-28) |
| License | MIT — Copyright (c) Microsoft Corporation |

Full license text: <https://github.com/PowerShell/PowerShell/blob/master/LICENSE.txt>

## Local modifications

Content is otherwise verbatim. Only path references were rewritten, because
upstream stores the skill under `.github/skills/` (the GitHub Copilot location)
while Claude Code discovers project skills under `.claude/skills/`:

- `SKILL.md` — the three `./.github/skills/…/analyze-pr-test-failures.ps1`
  invocation examples now read `./.claude/skills/…`.
- `SKILL.md` — the relative link `../../../test/` pointed at the PowerShell
  test suite, which does not exist in this repository; it now points at the
  upstream tree on GitHub.
- `scripts/analyze-pr-test-failures.ps1` — the `.EXAMPLE` and `.NOTES` blocks
  in the comment-based help carry the same path rewrite. No executable code
  was changed.

## Updating

Re-vendor by copying the three files from the upstream path above and
re-applying those path rewrites.
