import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Visual-QA sweep. For every machine it visits the chart, screenshots it, and
// asserts the graph renders, edges are drawn, leaf nodes never overlap, and the
// page logs no errors. Targets default to the local servers started by
// playwright.config.ts; override with FATE_HOSTS (comma-separated).
const HOSTS = (process.env.FATE_HOSTS ?? "http://localhost:8197,http://localhost:8198/studio")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const SCREEN_DIR = path.join(__dirname, "__screens__");

interface MachineInfo {
  name: string;
  summary: string;
  live: boolean;
}

interface NodeRect {
  id: string | null;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

function hostLabel(host: string): string {
  return host.replace(/^https?:\/\//, "").replace(/[^a-z0-9.-]/gi, "_");
}

function overlap(a: NodeRect, b: NodeRect, tol = 2): number {
  const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return ix > tol && iy > tol ? Math.min(ix, iy) : 0;
}

// Mirrors MIN_FIT_ZOOM in src/graph/model/fit.ts.
const MIN_FIT_ZOOM = 0.35;
// A state name smaller than this on screen is not readable.
const MIN_LABEL_PX = 9;

/** Marks the first-visit guide as seen, so it does not take a test's clicks. */
async function skipGuide(page: Page) {
  await page.addInitScript(() => localStorage.setItem("fate-guide", "seen"));
}

async function chartZoom(page: Page): Promise<number> {
  return page
    .locator(".react-flow__viewport")
    .evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).a);
}

/** Smallest state name on screen, in px. */
async function smallestLabel(page: Page): Promise<number> {
  const zoom = await chartZoom(page);
  const sizes = await page.$$eval(".nlabel", (els) => els.map((el) => parseFloat(getComputedStyle(el).fontSize)));
  return Math.min(...sizes) * zoom;
}

/** How many of the chart's nodes lie outside the canvas. */
async function nodesOffCanvas(page: Page): Promise<number> {
  const canvas = await page.locator(".canvas").boundingBox();
  if (!canvas) return -1;
  const rects = await page.$$eval(".react-flow__node", (els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }),
  );
  return rects.filter(
    (r) => r.x < canvas.x || r.y < canvas.y || r.x + r.w > canvas.x + canvas.width || r.y + r.h > canvas.y + canvas.height,
  ).length;
}

/** Problems with the view the chart opened on, empty when it is fine. */
async function fitProblems(page: Page): Promise<string[]> {
  const out: string[] = [];
  const zoom = await chartZoom(page);
  if (zoom < MIN_FIT_ZOOM - 0.001) out.push(`opens at zoom ${zoom.toFixed(2)}`);
  const label = await smallestLabel(page);
  if (label < MIN_LABEL_PX) out.push(`state names are ${label.toFixed(1)}px on screen`);
  const off = await nodesOffCanvas(page);
  if (zoom > MIN_FIT_ZOOM + 0.001 && off !== 0) out.push(`${off} node(s) off the canvas`);
  return out;
}

async function leafRects(page: Page): Promise<NodeRect[]> {
  return page.$$eval(".react-flow__node", (els) =>
    els
      .map((el) => {
        const cls = el.className;
        const type = ["state", "final", "history", "compound", "parallel"].find((t) =>
          cls.includes(`react-flow__node-${t}`),
        );
        const r = el.getBoundingClientRect();
        return { id: el.getAttribute("data-id"), type: type ?? "?", x: r.x, y: r.y, w: r.width, h: r.height };
      })
      // leaf nodes only — containers legitimately overlap their descendants
      .filter((n) => n.type === "state" || n.type === "final" || n.type === "history"),
  );
}

