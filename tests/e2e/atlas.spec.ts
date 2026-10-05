/**
 * Playwright end-to-end suite for the Crafting Atlas.
 *
 * Complements the two other layers:
 *   - tests/features/*.feature  — Gherkin/vitest: the browser-free trace math
 *   - scripts/test-ui.mjs       — the broad permanent acceptance suite (59 checks)
 * This suite drives the real UI in a real browser for the core flows a user hits
 * first: boot, search → codex, isolate, progressive trace, layout selection,
 * persisted settings, guided-tour deep links, and a clean console.
 *
 * Config: playwright.config.ts serves site/ via `node scripts/test-ui.mjs
 * --serve-only` on :8491 (no build step). Each test gets a fresh browser context,
 * so localStorage (dw.*) starts empty unless a test sets it.
 */

import { test, expect, type Page } from "@playwright/test";

const boot = async (page: Page): Promise<void> => {
	await page.goto("/");
	await page.waitForFunction(
		() => (window as unknown as { __cy?: { nodes(): { length: number } } }).__cy?.nodes().length,
		null,
		{ timeout: 120_000 }
	);
	await page.waitForFunction(
		() => document.getElementById("veil")?.classList.contains("hidden"),
		null,
		{ timeout: 60_000 }
	);
	await page.waitForTimeout(800); // settle the boot layout
};

const countFromReadout = (page: Page): Promise<number> =>
	page.evaluate(() => {
		const m = /last layout: [\d.]+s · ([\d,]+) nodes/.exec(
			document.getElementById("lastLayout")?.textContent || ""
		);
		return m ? Number(m[1].replace(/,/g, "")) : -1;
	});

test.describe("Crafting Atlas", () => {
	test("boots the full graph", async ({ page }) => {
		await boot(page);
		const { nodes, data } = await page.evaluate(() => {
			const w = window as unknown as {
				__cy: { nodes(): { length: number } };
				DW_DATA: { nodes: unknown[] };
			};
			return { nodes: w.__cy.nodes().length, data: w.DW_DATA.nodes.length };
		});
		expect(nodes).toBeGreaterThanOrEqual(data);
		expect(nodes - data).toBeLessThanOrEqual(7); // + region hubs
	});

	test("search opens the codex panel", async ({ page }) => {
		await boot(page);
		await page.fill("#search", "Iron Bar");
		await expect(page.locator(".sug-item").first()).toBeVisible({ timeout: 10_000 });
		await page.keyboard.press("Enter");
		await expect(page.locator("#panelTitle")).toHaveText("Iron Bar", { timeout: 10_000 });
	});

	test("isolate tree collapses to the subtree", async ({ page }) => {
		await boot(page);
		await page.evaluate(() => {
			(window as unknown as { isolateTree(id: string, d: number): void }).isolateTree("Bread", 1);
		});
		await expect
			.poll(() =>
				page.evaluate(() => {
					const w = window as unknown as {
						__cy: { nodes(sel?: string): { length: number } };
					};
					const shown = w.__cy.nodes(":visible").length;
					const total = w.__cy.nodes().length;
					return shown < total && shown > 1;
				})
			)
			.toBe(true);
	});

	test("trace inputs grows the isolated tree", async ({ page }) => {
		await boot(page);
		await page.evaluate(() => {
			(window as unknown as { isolateTree(id: string, d: number): void }).isolateTree("Bread", 1);
		});
		await page.waitForTimeout(2000);
		const before = await page.evaluate(
			() => (window as unknown as { __cy: { nodes(s: string): { length: number } } }).__cy.nodes(":visible").length
		);
		await page.evaluate(() => {
			const w = window as unknown as { selectNode(id: string): void };
			w.selectNode("Bread");
			document.getElementById("btnTrace")!.click();
		});
		await expect
			.poll(
				() =>
					page.evaluate(
						() => (window as unknown as { __cy: { nodes(s: string): { length: number } } }).__cy.nodes(":visible").length
					),
				{ timeout: 15_000 }
			)
			.toBeGreaterThan(before);
	});

	test("layout selection records a completion", async ({ page }) => {
		await boot(page);
		await page.evaluate(() => {
			const sel = document.getElementById("layoutSelect") as HTMLSelectElement;
			sel.value = "grid";
			sel.dispatchEvent(new Event("change"));
		});
		await expect
			.poll(() => page.evaluate(() => document.getElementById("layoutInd")?.classList.contains("on")), {
				timeout: 45_000,
			})
			.toBe(false);
		await page.waitForTimeout(400);
		await expect(page.locator("#lastLayout")).toHaveText(/last layout: [\d.]+s · [\d,]+ nodes/);
		await expect(page.locator("#layoutMeta")).toContainText(/grid/i);
		const arranged = await countFromReadout(page);
		expect(arranged).toBeGreaterThan(1);
	});

	test("settings persist across a reload", async ({ page }) => {
		await boot(page);
		await page.evaluate(() => document.getElementById("settingsBtn")!.click());
		await page.evaluate(() => {
			const t = document.getElementById("animToggle") as HTMLInputElement;
			t.checked = false;
			t.onchange?.call(t, new Event("change"));
		});
		await expect(page.locator("#animToggle")).not.toBeChecked();
		await boot(page);
		await page.evaluate(() => document.getElementById("settingsBtn")!.click());
		await expect(page.locator("#animToggle")).not.toBeChecked();
	});

	test("guided-tour deep link auto-starts", async ({ page }) => {
		await page.goto("/?tour=outputs");
		await page.waitForFunction(
			() =>
				!!(window as unknown as { __cy?: unknown }).__cy &&
				document.getElementById("veil")?.classList.contains("hidden"),
			null,
			{ timeout: 120_000 }
		);
		await expect(page.locator(".driver-popover-title")).toContainText("Ash Logs", { timeout: 20_000 });
	});

	test("boots without console errors", async ({ page }) => {
		const errors: string[] = [];
		page.on("pageerror", (e) => errors.push(e.message.split("\n")[0]));
		page.on("console", (m) => {
			if (m.type() === "error") errors.push(m.text().split("\n")[0]);
		});
		await boot(page);
		await page.waitForTimeout(1000);
		expect(errors).toEqual([]);
	});
});
