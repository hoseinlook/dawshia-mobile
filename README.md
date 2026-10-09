# Dawshia Mobile

A competitive bodyweight-training app: the phone camera watches you, counts every valid rep on the device, and turns workouts into chess-style timed matches.

**Current scope:** offline practice mode with **push-ups**, **pull-ups** and **muscle-ups**. The code is structured so that more exercises and online 1v1 (through `dawshia-server`) can be added without restructuring.

## Run it

The camera and on-device ML need native code, so the app does **not** run in Expo Go, and the camera doesn't work in simulators. Use a real phone.

```sh
npm install
npm run ios       # or: npm run android   (builds a dev client and installs it)
npm start         # later runs: just start Metro
```

`npm run ios` needs Xcode and CocoaPods. `npm run android` needs Android Studio. You can also build in the cloud with `npx eas-cli@latest build --profile development`.

Other scripts: `npm test` · `npm run typecheck` · `npm run lint`

### Install a standalone app (release build)

A development build loads its JavaScript (and the pose model) from Metro over Wi-Fi, so it opens slowly. For everyday use, install a release build instead. It contains everything and doesn't need your computer:

```sh
npx expo prebuild --platform android --clean   # only after app.json / native changes
npm run android:release                        # builds, installs and opens it on the connected phone
```

The APK is in `android/app/build/outputs/apk/release/`. It's signed with the debug key, which is fine for your own phones. Publishing to Google Play needs your own upload key.

## How it works

```
Camera frame (YUV)
  └─▶ GPU resize + rotate + letterbox to 192×192 RGB   (react-native-vision-camera-resizer)
      └─▶ MoveNet Lightning pose model (TFLite, CPU)     (react-native-fast-tflite)
          └─▶ 17 keypoints ─▶ JS thread
              └─▶ ExerciseAnalyzer (push-up rules) ─▶ rep / rejected-rep events
                  └─▶ matchReducer (clock + score) ─▶ UI  (+ MatchTransport → server, later)
```

All frame processing runs on the camera thread (worklets). Video never leaves the phone.

## Project structure

```
src/
  app/                        Expo Router screens (thin; just wiring)
    index.tsx                 menu step 1: pick the movement
    exercise/[exerciseId].tsx menu step 2: pick one of that movement's competition types
    settings.tsx              language, cheer sounds, server address
    profile.tsx               reps per movement: today / this month / total (+ ranked ratings)
    session/[exerciseId].tsx  live session
    results.tsx               after-match summary
  core/                       pure TypeScript, no React or native code — unit tested
    pose/                     model-agnostic Pose type, geometry, smoothing
    exercises/
      types.ts                ExerciseDefinition / ExerciseAnalyzer interfaces
      repStateMachine.ts      reusable rep detector (start → far → start)
      registry.ts             list of available exercises
      pushup/                 push-up rules (side view, landscape)
      pullup/                 pull-up rules (front view, portrait)
      muscleup/               muscle-up rules (front view, portrait, room above the bar)
    match/                    time controls, match state machine, scoring
  features/
    audio/                    voice cheers after each valid rep (assets/sounds/cheers/<lang>/)
    pose/                     camera → keypoints pipeline, MoveNet decoder, skeleton overlay
    session/                  useMatchSession (pose → analyzer → match) + HUD components
    settings/                 device preferences (language), saved to a JSON file
  services/                   BACKEND BOUNDARY
    types.ts                  Auth / Matchmaking / MatchTransport / History interfaces
    local/                    offline implementation (history saved in a JSON file on the device)
    remote/                   Dawshia server (Nakama REST): profile + practice sync, falls back to local
    ServicesProvider.tsx      picks the implementation
  i18n/                       translations (fa default, en), RTL + digit helpers
  ui/                         theme, shared components and hooks
assets/models/                TFLite models
```

## Add a new exercise

1. Create `src/core/exercises/<name>/`.
2. Implement an `ExerciseAnalyzer`. Most exercises can reuse `RepStateMachine` with a joint-angle signal:
   - squat: knee angle, `startZone: 'high'`
   - pull-up: elbow angle, `startZone: 'low'`
3. Export an `ExerciseDefinition` with its camera setup (orientation and view) and the competition types it offers (`competitions`). The menu only shows those types, so a movement like a handstand can offer a single type.
4. Add it to the list in `src/core/exercises/registry.ts`.
5. Add its texts under `exercises.<id>` (name, description, setup instructions), plus any new form-cue codes under `cues`, in **every** file in `src/i18n/messages/`. TypeScript reports any missing keys.
6. Add tests using the synthetic pose helpers in `src/core/pose/testing/`.

Nothing in `features/`, `app/` or `services/` needs to change.

## Languages

Persian (`fa`, right-to-left) is the default; English (`en`) can be picked in **Settings** (the ⚙ button on the home screen). The choice is saved on the device.