for (const host of HOSTS) {
  test.describe(`fate-studio @ ${host}`, () => {
    test(`every machine renders cleanly`, async ({ page }) => {
      test.setTimeout(180000); // loops over every machine in one test
      await skipGuide(page);
      const res = await page.request.get(`${host}/api/machines`);
      expect(res.ok(), `GET ${host}/api/machines`).toBeTruthy();
      const machines = (await res.json()) as MachineInfo[];
      expect(machines.length, "machine list non-empty").toBeGreaterThan(0);

      const dir = path.join(SCREEN_DIR, hostLabel(host));
      fs.mkdirSync(dir, { recursive: true });

      const problems: string[] = [];

      for (const m of machines) {
        const errors: string[] = [];
        page.on("console", (msg) => {
          if (msg.type() === "error") errors.push(msg.text());
        });
        page.on("pageerror", (err) => errors.push(String(err)));

        // The page holds an open SSE connection, so "networkidle" never fires —
        // wait for DOM, then for the chart to actually paint nodes.
        await page.goto(`${host}/m/${encodeURIComponent(m.name)}`, { waitUntil: "domcontentloaded" });
        await page.waitForSelector(".react-flow__node", { timeout: 20000 }).catch(() => {});
        await page.waitForTimeout(2500); // settle ELK + libavoid routing

        const nodeCount = await page.locator(".react-flow__node").count();
        const edgeCount = await page.locator(".react-flow__edge path.react-flow__edge-path").count();
        const rects = await leafRects(page);

        // overlap check among leaf nodes
        let overlaps = 0;
        for (let i = 0; i < rects.length; i++) {
          for (let j = i + 1; j < rects.length; j++) {
            if (overlap(rects[i], rects[j]) > 0) overlaps++;
          }
        }

        await page.screenshot({ path: path.join(dir, `${m.name}.png`) });

        for (const p of await fitProblems(page)) problems.push(`${m.name}: ${p}`);

        const describeURL = await page
          .locator("a", { hasText: "JSON descriptor" })
          .evaluate((a) => (a as HTMLAnchorElement).href);
        const describe = await page.request.get(describeURL);
        if (!describe.ok()) problems.push(`${m.name}: descriptor link ${describeURL} returned ${describe.status()}`);

        if (m.live) {
          await page.goto(`${host}/sim/${encodeURIComponent(m.name)}`, { waitUntil: "domcontentloaded" });
          await page.waitForSelector(".react-flow__node", { timeout: 20000 }).catch(() => {});
          await page.waitForTimeout(1500);
          await page.screenshot({ path: path.join(dir, `${m.name}.sim.png`) });
          for (const p of await fitProblems(page)) problems.push(`${m.name} simulator: ${p}`);
          const status = (await page.locator(".subbar").innerText()).toLowerCase();
          if (!status.includes("running") && !status.includes("done")) {
            problems.push(`${m.name}: simulator never reached a running actor (${status.replace(/\s+/g, " ")})`);
          }
        }

        if (nodeCount === 0) problems.push(`${m.name}: no nodes rendered`);
        if (edgeCount === 0) problems.push(`${m.name}: no edges rendered`);
        if (overlaps > 0) problems.push(`${m.name}: ${overlaps} leaf-node overlap(s)`);
        if (errors.length) problems.push(`${m.name}: console errors → ${errors.slice(0, 3).join(" | ")}`);

        page.removeAllListeners("console");
        page.removeAllListeners("pageerror");
        // eslint-disable-next-line no-console
        console.log(`  ${m.name}: nodes=${nodeCount} edges=${edgeCount} leaves=${rects.length} overlaps=${overlaps} errors=${errors.length}`);
      }

      expect(problems, problems.join("\n")).toEqual([]);
    });
  });
}

for (const host of HOSTS) {
  test(`ticket simulator shows gates and the review view model @ ${host}`, async ({ page }) => {
    await skipGuide(page);
    await page.goto(`${host}/sim/ticket`, { waitUntil: "domcontentloaded" });
    const send = async (ev: string) => {
      await page.locator(".ev-btn", { hasText: new RegExp(`^${ev}$`) }).click();
      await page.waitForTimeout(400);
    };
    await page.locator(".subbar .btn", { hasText: "reset" }).click();
    await page.waitForTimeout(400);
    await send("MARK_TECHNICAL");
    await send("NEXT");
    const gates = page.locator(".inspector section", { hasText: "Gates" });
    await expect(gates).toContainText("$.category");
    await send("ROUTE");
    await expect(page.locator(".state-path")).toHaveText("technical");
    await send("NEXT");
    await send("NEXT");
    const views = page.locator(".inspector section", { hasText: "View models" });
    await expect(views).toContainText("review");
    await expect(views).toContainText("approvals");
    await send("NEXT");
    await expect(views).toContainText("true");
    await send("NEXT");
    await expect(page.locator(".state-path")).toHaveText("closed");
  });
}

