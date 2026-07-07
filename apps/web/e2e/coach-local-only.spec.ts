// WP-5 e2e. Scenario 1 (required): Local-only mode ON — the coach answers from
// on-device templates with the BACKEND NOT RUNNING, and NO network (no
// WebSocket, no backend request) leaves the page. Scenario 2 (best-effort):
// spawn uvicorn with COACH_PROVIDER=fake, toggle off, ask a question, and
// assert a streamed structured reply arrives over WebSocket, labelled as the
// fake provider. Scenario 2 self-skips if the backend can't be launched.
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import http from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const BACKEND_DIR = join(REPO_ROOT, "services", "backend");
const VENV_PYTHON = join(
  BACKEND_DIR,
  ".venv",
  ...(process.platform === "win32" ? ["Scripts", "python.exe"] : ["bin", "python"]),
);

test("Local-only mode: answers from templates with the backend down, zero network", async ({
  page,
}) => {
  const sockets: string[] = [];
  page.on("websocket", (ws) => sockets.push(ws.url()));
  const backendReqs: string[] = [];
  page.on("request", (r) => {
    const u = r.url();
    if (u.includes("/ws/coach") || u.includes("/api/") || /:8000\b/.test(u)) backendReqs.push(u);
  });

  await page.goto("/");

  // Default ON (privacy-first).
  await expect(page.getByTestId("coach-local-only")).toBeChecked();

  await page.getByLabel("Question for the coach").fill("why does my C sound muffled?");
  await page.getByTestId("coach-ask").click();

  await expect(page.getByTestId("coach-reply")).toBeVisible();
  await expect(page.getByTestId("coach-source")).toContainText("On-device");

  // The load-bearing assertion: nothing went to the network.
  expect(sockets).toEqual([]);
  expect(backendReqs).toEqual([]);
});

function waitForHealth(timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve) => {
    const attempt = () => {
      const req = http.get("http://127.0.0.1:8000/health", (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          if (body.includes('"ok"')) resolve(true);
          else retry();
        });
      });
      req.on("error", retry);
      req.setTimeout(1000, () => req.destroy());
    };
    const retry = () => {
      if (Date.now() > deadline) resolve(false);
      else setTimeout(attempt, 400);
    };
    attempt();
  });
}

test.describe("fake-provider coaching over WebSocket (best-effort)", () => {
  let proc: ChildProcess | undefined;
  let up = false;

  test.beforeAll(async () => {
    // No venv (e.g. CI runner without a backend install) → best-effort skip.
    if (!existsSync(VENV_PYTHON)) return;
    try {
      proc = spawn(
        VENV_PYTHON,
        ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"],
        {
          cwd: BACKEND_DIR,
          env: {
            ...process.env,
            COACH_PROVIDER: "fake",
            COACH_BUDGET_DB: join(BACKEND_DIR, "storage", "e2e-budget.sqlite"),
          },
          stdio: "ignore",
        },
      );
      // spawn() reports a missing/broken binary as an async "error" event, not
      // a throw — without a listener it crashes the test instead of skipping.
      proc.on("error", () => {
        up = false;
      });
      up = await waitForHealth(20000);
    } catch {
      up = false;
    }
  });

  test.afterAll(() => {
    proc?.kill();
  });

  test("toggle off → streamed structured reply labelled fake-provider", async ({ page }) => {
    test.skip(!up, "backend (uvicorn) not reachable in this environment");

    const sockets: string[] = [];
    page.on("websocket", (ws) => sockets.push(ws.url()));

    await page.goto("/");
    // Turn Local-only OFF to allow the network coach.
    await page.getByTestId("coach-local-only").uncheck();
    await page.getByLabel("Question for the coach").fill("why does my C sound bad?");
    await page.getByTestId("coach-ask").click();

    await expect(page.getByTestId("coach-reply")).toBeVisible({ timeout: 15000 });
    // Model reply labelled with the (fake) provider — never presented as live.
    await expect(page.getByTestId("coach-source")).toContainText("fake");
    expect(sockets.some((u) => u.includes("/ws/coach"))).toBe(true);
  });
});
