/* ═══════════════════════════════════════════════════════════════
   Newer-build notice.

   The Atlas is a static build on GitHub Pages: a visitor who leaves a tab open
   keeps the JS/CSS hashes they first loaded and silently misses every later
   deploy. The build stamps an id into the page (<meta name="dw-build">) and
   emits the same id as version.json (vite.config.js); this module polls that
   file and, the moment it reports a different id, reveals the bottom banner so
   the tab can be refreshed onto the new build.

   The checks are cheap and deliberate — a few seconds after boot, then on a
   slow interval, and whenever the tab is brought back to the foreground (a
   backgrounded tab that wakes up should know at once). Once the banner is up
   the polling stops; nothing else changes itself.
   ═══════════════════════════════════════════════════════════════ */

const SELF_ID =
	document.querySelector('meta[name="dw-build"]')?.content || null;
// resolves beside index.html, so it follows the deploy base path automatically
const VERSION_URL = new URL("version.json", document.baseURI).href;
const INTERVAL_MS = 5 * 60 * 1000;
const FIRST_DELAY_MS = 5000;

let knownId = SELF_ID; // what this page is running; adopted from the first poll if unstamped
let announced = false; // the banner has been shown — stop polling

function showBanner() {
	if (announced) return;
	announced = true;
	const el = document.getElementById("updateBanner");
	if (!el) return;
	el.hidden = false;
	document.body.classList.add("has-update"); // lifts the toast clear of the banner
	requestAnimationFrame(() => el.classList.add("show"));
	el.querySelector(".ub-reload")?.addEventListener("click", () =>
		location.reload(),
	);
	el.querySelector(".ub-dismiss")?.addEventListener("click", () => {
		el.classList.remove("show");
		document.body.classList.remove("has-update");
		setTimeout(() => {
			el.hidden = true;
		}, 250);
	});
}

async function check() {
	if (announced) return;
	let id = null;
	try {
		const res = await fetch(VERSION_URL, { cache: "no-store" });
		if (!res.ok) return;
		id = (await res.json())?.id || null;
	} catch {
		return; // offline or blocked — the next tick tries again
	}
	if (!id) return;
	if (knownId == null) {
		knownId = id;
		return;
	} // unstamped page: adopt the live id
	if (id !== knownId) showBanner();
}

function start() {
	setTimeout(check, FIRST_DELAY_MS);
	setInterval(check, INTERVAL_MS);
	// a tab that was hidden through a deploy should notice the moment it returns
	document.addEventListener("visibilitychange", () => {
		if (document.visibilityState === "visible") check();
	});
	window.addEventListener("focus", check);
	window.addEventListener("online", check);
}

// published for the acceptance harness (scripts/test-ui.mjs), which fakes a
// deploy by serving a different version.json and forcing a check
window.__checkForUpdate = check;

start();
