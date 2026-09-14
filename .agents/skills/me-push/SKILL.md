---
name: me-push
description: Publish the current feature branch through a GitHub pull request, merge it, and synchronize local main when the user explicitly asks to push or publish completed branch work.
---

# Publish and merge the current branch

Complete the publication workflow and leave the checkout on the updated `main` branch.

Run permitted commands with the default sandbox first. Retry the exact command with escalation only after a sandbox failure.

1. Read the repository guidance. Inspect the current branch, working tree, remote, and existing pull requests.
2. Continue only from a non-`main` branch with no uncommitted changes that require the user's decision.
3. Push the current branch with `timeout 300 git push -u origin HEAD`.
4. Reuse its existing pull request. If none exists, create one with `gh pr create --repo bundance/invoice-generator --base main --head <current-branch> --title <title> --body <body>`. Never create a duplicate pull request.
5. Merge using the repository's established method and `gh pr merge <number> --repo bundance/invoice-generator --merge --delete-branch=false`. Verify that GitHub reports it as merged.
6. Switch the local checkout to `main`, run `timeout 300 git fetch origin`, then run `timeout 300 git merge --ff-only origin/main`.
7. Verify that local `main` matches `origin/main`. Report the pull request URL and merge commit SHA.

Stop and report the exact blocker if the current branch is `main`, the working tree needs a user decision, the remote or pull request state cannot be verified, or updating `main` would discard local work. Keep local and remote branches unless the user asks to delete them.
