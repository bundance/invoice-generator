#!/usr/bin/env python3
"""Regression tests for the repository Git write isolation hook."""

import importlib.util
import unittest
from pathlib import Path
from typing import Optional


HOOK_PATH = Path(__file__).with_name("enforce_isolated_git_writes.py")
HOOK_SPEC = importlib.util.spec_from_file_location("enforce_isolated_git_writes", HOOK_PATH)
assert HOOK_SPEC and HOOK_SPEC.loader
HOOK = importlib.util.module_from_spec(HOOK_SPEC)
HOOK_SPEC.loader.exec_module(HOOK)


def event(
    command: str,
    hook_event_name: str = "PreToolUse",
    cwd: Optional[str] = None,
) -> dict:
    return {
        "hook_event_name": hook_event_name,
        "tool_name": "Bash",
        "cwd": cwd or str(HOOK.REPOSITORY_ROOT),
        "tool_input": {"command": command},
    }


class GitWriteIsolationTests(unittest.TestCase):
    def assert_pre_tool_use_denied(self, command: str) -> None:
        decision = HOOK.evaluate_event(event(command))
        self.assertIsNotNone(decision)
        output = decision["hookSpecificOutput"]
        self.assertEqual(output["hookEventName"], "PreToolUse")
        self.assertEqual(output["permissionDecision"], "deny")

    def test_allows_direct_git_add(self) -> None:
        self.assertIsNone(HOOK.evaluate_event(event("git add -- app.json")))

    def test_allows_direct_git_commit_with_quoted_shell_text(self) -> None:
        command = "git commit -m 'test: preserve && and $HOME as text'"
        self.assertIsNone(HOOK.evaluate_event(event(command)))

    def test_ignores_unrelated_commands_that_mention_git_add(self) -> None:
        self.assertIsNone(HOOK.evaluate_event(event("rg 'git add' AGENTS.md")))

    def test_blocks_chained_git_add(self) -> None:
        self.assert_pre_tool_use_denied("git add -- app.json && git status --short")

    def test_blocks_git_commit_after_another_command(self) -> None:
        self.assert_pre_tool_use_denied("git diff --staged --check && git commit -m test")

    def test_blocks_shell_wrapped_git_add(self) -> None:
        self.assert_pre_tool_use_denied("/bin/zsh -lc 'git add -- app.json'")

    def test_blocks_environment_wrapped_git_commit(self) -> None:
        self.assert_pre_tool_use_denied("env GIT_EDITOR=true git commit -m test")

    def test_blocks_git_global_options_before_add(self) -> None:
        self.assert_pre_tool_use_denied("git -C /example add -- app.json")

    def test_blocks_redirection(self) -> None:
        self.assert_pre_tool_use_denied("git add -- app.json > staging.log")

    def test_blocks_command_substitution(self) -> None:
        self.assert_pre_tool_use_denied("echo $(git add -- app.json)")

    def test_blocks_malformed_git_write_command(self) -> None:
        self.assert_pre_tool_use_denied("git add 'unterminated")

    def test_denies_fallback_approval_for_direct_git_write(self) -> None:
        decision = HOOK.evaluate_event(event("git commit -m test", "PermissionRequest"))
        self.assertIsNotNone(decision)
        output = decision["hookSpecificOutput"]
        self.assertEqual(output["hookEventName"], "PermissionRequest")
        self.assertEqual(output["decision"]["behavior"], "deny")

    def test_does_not_decide_unrelated_approval_requests(self) -> None:
        self.assertIsNone(
            HOOK.evaluate_event(event("timeout 300 vp run test", "PermissionRequest"))
        )

    def test_does_not_apply_outside_repository(self) -> None:
        self.assertIsNone(
            HOOK.evaluate_event(event("git add -- app.json", cwd="/private/tmp"))
        )

    def test_rejects_missing_bash_command(self) -> None:
        malformed_event = event("git add -- app.json")
        malformed_event["tool_input"] = {}
        with self.assertRaisesRegex(ValueError, "string command"):
            HOOK.evaluate_event(malformed_event)


if __name__ == "__main__":
    unittest.main()
