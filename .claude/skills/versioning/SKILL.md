---
name: versioning
description: Bump the semver version on every commit and tag it. Use whenever you are about to run `git commit` in this repo, and when asked to release, bump, or tag a version. Keeps package.json, package-lock.json and git tags `v<x.y.z>` in sync, and picks major/minor/patch from the commit message.
---

# Versioning

Every commit in this repo carries a version bump. The version is kept the same in three places: `package.json`, `package-lock.json` and an annotated git tag `v<x.y.z>` on the commit that introduced it. Do not edit the version by hand. Use the script, because it also checks the tags that already exist.

## Commit flow

1. Stage the change as usual and write the commit message. It must follow the repo convention `[<n>-<type>]: <description>`.
2. Bump the version. This runs **before** committing, so the bump lands in the same commit as the change:
   ```bash
   node .claude/skills/versioning/scripts/version.mjs bump --message "$MSG"
   ```
   It prints `{"previous","next","releaseType"}` and stages `package.json` and `package-lock.json`.
3. Commit with the same message: `git commit -m "$MSG"`.
4. Tag it: `node .claude/skills/versioning/scripts/version.mjs tag`.
5. When pushing, include the tag: `git push -u origin <branch> --follow-tags`.

If the commit fails (hook, conflict), undo the bump with `git checkout HEAD -- package.json package-lock.json` before you retry. The next `bump` then starts from the right base.

## How the release type is chosen

| Commit | Release |
|---|---|
| `[n-feature!]: …`, or body line `BREAKING CHANGE: …` | major (minor while the version is `0.x`) |
| `[n-feature]` / `[n-feat]` | minor |
| `[n-fix]`, `bug`, `hotfix`, `perf`, `refactor`, `chore`, `docs`, `test`, `ci`, `build`, `style`, `revert` | patch |

Decide whether the change is breaking from the **diff**, not only from the message. It is breaking if it removes or renames an HTTP route, a TCP message pattern, or a field of a response or contract type. It is also breaking if it makes an optional request field required, or changes an error code. If the diff is breaking, add `!` to the type (`[n-feature!]`) or a `BREAKING CHANGE:` line to the body before bumping. If you are unsure, ask the user instead of guessing a patch.

To override the detection, use `--type major|minor|patch`. Use `--dry-run` to preview the result without writing anything. Pre-1.0, breaking changes only bump minor, so `1.0.0` never happens automatically. Going to `1.0.0` is a deliberate product decision. Do it only when the user asks, with `--set 1.0.0`, which also accepts any explicit version higher than the current one.

## Rules

- The base version is the higher of `package.json` and the highest `v*` tag on origin (the script fetches tags). This stops two branches from releasing the same number.
- Never move, delete or force-push an existing tag. If `tag` reports the tag points at another commit, re-run `bump` and amend your own unpushed commit, or ask the user.
- Never bump on merge commits, and never bump on `git commit --amend` of an already-bumped commit.
- The runtime reads its version from `package.json`. Never hardcode a version string in the source.
