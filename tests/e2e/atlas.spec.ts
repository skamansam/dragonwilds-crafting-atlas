/**
 * Playwright end-to-end suite for the Crafting Atlas.
 *
 * Complements the two other layers:
 *   - tests/features/*.feature  — Gherkin/vitest: the browser-free highlight math
 *   - scripts/test-ui.mjs       — the broad permanent acceptance suite (82 checks)
 * This suite drives the real UI in a real browser for the core flows a user hits
 * first: boot, search → codex, isolate, progressive highlight, layout selection,
 * persisted settings, guided-tour deep links, URL deep links, URL graph
 * options, and a clean console.
 *
 * Config: playwright.config.ts serves src/ via the Vite dev server
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
	// The first-run character prompt (TODO #24) overlays the whole viewport, so it
	// would obscure every control below. Answer it up-front; the per-character
	// behaviour itself is covered by tests/features/characters.* and the
	// `characters` section of scripts/test-ui.mjs.
	test.beforeEach(async ({ page }) => {
		await page.addInitScript(() => localStorage.setItem("dw.charPrompted", "1"));
	});

	test("boots the full graph", async ({ page }) => {
		await boot(page);
		// the dataset + the synthesized overlay (one region hub per region that
		// found-in prose or a quest names, plus one node per quest). Every extra
		// id must be one of those — nothing else may be invented at boot.
		const { nodes, data, synth, stray } = await page.evaluate(() => {
			const w = window as unknown as {
				__cy: { nodes(): { id(): string; length: number } };
				DW_DATA: { nodes: { id: string }[] };
				DW_QUESTS?: { order: string[]; regionQuests: Record<string, string[]> };
				DW_FOUND_IN?: Record<string, { region: string | null }[]>;
			};
			const dataset = new Set(w.DW_DATA.nodes.map((n) => n.id));
			const synth = w.__cy.nodes().map((n) => n.id()).filter((id) => !dataset.has(id));
			const quests = new Set(w.DW_QUESTS?.order ?? []);
			const regions = new Set(Object.keys(w.DW_QUESTS?.regionQuests ?? {}));
			for (const list of Object.values(w.DW_FOUND_IN ?? {})) {
				for (const f of list) if (f.region) regions.add(f.region);
			}
			return {
				nodes: w.__cy.nodes().length,
				data: w.DW_DATA.nodes.length,
				synth: synth.length,
				stray: synth.filter((id) => !quests.has(id) && !regions.has(id)),
			};
		});
		expect(nodes).toBe(data + synth);
		expect(stray).toEqual([]);
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
			// pin the outputs-only walk (the default 'needs' walk is the full upstream)
			localStorage.setItem("dw.isoDir", "down");
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

	test("requires grows the isolated tree", async ({ page }) => {
		await boot(page);
		await page.evaluate(() => {
			// outputs-only, so Requires has hidden upstream levels left to reveal
			localStorage.setItem("dw.isoDir", "down");
			(window as unknown as { isolateTree(id: string, d: number): void }).isolateTree("Bread", 1);
		});
		await page.waitForTimeout(2000);
		const before = await page.evaluate(
			() => (window as unknown as { __cy: { nodes(s: string): { length: number } } }).__cy.nodes(":visible").length
		);
		await page.evaluate(() => {
			const w = window as unknown as { selectNode(id: string): void };
			w.selectNode("Bread");
			document.getElementById("btnRequires")!.click();
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

	test("item deep link selects the item", async ({ page }) => {
		await page.goto("/#/ash_logs");
		await expect(page.locator("#panelTitle")).toHaveText("Ash Logs", { timeout: 120_000 });
		expect(new URL(page.url()).hash).toBe("#/ash_logs");
	});

	test("path deep link draws the path between two items", async ({ page }) => {
		await page.goto("/#/ash_logs/iron_sword");
		await expect(page.locator("#panelTitle")).toHaveText("Iron Sword", { timeout: 120_000 });
		await expect(page.locator("#pathbar")).toBeVisible();
		const highlighted = await page.evaluate(
			() =>
				(window as unknown as { __cy: { edges(s: string): { length: number } } }).__cy.edges(".highlighted")
					.length
		);
		expect(highlighted).toBeGreaterThanOrEqual(2);
	});

	test("selecting an item writes its slug into the URL", async ({ page }) => {
		await boot(page);
		await page.fill("#search", "Iron Bar");
		await expect(page.locator(".sug-item").first()).toBeVisible({ timeout: 10_000 });
		await page.keyboard.press("Enter");
		await expect(page.locator("#panelTitle")).toHaveText("Iron Bar", { timeout: 10_000 });
		await expect.poll(() => new URL(page.url()).hash).toBe("#/iron_bar");
	});

	test("an unknown slug is reported without breaking the map", async ({ page }) => {
		await page.goto("/#/definitely_not_an_item");
		await page.waitForFunction(() => !!document.getElementById("veil")?.classList.contains("hidden"), null, {
			timeout: 120_000,
		});
		await expect(page.locator("#toast")).toContainText(/nothing matches/i, { timeout: 20_000 });
	});

	test("query params configure the view without persisting", async ({ page }) => {
		await page.goto("/?layout=grid&cats=food&force=0");
		await page.waitForFunction(
			() => !!document.getElementById("veil")?.classList.contains("hidden"),
			null,
			{ timeout: 120_000 }
		);
		await expect(page.locator("#layoutMeta")).toContainText(/grid/i, { timeout: 30_000 });
		const seen = await page.evaluate(() => ({
			layout: (document.getElementById("layoutSelect") as HTMLSelectElement).value,
			force: (document.getElementById("forceToggle") as HTMLInputElement).checked,
			weaponHidden: (window as unknown as { __cy: { getElementById(id: string): { hasClass(c: string): boolean } } }).__cy
				.getElementById("Iron Sword")
				.hasClass("hidden"),
			// the point of the whole feature: a shared link must not rewrite the visitor's prefs
			storedLayout: localStorage.getItem("dw.layout"),
			storedKinds: localStorage.getItem("dw.legendKinds"),
			storedForce: localStorage.getItem("dw.force"),
		}));
		expect(seen.layout).toBe("grid");
		expect(seen.force).toBe(false);
		expect(seen.weaponHidden).toBe(true);
		expect(seen.storedLayout).toBeNull();
		expect(seen.storedKinds).toBeNull();
		expect(seen.storedForce).toBeNull();
	});

	test("the URL tracks options changed by hand", async ({ page }) => {
		await boot(page);
		await page.evaluate(() => {
			const row = [...document.querySelectorAll("#legend .lg-row")].find((r) =>
				r.textContent?.includes("Skill gates")
			);
			(row as HTMLElement).click();
		});
		await expect.poll(() => new URL(page.url()).searchParams.get("skilllinks")).toBe("1");
		expect(new URL(page.url()).searchParams.get("layout")).toBeTruthy(); // the whole state rides along
	});

	test("?iso= isolates an item on load", async ({ page }) => {
		const shownFor = (search: string) =>
			(async () => {
				await page.goto(search);
				await expect(page.locator("#panelTitle")).toHaveText("Iron Sword", { timeout: 120_000 });
				await expect(page.locator("#breadcrumb")).toBeVisible();
				return page.evaluate(
					() =>
						(window as unknown as { __cy: { nodes(s?: string): { length: number } } }).__cy
							.nodes(":visible").length
				);
			})();

		// upstream (inputs) — Iron Sword is crafted, so it has materials
		const inputs = await shownFor("/?iso=iron_sword&isodepth=1&isodir=up");
		expect(inputs).toBeGreaterThan(1);
		expect(inputs).toBeLessThan(200);

		// the whole upstream closure (no depth cap) for the comparison below
		const upAll = await shownFor("/?iso=iron_sword&isodir=up");
		expect(upAll).toBeGreaterThanOrEqual(inputs);

		// the default walk ('needs') shows everything the item requires at any
		// depth plus one level of what it enables — never just the item itself
		const def = await shownFor("/?iso=iron_sword&isodepth=1");
		expect(def).toBeGreaterThan(inputs); // deeper than one level of inputs
		expect(def).toBeGreaterThanOrEqual(upAll); // the full requires closure is there
		expect(def).toBeLessThan(200);

		// explicit outputs-only still shows just the item (nothing consumes Iron Sword)
		const outputs = await shownFor("/?iso=iron_sword&isodepth=1&isodir=down");
		expect(outputs).toBeLessThan(def);
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
