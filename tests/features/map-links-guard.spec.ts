/**
 * Cucumber/Gherkin spec for the live-map drift guard (scripts/build-map-links.mjs
 * in its `--check` role, run by .github/workflows/deploy.yml).
 *
 * This drives the REAL CLI through a real refusal: a local HTTP server answers
 * 403, exactly as survivalservers.com answers a scripted download, and
 * WYRMWATCH_REFERENCE_URL aims the guard at it. `--file=` points at a path that
 * does not exist, so the run has no cached reference either — the CI situation.
 * Nothing here is stubbed inside the script, so the test cannot pass against a
 * reimplementation of the contract it is meant to police.
 *
 * The child is spawned asynchronously on purpose: spawnSync would block this
 * process's event loop, so the 403 server living in it could never answer and
 * the guard would hang on its own request.
 *
 * The 2026-10-20 deploy failed here: the refusal exited 1 before the unjudged
 * branch ran, so the site stayed on the previous build. Scenario 1 is that
 * regression; scenario 2 keeps the fix honest — a run that must generate has
 * nothing to generate from and still fails.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { afterAll, expect } from "vitest";

const REPO = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../..",
);
const GUARD = path.join(REPO, "scripts", "build-map-links.mjs");
/** A source path that cannot exist, so the run never picks up a local cache. */
const ABSENT_REFERENCE = path.join(
	os.tmpdir(),
	`dw-guard-absent-${process.pid}.json`,
);

interface GuardRun {
	status: number | null;
	stdout: string;
	stderr: string;
}

let refusingHost: http.Server | null = null;
let referenceUrl = "";
let run: GuardRun | null = null;

/** Start the 403 host on an ephemeral port, once per file. */
async function refuseLikeTheRealHost(status: number): Promise<void> {
	fs.rmSync(ABSENT_REFERENCE, { force: true });
	if (refusingHost) return;
	await new Promise<void>((resolve, reject) => {
		refusingHost = http.createServer((_request, response) => {
			response.writeHead(status, { "Content-Type": "text/plain" });
			response.end("challenge");
		});
		refusingHost.once("error", reject);
		refusingHost.listen(0, "127.0.0.1", () => {
			const { port } = refusingHost?.address() as AddressInfo;
			referenceUrl = `http://127.0.0.1:${port}/wyrmwatch-reference.json`;
			resolve();
		});
	});
}

/** Run the guard CLI the way CI does, against the refusing host. */
function runGuard(...args: string[]): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, [GUARD, ...args], {
			cwd: REPO,
			env: { ...process.env, WYRMWATCH_REFERENCE_URL: referenceUrl },
		});
		let stdout = "";
		let stderr = "";
		child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
			stdout += chunk;
		});
		child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
			stderr += chunk;
		});
		// a guard that never answers must fail the test, not hang the suite
		const killTimer = setTimeout(() => child.kill("SIGKILL"), 20000);
		child.once("error", reject);
		child.once("close", (status) => {
			clearTimeout(killTimer);
			run = { status, stdout, stderr };
			resolve();
		});
	});
}

const output = () => `${run?.stdout ?? ""}${run?.stderr ?? ""}`;

afterAll(() => {
	refusingHost?.close();
	fs.rmSync(ABSENT_REFERENCE, { force: true });
});

const feature = await loadFeature("./map-links-guard.feature");

describeFeature(feature, ({ Scenario }) => {
	Scenario(
		"A refused reference leaves the drift comparison unjudged, not failed",
		({ Given, When, Then, And }) => {
			Given(
				"the reference host refuses scripts with HTTP {string}",
				async (_ctx: unknown, status: string) => {
					await refuseLikeTheRealHost(Number(status));
				},
			);

			When(
				"the guard checks the committed artifact with no cached reference",
				async () => {
					await runGuard("--check", `--file=${ABSENT_REFERENCE}`);
				},
			);

			Then("the guard exits {int}", (_ctx: unknown, code: number) => {
				expect(run?.status).toBe(code);
			});

			And("the guard reports the comparison as unjudged", () => {
				expect(output()).toContain("could not fetch the map reference");
				expect(output()).toContain("unjudged: no map reference this run");
			});

			And("the guard still checks the artifact against the dataset", () => {
				expect(output()).toMatch(/consistent: \d+ linked node\(s\)/);
			});
		},
	);

	Scenario(
		"A run that must generate cannot proceed without a reference",
		({ Given, When, Then, And }) => {
			Given(
				"the reference host refuses scripts with HTTP {string}",
				async (_ctx: unknown, status: string) => {
					await refuseLikeTheRealHost(Number(status));
				},
			);

			When(
				"the guard is asked to generate with no cached reference",
				async () => {
					await runGuard(`--file=${ABSENT_REFERENCE}`);
				},
			);

			Then("the guard exits {int}", (_ctx: unknown, code: number) => {
				expect(run?.status).toBe(code);
			});

			And("the guard says it has no map reference", () => {
				expect(output()).toContain("no map reference");
			});
		},
	);
});
