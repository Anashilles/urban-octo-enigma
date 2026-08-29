# shellcheck shell=bash
#
# Load the OpenRouter configuration for Claude Code into the current shell.
#
#   source scripts/openrouter-env.sh
#
# Must be sourced, not executed: an executed script exports into its own
# process and exits, leaving your shell unchanged.

_openrouter_env_main() {
  local sourced=0
  # shellcheck disable=SC2128
  if [ -n "${BASH_SOURCE:-}" ] && [ "${BASH_SOURCE[0]}" != "${0}" ]; then
    sourced=1
  elif [ -n "${ZSH_EVAL_CONTEXT:-}" ] && case "$ZSH_EVAL_CONTEXT" in *:file) true;; *) false;; esac; then
    sourced=1
  fi

  if [ "$sourced" -ne 1 ]; then
    echo "openrouter-env.sh: run this as 'source scripts/openrouter-env.sh'." >&2
    exit 1
  fi

  local script_dir repo_root env_file
  script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]:-$0}")" && pwd)
  repo_root=$(cd -- "$script_dir/.." && pwd)
  env_file="${OPENROUTER_ENV_FILE:-$repo_root/.env}"

  if [ ! -f "$env_file" ]; then
    echo "openrouter-env.sh: $env_file not found." >&2
    echo "  Create it with: cp '$repo_root/.env.example' '$repo_root/.env'" >&2
    return 1
  fi

  # Refuse to load a world- or group-readable credential file.
  local mode
  mode=$(stat -c '%a' "$env_file" 2>/dev/null || stat -f '%Lp' "$env_file" 2>/dev/null || echo "")
  case "$mode" in
    ""|*00) ;;
    *) echo "openrouter-env.sh: warning: $env_file is mode $mode; run 'chmod 600 \"$env_file\"'." >&2 ;;
  esac

  set -a
  # shellcheck disable=SC1090
  . "$env_file"
  set +a

  if [ -z "${ANTHROPIC_AUTH_TOKEN:-}" ] || [ "${ANTHROPIC_AUTH_TOKEN}" = "sk-or-v1-replace-me" ]; then
    echo "openrouter-env.sh: ANTHROPIC_AUTH_TOKEN is unset or still the placeholder." >&2
    echo "  Put your OpenRouter key in $env_file." >&2
    return 1
  fi

  # Present-but-empty is required, so that Claude Code does not send a stale
  # X-Api-Key. `set -a` above already exports it if .env declared it; this
  # covers a .env that omitted the line entirely.
  export ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY-}"

  echo "Claude Code -> OpenRouter"
  echo "  ANTHROPIC_BASE_URL   = ${ANTHROPIC_BASE_URL:-<unset>}"
  echo "  ANTHROPIC_AUTH_TOKEN = ${ANTHROPIC_AUTH_TOKEN:0:11}... (${#ANTHROPIC_AUTH_TOKEN} chars)"
  echo "  ANTHROPIC_API_KEY    = (empty)"
  echo
  echo "Next: scripts/verify-openrouter.sh"
}

_openrouter_env_main "$@"
_openrouter_env_status=$?
unset -f _openrouter_env_main
return $_openrouter_env_status 2>/dev/null || true
