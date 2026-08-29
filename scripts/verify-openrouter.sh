#!/usr/bin/env bash
#
# Smoke-test the OpenRouter connection before starting Claude Code, so a
# failure points at the gateway config rather than at Claude Code.
#
#   scripts/verify-openrouter.sh [model-id]
#
# Sends one 1-token request to $ANTHROPIC_BASE_URL/v1/messages — the exact
# endpoint Claude Code uses. The token is never printed.

set -uo pipefail

repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
env_file="${OPENROUTER_ENV_FILE:-$repo_root/.env}"

# Fall back to .env only for values the environment does not already provide.
if [ -z "${ANTHROPIC_AUTH_TOKEN:-}" ] && [ -f "$env_file" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$env_file"
  set +a
fi

base_url="${ANTHROPIC_BASE_URL:-}"
token="${ANTHROPIC_AUTH_TOKEN:-}"
model="${1:-${VERIFY_MODEL:-anthropic/claude-sonnet-4.6}}"

if [ -z "$base_url" ] || [ -z "$token" ]; then
  echo "verify-openrouter.sh: ANTHROPIC_BASE_URL and ANTHROPIC_AUTH_TOKEN must be set." >&2
  echo "  Run: source scripts/openrouter-env.sh" >&2
  exit 2
fi

base_url="${base_url%/}"
echo "POST $base_url/v1/messages   (model: $model)"

response=$(curl -sS -m 60 -w $'\n%{http_code}' -X POST "$base_url/v1/messages" \
  -H "Authorization: Bearer $token" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d "{\"model\":\"$model\",\"max_tokens\":1,\"messages\":[{\"role\":\"user\",\"content\":\".\"}]}" 2>&1)
curl_status=$?

if [ $curl_status -ne 0 ]; then
  echo "FAIL: curl exited $curl_status — nothing answered at $base_url." >&2
  echo "$response" >&2
  echo "  Check the URL for a typo, a trailing slash, or a firewall/VPN on the path." >&2
  exit 1
fi

http_code=${response##*$'\n'}
body=${response%$'\n'*}

echo "HTTP $http_code"

case "$http_code" in
  200)
    if printf '%s' "$body" | grep -q '"id"[[:space:]]*:[[:space:]]*"msg_'; then
      echo "PASS: OpenRouter answered with a Messages API response. Claude Code is good to go."
      exit 0
    fi
    echo "FAIL: HTTP 200 but the body is not a Messages API response." >&2
    echo "  Something in front of the endpoint returned HTML or a login page:" >&2
    printf '%s\n' "$body" | head -c 600 >&2; echo >&2
    exit 1
    ;;
  400|404)
    if printf '%s' "$body" | grep -qiE 'model|not_found|no endpoints'; then
      echo "PASS (auth): the credential was accepted; '$model' is not a valid OpenRouter model ID."
      echo "  Connectivity and auth are confirmed. Pick a real ID from https://openrouter.ai/models"
      echo "  and set the ANTHROPIC_DEFAULT_*_MODEL variables (see README)."
      exit 0
    fi
    echo "FAIL: the request body was rejected." >&2
    printf '%s\n' "$body" | head -c 600 >&2; echo >&2
    echo "  If it names context_management or 'Extra inputs are not permitted'," >&2
    echo "  set CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1." >&2
    exit 1
    ;;
  401|403)
    echo "FAIL: the credential was rejected." >&2
    printf '%s\n' "$body" | head -c 600 >&2; echo >&2
    echo "  Confirm the key is a current OpenRouter key (sk-or-v1-...) in ANTHROPIC_AUTH_TOKEN," >&2
    echo "  not ANTHROPIC_API_KEY, and that it has credit." >&2
    exit 1
    ;;
  *)
    echo "FAIL: unexpected status." >&2
    printf '%s\n' "$body" | head -c 600 >&2; echo >&2
    exit 1
    ;;
esac