for (const host of HOSTS) {
  const shots = path.join(SCREEN_DIR, hostLabel(host));

  test(`first-visit guide walks three steps and is remembered @ ${host}`, async ({ page }) => {
    fs.mkdirSync(shots, { recursive: true });
    await page.goto(`${host}/sim/ticket`, { waitUntil: "domcontentloaded" });
    const card = page.locator(".guide-card");
    await expect(card).toContainText("1 / 3");
    await page.screenshot({ path: path.join(shots, "guide-1.png") });

    // The advancing click lands on an event button and must not send it.
    const btn = await page.locator(".ev-btn").first().boundingBox();
    expect(btn).not.toBeNull();
    await page.mouse.click(btn!.x + btn!.width / 2, btn!.y + btn!.height / 2);
    await expect(card).toContainText("2 / 3");
    await page.screenshot({ path: path.join(shots, "guide-2.png") });
    await expect(page.locator(".state-path")).toHaveText("new");
    await expect(page.locator(".inspector")).toContainText("No events yet");

    await page.mouse.click(10, 10);
    await expect(card).toContainText("3 / 3");
    await page.screenshot({ path: path.join(shots, "guide-3.png") });
    await page.mouse.click(10, 10);
    await expect(card).toHaveCount(0);

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__node .node.active.leaf");
    await page.waitForTimeout(800);
    await expect(card).toHaveCount(0);

    await page.keyboard.press("?");
    await expect(card).toContainText("1 / 3");
    await page.keyboard.press("Escape");
    await expect(card).toHaveCount(0);
  });

  test(`guide stays hidden where there is nothing to send @ ${host}`, async ({ page }) => {
    // The static view has no events panel and no undo.
    await page.goto(`${host}/m/ticket`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__node");
    await page.waitForTimeout(1200);
    await expect(page.locator(".guide-card")).toHaveCount(0);

    // A live machine whose frames offer no events, as a read-only proxy sends.
    const frame = { path: "new", context: {}, status: "running", ascii: "", events: [], timeline: [] };
    await page.route("**/sim/ticket/stream", (route) =>
      route.fulfill({
        status: 200,
        headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
        body: `data: ${JSON.stringify(frame)}\n\n`,
      }),
    );
    await page.goto(`${host}/sim/ticket`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__node .node.active.leaf");
    await page.waitForTimeout(1200);
    await expect(page.locator(".inspector")).toContainText("None from here");
    await expect(page.locator(".inspector")).toContainText("This machine accepts no events from here.");
    await expect(page.locator(".guide-card")).toHaveCount(0);
    await page.keyboard.press("?");
    await expect(page.locator(".guide-card")).toHaveCount(0);
  });

  test(`one tooltip describes nodes, rows and edges @ ${host}`, async ({ page }) => {
    fs.mkdirSync(shots, { recursive: true });
    await page.goto(`${host}/m/ticket`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__node");
    await page.waitForTimeout(2500);
    const tip = page.locator(".chart-tip");

    await page.locator('.react-flow__node[data-id="s_review"] .nhead').hover();
    await expect(tip).toContainText("review");
    await expect(tip).toContainText("atomic");
    await expect(tip).toHaveCount(1);
    await page.screenshot({ path: path.join(shots, "tooltip-node.png") });

    await page.locator('.react-flow__node[data-id="s_review"] .erow', { hasText: "approved" }).hover();
    await expect(tip).toContainText("NEXT");
    await expect(tip).toContainText("guard");
    await expect(tip).toContainText("approved");
    await expect(tip).toContainText("target");
    await expect(tip).toContainText("closed");
    await expect(tip).toHaveCount(1);
    await page.screenshot({ path: path.join(shots, "tooltip-row.png") });

    // A point on the drawn edge itself: the box center of a bent path is off it.
    const pt = await page.locator(".react-flow__edge:not(.animated) .react-flow__edge-path").first().evaluate((el) => {
      const p = el as SVGPathElement;
      const at = p.getPointAtLength(p.getTotalLength() / 2).matrixTransform(p.getScreenCTM()!);
      return { x: at.x, y: at.y };
    });
    await page.mouse.move(10, 10);
    await expect(tip).toHaveCount(0);
    await page.mouse.move(pt.x, pt.y);
    await expect(tip).toContainText("transition");
    await expect(tip).toContainText("target");
    await page.screenshot({ path: path.join(shots, "tooltip-edge.png") });

    expect(await page.locator(".react-flow [title]").count(), "native titles left on chart nodes").toBe(
      await page.locator(".react-flow .chart-toolbar [title], .react-flow .react-flow__controls [title]").count(),
    );
  });

  test(`the chart refits after a layout change @ ${host}`, async ({ page }) => {
    await page.goto(`${host}/m/order`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__node");
    await page.waitForTimeout(2500);
    for (const mode of ["overview", "detail"]) {
      await page.locator(".react-flow__controls-zoomout").click({ clickCount: 4 });
      await page.locator(".seg-btn", { hasText: mode }).click();
      await page.waitForTimeout(2000);
      expect(await fitProblems(page), mode).toEqual([]);
    }
  });
}
