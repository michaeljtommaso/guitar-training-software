---
name: run-app
description: Use when asked to run, start, launch, serve, or screenshot the Guitar Tutor app (apps/web) — the Vite React dev server. Captures the corepack/pnpm launch quirk on this machine so there's no hiccup.
---

# Run the Guitar Tutor app

The user-facing app is **`apps/web`** — a Vite + React app. The other
workspace (`apps/annotation-tool`) is an internal tool, not what "the app"
means unless the user says so.

## The one gotcha: pnpm is not on PATH

On this machine `pnpm` resolves in **neither** Git Bash nor PowerShell —
both `pnpm` calls exit 127 / CommandNotFound. `node`, `npm`, and
`corepack` are all present under `C:\Program Files\nodejs\`. The repo pins
`packageManager: pnpm@11.9.0`, so **always launch through corepack**:

```
corepack pnpm <script>
```

Do this from `apps/web`, not the repo root — the root has no `dev` script.

## Launch (background, so you can keep working)

Use PowerShell. `Start-Process` with redirected logs keeps it detached:

```powershell
Push-Location apps/web
Start-Process -FilePath "corepack" -ArgumentList "pnpm","dev" `
  -RedirectStandardOutput "$env:TEMP\gts-dev-out.log" `
  -RedirectStandardError "$env:TEMP\gts-dev-err.log" `
  -WindowStyle Hidden -PassThru | Select-Object Id
Pop-Location
```

Note the returned **PID** — that's how you stop it later
(`Stop-Process -Id <pid>`).

`predev` auto-runs `scripts/copy-vision-assets.mjs`, copying the MediaPipe
WASM files into `public/models/mediapipe/wasm`. You do **not** need to run
that yourself; seeing "copied N MediaPipe WASM file(s)" in stdout is normal.

## Verify it's actually up (don't just assume)

Vite serves on **http://localhost:5173/**. Give it ~5s, then smoke-test:

```powershell
Get-Content "$env:TEMP\gts-dev-out.log" -Tail 20   # expect: VITE ready, Local: http://localhost:5173/
try {
  $r = Invoke-WebRequest -Uri "http://localhost:5173/" -UseBasicParsing -TimeoutSec 10
  "STATUS: $($r.StatusCode)"                        # expect 200
  "ROOT: $($r.Content -match 'id=.root')"           # expect True
} catch { "ERROR: $_" }
```

A 200 with the `#root` div means the shell is served. That proves the
entrypoint, not the UI.

## Drive it (when the task is to confirm a feature works)

To actually see a feature — not just prove the server booted — drive it in a
browser with the Playwright MCP tools (`browser_navigate` to
`http://localhost:5173/`, then `browser_snapshot` / `browser_take_screenshot`
/ `browser_click`). **Look at the screenshot** — a blank frame is a failed
launch, not a passing run.

## Expose on the network (phone testing)

Add `--host`: `Start-Process ... -ArgumentList "pnpm","dev","--host"`.
Vite then prints a Network URL to hit from another device.

## Stop it

```powershell
Stop-Process -Id <pid> -Force        # the PID from launch
```

If you lost the PID: `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*vite*' } | Select-Object ProcessId, CommandLine`
