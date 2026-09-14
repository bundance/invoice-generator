#!/bin/bash

set -euo pipefail

readonly PROJECT_ROOT="$(git rev-parse --show-toplevel)"
readonly STATE_DIRECTORY="$PROJECT_ROOT/.codex/pstack-state/verify-invoice-generator"
readonly CURRENT_RUN_FILE="$STATE_DIRECTORY/current-run"
readonly DEFAULT_CDP_PORT="9333"
readonly EVIDENCE_ROOT="${INVOICE_VERIFY_EVIDENCE_ROOT:-$STATE_DIRECTORY/evidence}"
readonly APP_EXECUTABLE="${INVOICE_VERIFY_APP_EXECUTABLE:-}"
readonly ARTIFACT_PATH="${INVOICE_VERIFY_ARTIFACT_PATH:-}"
readonly STATE_FIXTURE="${INVOICE_VERIFY_STATE_FIXTURE:-}"

SESSION_ELECTRON_PID=""

state_value() {
  local name="$1"
  local run_directory
  local value
  run_directory="$(<"$CURRENT_RUN_FILE")"
  IFS= read -r value <"$run_directory/$name"
  printf '%s\n' "$value"
}

require_run() {
  if [[ ! -f "$CURRENT_RUN_FILE" ]]; then
    echo "No verification run is active. Run '$0 start' first." >&2
    exit 1
  fi
}

browser() {
  require_run
  if [[ "${1:-}" == "eval" ]]; then
    echo "Browser eval is disabled. Verify behavior through visible controls." >&2
    return 2
  fi
  local session_name
  local cdp_port
  session_name="$(state_value session)"
  cdp_port="$(state_value port)"
  timeout 60 agent-browser --session "$session_name" --cdp "$cdp_port" "$@"
}

evidence_directory() {
  require_run
  state_value run-directory
}

state_sha256() {
  require_run
  local user_data_directory
  local state_path
  user_data_directory="$(state_value user-data-directory)"
  state_path="$user_data_directory/state.json"
  if [[ ! -f "$state_path" ]]; then
    echo "No workspace state exists at $state_path." >&2
    return 1
  fi
  shasum -a 256 "$state_path" | awk '{print $1}'
}

validate_label() {
  local label="$1"
  if [[ ! "$label" =~ ^[a-z0-9]+([a-z0-9-]*[a-z0-9])?$ ]]; then
    echo "Use a lowercase evidence label containing letters, digits, and hyphens." >&2
    exit 1
  fi
}

doctor() {
  require_run
  local app_pid
  local cdp_port
  app_pid="$(state_value pid)"
  cdp_port="$(state_value port)"

  if [[ ! "$app_pid" =~ ^[1-9][0-9]*$ ]] || ! kill -0 "$app_pid" 2>/dev/null; then
    echo "The recorded Electron process $app_pid is not running." >&2
    exit 1
  fi

  timeout 60 agent-browser doctor --offline --quick
  timeout 10 curl --fail --silent --show-error "http://127.0.0.1:$cdp_port/json/version" >/dev/null
  browser tab
}

capture() {
  require_run
  local label="${1:-}"
  local run_directory
  validate_label "$label"

  run_directory="$(evidence_directory)"
  browser snapshot -i >"$run_directory/$label.snapshot.txt"
  browser screenshot "$run_directory/$label.png"
  browser tab >"$run_directory/$label.tabs.txt"
  browser errors >"$run_directory/$label.errors.txt"
  echo "$run_directory"
}

capture_workspace() {
  require_run
  local label="${1:-}"
  local run_directory
  local source_directory
  local destination_directory
  validate_label "$label"

  run_directory="$(evidence_directory)"
  source_directory="$(state_value user-data-directory)"
  destination_directory="$run_directory/$label-workspace"
  mkdir -p "$destination_directory"
  cp "$source_directory/state.json" "$destination_directory/state.json"
  if [[ -d "$source_directory/retained-pdfs" ]]; then
    cp -R "$source_directory/retained-pdfs" "$destination_directory/retained-pdfs"
  fi
  echo "$destination_directory"
}

audit() {
  require_run
  local label="${1:-}"
  local run_directory
  validate_label "$label"

  run_directory="$(evidence_directory)"
  browser a11y --tags wcag2a,wcag2aa | tee "$run_directory/$label.a11y.txt"
}

