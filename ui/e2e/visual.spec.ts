import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Visual-QA sweep across the live deployments. For every machine it visits the
// chart, screenshots it, and asserts the structural invariants the rewrite must
// hold: the graph renders, edges are drawn, leaf nodes never overlap, and the
// page logs no errors. Override targets with FATE_HOSTS (comma-separated).
const HOSTS = (
  process.env.FATE_HOSTS ??
  "https://fate-studio.arisjirat.com,https://fate-studio-dp.arisjirat.com"
)
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
