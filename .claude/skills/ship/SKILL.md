---
name: ship
description: Ship Dawshia changes - check, commit, tag (only when there is a new feature or fix), push, deploy to dawshia.ir and verify. Use when the user says "commit and push and tag", "ship it", "release", "deploy", or finishes a feature in dawshia-server or dawshia-mobile.
---

# Ship Dawshia

Dawshia is two repos side by side in `calith_comp/`:

| Repo | Branch | What ships from it |
|---|---|---|
| `dawshia-server` | `main` | Nakama Go plugin (Docker on the server), the dawshia.ir website (`website/`), nginx config (`deploy/docker/nginx`) |
| `dawshia-mobile` | `master` | Android APK, web app at `https://dawshia.ir/app/` |

Production: `root@94.184.32.14`, domain `https://dawshia.ir`; only 22, 80 and 443 are open, and Nakama is reached through nginx (`/v2/`, `wss://dawshia.ir/ws`, `/healthcheck`).

Run the steps below for each repo with changes (`git status --short`, `git log <last-tag>..HEAD`). Skip a repo with nothing to ship.

## 1. Check

Stop and fix (or report) on any failure. Never commit red checks.

- **Server:** `gofmt -l .` (must print nothing), `go vet ./...`, `go test ./...`
- **Mobile:** `npx tsc --noEmit`, `npx expo lint`, `npx jest`
- **Mobile, web-sensitive changes** (anything under `src/` importing a native module, `app.json`, `public/`): `npx expo export -p web --output-dir <scratchpad>/web` must bundle. Native-only modules (vision-camera, fast-tflite, worklets, expo-file-system `File`) must stay behind a `.web.ts(x)` sibling (see `PoseCamera.web.tsx`, `textStore.web.ts`, `alert.web.ts`).

## 2. Decide the version

Find the last tag: `git tag --sort=-v:refname | head -1` (tags are `vMAJOR.MINOR.PATCH`).

- **New feature** (new screen, RPC, game mode, user-visible capability, new deploy target) → bump MINOR: `v0.14.0` → `v0.15.0`.
- **Fix / tuning / copy / small UI change** that users notice → bump PATCH: `v0.14.0` → `v0.14.1`.
- **Nothing user-facing** (docs, README, refactor without behavior change, CI, skills, tests only) → commit and push, **no tag**.

Tag each repo on its own; the two repos have independent versions. A mobile tag triggers the GitHub release workflow (APK/IPA assets), so don't tag mobile for non-app changes.

## 3. Commit, tag, push

- Stage only the files of this change; never commit secrets, `.env*`, `android/` build output, `dist/`, keystores.
- Commit message: imperative subject (≤ 72 chars), blank line, a short body saying what changed and why. End with the attribution line from the current system reminder, e.g.

  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```

- Then:

  ```sh
  git tag vX.Y.Z            # only if step 2 says so
  git push origin <branch> vX.Y.Z   # or just the branch when untagged
  ```

## 4. Deploy (only what changed)

| Changed | Deploy |
|---|---|
| Server Go code, `config/`, Dockerfile, compose | `dawshia-server/deploy/docker/deploy.sh root@94.184.32.14` (syncs, rebuilds, waits for `/healthcheck`) |
| `website/` or `deploy/docker/nginx/*` | `rsync -az website deploy root@94.184.32.14:/opt/dawshia/src/` then `ssh root@94.184.32.14 bash /opt/dawshia/src/deploy/docker/setup-nginx.sh dawshia.ir` |
| Mobile app code (web) | `dawshia-mobile/scripts/deploy-web.sh root@94.184.32.14` |
| Mobile app code (Android) | `npm run android:release` in `dawshia-mobile` (or `cd android && ./gradlew assembleRelease`), then `scp android/app/build/outputs/apk/release/app-release.apk root@94.184.32.14:/opt/dawshia/download/dawshia.apk` |

The APK is debug-signed: users who installed an older differently signed build must uninstall first.

## 5. Verify

```sh
for u in / /app/ /healthcheck /download/dawshia.apk; do curl -s -o /dev/null -w "$u %{http_code}\n" https://dawshia.ir$u; done
```

- Server or socket changes: run the e2e suites against production, e.g. `npx tsx scripts/e2e/online-1v1.ts https://dawshia.ir` (also `social`, `challenge`, `chat`, `players`).
- Web app changes: load `https://dawshia.ir/app/` in headless Chrome (playwright-core in the scratchpad) and check for page errors.
- **Clean up test accounts afterwards** (e2e users are `%@e2e.test`), then restart Nakama so the leaderboard rank cache forgets them:

  ```sh
  ssh root@94.184.32.14 "docker exec dawshia-postgres-1 psql -U nakama -d nakama -c \"DELETE FROM leaderboard_record WHERE owner_id IN (SELECT id FROM users WHERE email LIKE '%@e2e.test'); DELETE FROM message WHERE sender_id IN (SELECT id FROM users WHERE email LIKE '%@e2e.test'); DELETE FROM users WHERE email LIKE '%@e2e.test';\" && docker restart dawshia-nakama-1"
  ```

## 6. Report

Tell the user in a few lines: what shipped, the new tag(s) (or "no tag: nothing user-facing"), what was deployed and how it was verified, and anything that failed or was skipped.

## Rules

- Never print secrets from `/opt/dawshia/.env` (server key, passwords).
- Never send the user's email to a service (certbot runs with `--register-unsafely-without-email`).
- Never deploy to the Kubernetes cluster (`hwb-bare`) or open extra ports without asking.
- Never force-push or move an existing tag; if a tag is wrong, make the next version.