stop_run() {
  if [[ ! -f "$CURRENT_RUN_FILE" ]]; then
    echo "No verification run is active."
    return
  fi

  local run_directory
  local app_pid
  local session_name
  local user_data_directory
  run_directory="$(<"$CURRENT_RUN_FILE")"
  app_pid="$(<"$run_directory/pid")"
  session_name="$(<"$run_directory/session")"
  user_data_directory="$(<"$run_directory/user-data-directory")"

  timeout 60 agent-browser --session "$session_name" close >/dev/null 2>&1 || true

  if [[ "$app_pid" =~ ^[1-9][0-9]*$ ]] && kill -0 "$app_pid" 2>/dev/null; then
    local process_command
    local process_state
    process_command="$(ps -p "$app_pid" -o command=)"
    if [[ "$process_command" == *"$user_data_directory"* ]]; then
      kill "$app_pid"
      for _ in {1..20}; do
        process_state="$(ps -p "$app_pid" -o stat= 2>/dev/null || true)"
        if [[ -z "$process_state" || "$process_state" == Z* ]]; then
          break
        fi
        sleep 0.25
      done
      process_state="$(ps -p "$app_pid" -o stat= 2>/dev/null || true)"
      if [[ -n "$process_state" && "$process_state" != Z* ]]; then
        kill -KILL "$app_pid"
      fi
    else
      echo "Refusing to stop process $app_pid because its command does not name the recorded user-data directory." >&2
      exit 1
    fi
  fi

  case "$user_data_directory" in
    */invoice-generator-verify.*)
      rm -rf -- "$user_data_directory"
      ;;
    *)
      echo "Refusing to remove unexpected user-data directory: $user_data_directory" >&2
      exit 1
      ;;
  esac

  rm -f -- "$CURRENT_RUN_FILE"
  echo "Stopped the verification app. Evidence remains in $run_directory"
}

start_run() {
  if [[ -f "$CURRENT_RUN_FILE" ]]; then
    echo "A verification run is already recorded. Run '$0 doctor' or '$0 stop'." >&2
    exit 1
  fi

  cd "$PROJECT_ROOT"
  if [[ -z "$APP_EXECUTABLE" ]]; then
    timeout 300 vp build
  elif [[ ! -x "$APP_EXECUTABLE" ]]; then
    echo "The configured Invoice Generator executable is not executable: $APP_EXECUTABLE" >&2
    exit 1
  fi
  if [[ -n "$STATE_FIXTURE" && ! -f "$STATE_FIXTURE" ]]; then
    echo "The configured workspace fixture does not exist: $STATE_FIXTURE" >&2
    exit 1
  fi
  if [[ -n "$ARTIFACT_PATH" && ! -f "$ARTIFACT_PATH" ]]; then
    echo "The configured release artifact does not exist: $ARTIFACT_PATH" >&2
    exit 1
  fi
  timeout 60 agent-browser doctor --offline --quick

  local run_id
  local run_directory
  local user_data_directory
  local session_name
  local cdp_port
  run_id="$(date -u +%Y%m%dT%H%M%SZ)"
  run_directory="$EVIDENCE_ROOT/$run_id"
  user_data_directory="$(mktemp -d "${TMPDIR:-/tmp}/invoice-generator-verify.XXXXXX")"
  session_name="$(timeout 60 agent-browser session id --scope worktree --prefix verify-invoice-generator)"
  cdp_port="${INVOICE_VERIFY_CDP_PORT:-$DEFAULT_CDP_PORT}"

  mkdir -p "$run_directory"
  if [[ -n "$STATE_FIXTURE" ]]; then
    cp "$STATE_FIXTURE" "$user_data_directory/state.json"
  fi
  printf '%s\n' "$run_directory" >"$CURRENT_RUN_FILE"
  printf '%s\n' "$run_directory" >"$run_directory/run-directory"
  printf '%s\n' "$user_data_directory" >"$run_directory/user-data-directory"
  printf '%s\n' "$session_name" >"$run_directory/session"
  printf '%s\n' "$cdp_port" >"$run_directory/port"
  printf '%s\n' "$$" >"$run_directory/pid"
  printf '%s\n' "${APP_EXECUTABLE:-source-build}" >"$run_directory/app-executable"
  if [[ -n "$ARTIFACT_PATH" ]]; then
    printf '%s\n' "$ARTIFACT_PATH" >"$run_directory/artifact-path"
    shasum -a 256 "$ARTIFACT_PATH" | awk '{print $1}' >"$run_directory/artifact-sha256"
  fi
  if [[ -n "$STATE_FIXTURE" ]]; then
    printf '%s\n' "$STATE_FIXTURE" >"$run_directory/state-fixture"
    shasum -a 256 "$STATE_FIXTURE" | awk '{print $1}' >"$run_directory/state-sha256-before"
  fi

  echo "Electron starting. Keep this terminal open. Evidence: $run_directory"
  if [[ -n "$APP_EXECUTABLE" ]]; then
    exec "$APP_EXECUTABLE" \
      "--remote-debugging-port=$cdp_port" \
      "--user-data-dir=$user_data_directory" \
      >"$run_directory/electron.stdout.log" \
      2>"$run_directory/electron.stderr.log"
  else
    exec "$PROJECT_ROOT/node_modules/.bin/electron" \
      "$PROJECT_ROOT/.agents/skills/verify-invoice-generator/scripts/launch-main.cjs" \
      "--verification-cdp-port=$cdp_port" \
      "--verification-user-data-directory=$user_data_directory" \
      >"$run_directory/electron.stdout.log" \
      2>"$run_directory/electron.stderr.log"
  fi
}