- All UI text lives in `src/i18n/messages/`. `fa.ts` defines the shape, and every other language must match it, which TypeScript checks.
- Core logic never contains display text: exercises, cues and time controls expose only ids/codes, and the UI looks up their text (`src/i18n/lookup.ts`).
- In components, use `const { m, f, n, dir, textStart } = useI18n()`:
  - `m`: the messages
  - `f`: fills placeholders
  - `n`: localizes digits (۱۲۳)
  - `dir`: put it on the screen's root view for RTL layout
  - `textStart`: start-aligned text
- To add a language: create `src/i18n/messages/<id>.ts` typed as `Messages` and register it in `src/i18n/locales.ts`.

## Accounts, profile and server

- **Login:** on launch the app shows a sign-in / sign-up screen (email + password, via Nakama's email auth).
  - The session is saved on the phone and refreshed automatically, so you stay signed in for 30 days of inactivity.
  - **Continue offline** skips the account. Practice still works, and stats stay on the phone.
- **Server address:** hard-coded in `src/services/remote/config.ts` (`SERVER_URL`, currently `http://192.168.1.105:7350`). TODO: make it configurable per build and use HTTPS for release builds.
- **Profile** (👤 on the home screen): each movement's valid reps **today**, **this month** and **in total**.
  - Signed in, it reads from the server, and every finished practice session is sent there.
  - Offline, or when the server is unreachable, it uses the history saved on the phone and shows the technical reason.
- **Debugging the connection:** Settings → Server → **Test connection** shows the round-trip time or the exact error. Network failures are also logged as `[dawshia] …` warnings (`adb logcat | grep dawshia`).
- **Code:**
  - `src/features/auth/`: session, refresh, login state
  - `src/services/remote/`: Nakama API client and server-backed services
  - `src/app/login.tsx`: the login screen
- **Known limit:** the session is stored in the app's private files, not the OS keychain. Moving it to `expo-secure-store` needs a native rebuild.

## Connect the backend for 1v1

Screens and hooks only use the interfaces in `src/services/types.ts`. To go online:

1. Add `src/services/remote/` implementing the same interfaces with the Nakama JS client (`@heroiclabs/nakama-js`):
   - `MatchmakingService.findMatch` → Nakama matchmaker
   - `MatchTransport` → real-time match socket
2. Return it from `ServicesProvider` when online.
3. Opponent rep events arrive through `MatchTransport.subscribe` and feed the same `matchReducer`. The second score bar slot in `SessionScreen` is already reserved for them.

## Cheer sounds

After every valid rep a random voice clip plays in the current language (never the same one twice in a row). Turn it off in Settings.

The Persian clips are generated placeholders. Record your own (a short `.m4a` each) and replace the files in `assets/sounds/cheers/fa/`, keeping the same names. To add clips, list them in `src/features/audio/cheers.ts`.

## Tuning detection

The thresholds are in `PUSHUP_THRESHOLDS` (`src/core/exercises/pushup/pushupAnalyzer.ts`), `PULLUP_THRESHOLDS` (`src/core/exercises/pullup/pullupAnalyzer.ts`) and `MUSCLEUP_THRESHOLDS` (`src/core/exercises/muscleup/muscleupAnalyzer.ts`). During a session, the live elbow angle is shown in the bottom-right corner to help tuning on real devices.

## CI and releases (GitHub)

- **CI** (`.github/workflows/ci.yml`) runs typecheck, lint and tests on every push to `main` and every pull request.
- **Release** (`.github/workflows/release.yml`): pushing a version tag builds the Android APK on GitHub and attaches it to a GitHub Release:

  ```sh
  git tag v0.1.0
  git push origin v0.1.0
  ```

  The tag sets the app's version name (`0.1.0`). The workflow run number becomes the `versionCode`, so it always increases. Tags with a hyphen (e.g. `v0.2.0-beta.1`) are published as pre-releases.

### Release signing (one-time setup)

Android only installs an update over an existing app if both are signed with the **same key**. Create a release key once and keep it safe; if it's lost, users must uninstall to update.

```sh
keytool -genkeypair -v -keystore dawshia-release.keystore -alias dawshia \
  -keyalg RSA -keysize 2048 -validity 10000
base64 -i dawshia-release.keystore | pbcopy   # copies the keystore as text
```

Add these **repository secrets** (GitHub → Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | the copied base64 text |
| `ANDROID_KEYSTORE_PASSWORD` | the keystore password |
| `ANDROID_KEY_ALIAS` | `dawshia` |
| `ANDROID_KEY_PASSWORD` | the key password |

Without these secrets the release still works, but the APK is debug-signed (a warning appears in the run).

**Never commit the keystore.** `*.jks`, `*.keystore` and `*.p12` files are git-ignored.

> The server address is hard-coded (`src/services/remote/config.ts`). APKs built on GitHub point at `192.168.1.105`, which only works on your home network until a public server exists.

## License

[MIT](LICENSE) © 2026 Hossein Lookzadeh
