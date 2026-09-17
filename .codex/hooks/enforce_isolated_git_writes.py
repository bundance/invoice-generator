#!/usr/bin/env python3
"""Require direct, isolated git add and git commit shell invocations.

Saved Codex rules allow direct `git add` and `git commit` commands to cross the
workspace-write sandbox without an approval prompt. This hook blocks command
shapes that bypass those rules and denies fallback approval requests.
"""

import json
import os
import re
import shlex
import sys
from pathlib import Path
from typing import List, Optional, Sequence


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
GIT_WRITE_SUBCOMMANDS = {"add", "commit"}
SHELL_CONTROL_TOKENS = {
    "&",
    "&&",
    "|",
    "||",
    ";",
    "(",
    ")",
    "<",
    ">",
    "<<",
    ">>",
}
SHELL_RESERVED_PREFIXES = {
    "do",
    "elif",
    "else",
    "if",
    "then",
    "while",
    "until",
    "{",
}
SHELL_WRAPPERS = {"bash", "dash", "sh", "zsh"}
TRANSPARENT_WRAPPERS = {"command", "nohup", "sudo"}
GIT_GLOBAL_OPTIONS_WITH_VALUE = {
    "-C",
    "-c",
    "--exec-path",
    "--git-dir",
    "--namespace",
    "--super-prefix",
    "--work-tree",
}
ASSIGNMENT_PATTERN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*=")
LIKELY_GIT_WRITE_PATTERN = re.compile(r"(?<![A-Za-z0-9_-])git\s+(?:add|commit)\b")
BACKTICK_GIT_WRITE_PATTERN = re.compile(
    r"`[^`]*\bgit\s+(?:add|commit)\b[^`]*`",
    re.DOTALL,
)


def cwd_is_in_repository(cwd: str) -> bool:
    candidate = Path(cwd).expanduser().resolve()
    return candidate == REPOSITORY_ROOT or REPOSITORY_ROOT in candidate.parents


def tokenize_shell(command: str) -> Optional[List[str]]:
    try:
        lexer = shlex.shlex(command, posix=True, punctuation_chars=";&|()<>")
        lexer.commenters = ""
        lexer.whitespace_split = True
        return list(lexer)
    except ValueError:
        return None


def git_write_subcommand(tokens: Sequence[str]) -> Optional[str]:
    if not tokens or os.path.basename(tokens[0]) != "git":
        return None

    token_index = 1
    while token_index < len(tokens):
        token = tokens[token_index]
        if token in GIT_WRITE_SUBCOMMANDS:
            return token
        if token == "--":
            token_index += 1
            continue
        if token in GIT_GLOBAL_OPTIONS_WITH_VALUE:
            token_index += 2
            continue
        if token.startswith("-"):
            token_index += 1
            continue
        return None

    return None


def split_command_segments(tokens: Sequence[str]) -> List[List[str]]:
    segments: List[List[str]] = []
    current_segment: List[str] = []

    for token in tokens:
        if token in SHELL_CONTROL_TOKENS:
            if current_segment:
                segments.append(current_segment)
                current_segment = []
            continue
        current_segment.append(token)

    if current_segment:
        segments.append(current_segment)

    return segments


def strip_command_prefixes(tokens: Sequence[str]) -> List[str]:
    remaining_tokens = list(tokens)

    while remaining_tokens and (
        remaining_tokens[0] in SHELL_RESERVED_PREFIXES
        or ASSIGNMENT_PATTERN.match(remaining_tokens[0])
    ):
        remaining_tokens.pop(0)

    return remaining_tokens


def shell_wrapper_command(tokens: Sequence[str]) -> Optional[str]:
    if not tokens or os.path.basename(tokens[0]) not in SHELL_WRAPPERS:
        return None

    for option_index, token in enumerate(tokens[1:], start=1):
        if token == "-c" or (token.startswith("-") and "c" in token[1:]):
            command_index = option_index + 1
            return tokens[command_index] if command_index < len(tokens) else ""

    return None


def unwrap_transparent_command(tokens: Sequence[str]) -> List[str]:
    remaining_tokens = list(tokens)

    while remaining_tokens:
        executable = os.path.basename(remaining_tokens[0])

        if executable == "env":
            remaining_tokens.pop(0)
            while remaining_tokens and (
                remaining_tokens[0].startswith("-")
                or ASSIGNMENT_PATTERN.match(remaining_tokens[0])
            ):
                remaining_tokens.pop(0)
            continue

        if executable in TRANSPARENT_WRAPPERS:
            remaining_tokens.pop(0)
            while remaining_tokens and remaining_tokens[0].startswith("-"):
                remaining_tokens.pop(0)
            continue

        if executable == "timeout":
            remaining_tokens.pop(0)
            while remaining_tokens and remaining_tokens[0].startswith("-"):
                remaining_tokens.pop(0)
            if remaining_tokens:
                remaining_tokens.pop(0)
            continue

        break

    return remaining_tokens