connect_run() {
  require_run
  local app_pid
  local cdp_port
  local session_name
  app_pid="$(state_value pid)"
  cdp_port="$(state_value port)"
  session_name="$(state_value session)"

  if [[ ! "$app_pid" =~ ^[1-9][0-9]*$ ]] || ! kill -0 "$app_pid" 2>/dev/null; then
    echo "The Electron start terminal is no longer running. Inspect the current run's logs, then run '$0 stop'." >&2
    exit 1
  fi

  local cdp_ready="false"
  for _ in {1..30}; do
    if timeout 2 curl --fail --silent "http://127.0.0.1:$cdp_port/json/version" >/dev/null 2>&1; then
      cdp_ready="true"
      break
    fi
    sleep 1
  done

  if [[ "$cdp_ready" != "true" ]]; then
    echo "Electron did not expose CDP within 30 seconds. Inspect the current run's Electron logs." >&2
    exit 1
  fi

  timeout 60 agent-browser doctor --offline --quick
  timeout 60 agent-browser --session "$session_name" connect "$cdp_port"
  capture launch >/dev/null
  echo "Verification app ready. Evidence: $(evidence_directory)"
}

session_cleanup() {
  trap - EXIT INT TERM
  stop_run

  if [[ "$SESSION_ELECTRON_PID" =~ ^[1-9][0-9]*$ ]]; then
    wait "$SESSION_ELECTRON_PID" 2>/dev/null || true
  fi
}

run_session_command() {
  local command="${1:-}"
  if (($# > 0)); then
    shift
  fi

  case "$command" in
    doctor)
      doctor
      ;;
    browser)
      if (($# == 0)); then
        echo "The browser session command requires agent-browser arguments." >&2
        return 2
      fi
      browser "$@"
      ;;
    capture)
      capture "${1:-}"
      ;;
    capture-workspace)
      capture_workspace "${1:-}"
      ;;
    audit)
      audit "${1:-}"
      ;;
    evidence)
      evidence_directory
      ;;
    state-sha256)
      state_sha256
      ;;
    *)
      echo "Session commands: doctor, browser <args...>, capture <label>, capture-workspace <label>, audit <label>, evidence, state-sha256, stop" >&2
      return 2
      ;;
  esac
}

session_run() {
  if [[ -f "$CURRENT_RUN_FILE" ]]; then
    echo "A verification run is already recorded. Run '$0 doctor' or '$0 stop'." >&2
    exit 1
  fi

  "$PROJECT_ROOT/.agents/skills/verify-invoice-generator/scripts/verify-electron.sh" start &
  SESSION_ELECTRON_PID="$!"
  trap session_cleanup EXIT
  trap 'exit 130' INT TERM

  local run_recorded="false"
  for _ in {1..390}; do
    if [[ -f "$CURRENT_RUN_FILE" ]]; then
      run_recorded="true"
      break
    fi
    if ! kill -0 "$SESSION_ELECTRON_PID" 2>/dev/null; then
      wait "$SESSION_ELECTRON_PID" 2>/dev/null || true
      echo "Electron verification exited before recording a run." >&2
      exit 1
    fi
    sleep 1
  done

  if [[ "$run_recorded" != "true" ]]; then
    echo "Electron verification did not record a run within 390 seconds." >&2
    exit 1
  fi

  connect_run
  echo "Verification session ready. Send one tab-delimited command per line; send 'stop' to finish."

  local -a command_parts
  local command_status
  while IFS=$'\t' read -r -a command_parts; do
    if ((${#command_parts[@]} == 0)) || [[ -z "${command_parts[0]}" ]]; then
      continue
    fi
    if [[ "${command_parts[0]}" == "stop" ]]; then
      break
    fi

    if (set -e; run_session_command "${command_parts[@]}"); then
      echo "verification-command-complete"
    else
      command_status="$?"
      echo "verification-command-failed:$command_status" >&2
    fi
  done

  session_cleanup
  SESSION_ELECTRON_PID=""
}

case "${1:-}" in
  session)
    session_run
    ;;
  start)
    start_run
    ;;
  connect)
    connect_run
    ;;
  doctor)
    doctor
    ;;
  browser)
    shift
    browser "$@"
    ;;
  capture)
    capture "${2:-}"
    ;;
  audit)
    audit "${2:-}"
    ;;
  evidence)
    evidence_directory
    ;;
  stop)
    stop_run
    ;;
  *)
    echo "Usage: $0 {session|start|connect|doctor|browser <args...>|capture <label>|audit <label>|evidence|stop}" >&2
    exit 1
    ;;
esac