def segment_invokes_git_write(tokens: Sequence[str]) -> bool:
    command_tokens = unwrap_transparent_command(strip_command_prefixes(tokens))
    if not command_tokens:
        return False

    wrapped_command = shell_wrapper_command(command_tokens)
    if wrapped_command is not None:
        return command_invokes_git_write(wrapped_command)

    return git_write_subcommand(command_tokens) is not None


def command_invokes_git_write(command: str) -> bool:
    if BACKTICK_GIT_WRITE_PATTERN.search(command):
        return True

    tokens = tokenize_shell(command)
    if tokens is None:
        return bool(LIKELY_GIT_WRITE_PATTERN.search(command))

    return any(segment_invokes_git_write(segment) for segment in split_command_segments(tokens))


def has_unquoted_shell_feature(command: str) -> bool:
    quote: Optional[str] = None
    escaped = False

    for character in command:
        if escaped:
            escaped = False
            continue
        if character == "\\" and quote != "'":
            escaped = True
            continue
        if quote:
            if character == quote:
                quote = None
            elif quote == '"' and character in {"$", "`"}:
                return True
            continue
        if character in {"'", '"'}:
            quote = character
            continue
        if character in ";&|<>\n()`$*?[":
            return True

    return quote is not None or escaped


def is_isolated_direct_git_write(command: str) -> bool:
    if has_unquoted_shell_feature(command):
        return False

    try:
        tokens = shlex.split(command, posix=True)
    except ValueError:
        return False

    return (
        len(tokens) >= 2
        and tokens[0] == "git"
        and tokens[1] in GIT_WRITE_SUBCOMMANDS
    )


def pre_tool_use_denial(reason: str) -> dict:
    return {
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": reason,
        }
    }


def permission_request_denial(reason: str) -> dict:
    return {
        "hookSpecificOutput": {
            "hookEventName": "PermissionRequest",
            "decision": {
                "behavior": "deny",
                "message": reason,
            },
        }
    }


def event_command(event: dict) -> str:
    tool_input = event.get("tool_input")
    if not isinstance(tool_input, dict):
        raise ValueError("Bash hook input must be a JSON object.")

    command = tool_input.get("command")
    if not isinstance(command, str):
        raise ValueError("Bash hook input must contain a string command.")

    return command


def evaluate_event(event: dict) -> Optional[dict]:
    hook_event_name = event.get("hook_event_name")
    if hook_event_name not in {"PreToolUse", "PermissionRequest"}:
        return None

    if event.get("tool_name") != "Bash":
        return None

    cwd = event.get("cwd")
    if not isinstance(cwd, str) or not cwd:
        raise ValueError("Bash hook input must contain a working directory.")
    if not cwd_is_in_repository(cwd):
        return None

    command = event_command(event)
    if not command_invokes_git_write(command):
        return None

    if hook_event_name == "PreToolUse" and not is_isolated_direct_git_write(command):
        return pre_tool_use_denial(
            "Run git add or git commit as a direct, isolated command. Do not use "
            "a shell wrapper, command chain, pipe, redirection, substitution, "
            "environment prefix, wildcard, or timeout wrapper."
        )

    if hook_event_name == "PermissionRequest":
        return permission_request_denial(
            "This repository uses saved rules for isolated git add and git commit "
            "calls. The approval request was blocked; retry the Git write as one "
            "direct command or report that the saved rule is missing."
        )

    return None


def main() -> int:
    try:
        event = json.load(sys.stdin)
    except (json.JSONDecodeError, OSError) as error:
        print(f"Git write isolation hook received invalid JSON: {error}", file=sys.stderr)
        return 2

    if not isinstance(event, dict):
        print("Git write isolation hook expected a JSON object.", file=sys.stderr)
        return 2

    try:
        decision = evaluate_event(event)
    except ValueError as error:
        print(f"Git write isolation hook rejected malformed input: {error}", file=sys.stderr)
        return 2
    if decision:
        json.dump(decision, sys.stdout)
        sys.stdout.write("\n")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
