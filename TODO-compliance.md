# Dragonwilds Crafting Atlas — Compliance Ticket Backlog

Context for whoever (or whatever) picks these up: this repo scrapes RuneScape: Dragonwilds
Wiki (dragonwilds.runescape.wiki, operated by Weird Gloop) to build a static, offline,
open-source, ad-free, non-commercial crafting-graph viewer. The wiki's text is CC BY-NC-SA 3.0;
its images are Jagex Ltd's copyrighted game assets used under Jagex's Fan Content Policy, which
is a separate, stricter license from the wiki's own CC terms. These tickets close the gaps
between what the project currently does and what those licenses require. Priority order matters —
do P0 before P1, P1 before P2.

---

## P0 — Attribution & disclosure (legally required, low effort)

### TICKET-01: Add Jagex's required Fan Content Policy attribution line
**Where:** README.md, and somewhere visible in the running app (e.g. an "About" panel/footer).
**Do:** Add this exact wording, verbatim, per Jagex Fan Content Policy §8.1 — do not paraphrase it:

> Created using intellectual property belonging to Jagex Limited under the terms of Jagex's Fan
> Content Policy. This content is not endorsed by or affiliated with Jagex.

**Acceptance criteria:**
- [ ] Exact wording appears in README.md
- [ ] Exact wording (or a linked equivalent) appears in the app UI itself, not just the repo
- [ ] Wording is not altered, shortened, or reworded

### TICKET-02: Add a non-affiliation / non-endorsement disclaimer
**Where:** README.md and app footer/About panel.
**Do:** State clearly that the project is an unofficial, fan-made, non-commercial reference tool;
not affiliated with or endorsed by Jagex Limited or Weird Gloop; "RuneScape" and
"RuneScape: Dragonwilds" are trademarks of Jagex Limited.

**Acceptance criteria:**
- [ ] Disclaimer present in README and in-app
- [ ] Trademark ownership explicitly credited to Jagex Limited

### TICKET-03: Add an explicit "non-commercial in perpetuity" statement
**Where:** README.md, top of file.
**Do:** State plainly that the project carries no ads, no paywall, no sponsorships, no donations
tied to feature access, and that this will not change. This is the load-bearing fact that makes
the CC BY-NC-SA content license and the Jagex Fan Content Policy license both apply cleanly.

**Acceptance criteria:**
- [ ] Statement present near the top of README.md, not buried

### TICKET-04: Add an "AI-generated project" disclosure
**Where:** README.md.
**Do:** Add a short section noting the codebase was substantially AI-generated, and that this is
part of why the project is released open-source rather than under an exclusive/closed license
(AI-generated output has uncertain/limited copyright protection for the human operator in most
jurisdictions, so asserting exclusive rights over it would be shaky — open-sourcing sidesteps
that ambiguity). One or two sentences is enough; this is a transparency note, not a legal
argument.

**Acceptance criteria:**
- [ ] Short disclosure section exists in README.md

---

## P1 — Licensing hygiene (medium effort, closes the biggest gaps)

### TICKET-05: Split and label licenses by content type
**Where:** Repo root.
**Do:** Add a `LICENSE` file for the project's own original code (pick a permissive license, e.g.
MIT or Apache-2.0). Add a separate `LICENSE-DATA.md` (or a clearly marked section in README)
stating:
- The scraped dataset (`site/data.js`, recipe/skill/spell relationship data derived from wiki
  text) is a derivative of RuneScape: Dragonwilds Wiki content and is licensed under
  **CC BY-NC-SA 3.0**, matching the source wiki's license, with a link to
  https://creativecommons.org/licenses/by-nc-sa/3.0/
- The icon/image assets in `site/icons/` are Jagex Limited's copyrighted game assets, used
  under Jagex's Fan Content Policy (non-commercial, revocable license) — NOT under any open
  source or Creative Commons license, and NOT covered by the code's MIT/Apache license.

**Acceptance criteria:**
- [ ] `LICENSE` file exists and covers only original code
- [ ] Dataset license (CC BY-NC-SA 3.0) documented and linked
- [ ] Icon/image licensing basis (Jagex Fan Content Policy, non-CC) documented separately
- [ ] README links to all three from a "Licensing" section so nothing is ambiguous

### TICKET-06: Add wiki attribution per Weird Gloop's specified format
**Where:** README.md (already partially done) and in-app per-item panel (already links out —
verify it meets the letter of the requirement).
**Do:** Confirm attribution matches one of Weird Gloop's accepted formats: a hyperlink to the
specific article(s) reused, or a hyperlink to an equivalent stable copy, or an author list.
Per-item deep links to the wiki page already satisfy this — just confirm every node with
wiki-derived data actually links out, including stations/spells/skills, not only items.

**Acceptance criteria:**
- [ ] Spot-check: stations, spells, and skill pages link to their wiki source, not just items
- [ ] Top-level README also names the wiki as the source with a working hyperlink

---

## P2 — Data collection practices (protects against ToS/access issues, not copyright)

### TICKET-07: Replace raw HTML scraping with the MediaWiki API where possible
**Where:** `scripts/fetch-wiki.mjs`.
**Do:** Weird Gloop's Terms of Use prohibit automated access without prior consent. Raw page
scraping (~3,650 GET requests to rendered wiki pages) is more likely to be read as that kind of
automated access than hitting the site's own `api.php` (standard MediaWiki `action=query`,
`action=parse`, export endpoints, etc.), which wikis generally expect bots to use. Rework the
fetch step to pull page wikitext/infobox data via the API instead of scraping rendered HTML,
where the data you need is exposed there.

**Acceptance criteria:**
- [ ] `fetch-wiki.mjs` uses `api.php` endpoints instead of scraping rendered page HTML, for
      everything the API can provide
- [ ] Any remaining raw-HTML scraping (e.g. for data the API doesn't expose) is documented with
      a comment explaining why the API wasn't sufficient

### TICKET-08: Add rate limiting and a descriptive User-Agent to the scraper
**Where:** `scripts/fetch-wiki.mjs`, `scripts/fetch-icon-files.mjs`.
**Do:** Add a delay between requests (e.g. 1 request/second, configurable) and set a User-Agent
header identifying the project, its purpose, and a contact method (repo URL or email), per
standard bot etiquette for MediaWiki sites. This reduces load on Weird Gloop's infrastructure and
gives them an easy way to reach you if they have concerns, rather than just blocking the IP.

**Acceptance criteria:**
- [ ] Requests are throttled (no burst-fetching thousands of pages back to back)
- [ ] User-Agent header includes project name + contact link
- [ ] Documented in scripts/README as a requirement for anyone re-running the scraper

### TICKET-09: Document a re-run cadence instead of continuous/automatic scraping
**Where:** README.md, `scripts/` docs.
**Do:** Make clear the dataset is a manually-triggered snapshot (e.g. "re-run after major game
updates"), not a scheduled/automated re-scrape (no cron job, no CI job hitting the wiki on a
timer). Reduces load and reinforces good-faith, low-impact use.

**Acceptance criteria:**
- [ ] README states the dataset is a manual snapshot, with the last snapshot date
- [ ] No CI workflow exists that re-scrapes the wiki on a schedule

---

## P3 — Optional, higher-certainty moves (do if you want belt-and-suspenders)

### TICKET-10: (for humans only) Send a short outreach email to Weird Gloop
**Where:** N/A (external action, not code).
**Do:** Email support@weirdgloop.org (or their Discord) describing the project in 2–3 sentences:
what it is, that it's non-commercial/open-source/ad-free, that it scrapes via [API/rate-limited
scraper per TICKET-07/08], and ask for a nod of acknowledgment. Not strictly required, but turns
an implicit ToS gray area into an explicit yes. Log the outcome (or lack of response) in
`COMPLIANCE.md`.

**Acceptance criteria:**
- [ ] Email/message sent
- [ ] Response (or non-response after a reasonable wait) logged in `COMPLIANCE.md`

### TICKET-11: (for humans only) Send a short outreach email to Jagex about the "software/application" clause
**Where:** N/A (external action, not code).
**Do:** Jagex's Fan Content Policy §6.1.3 restricts using Jagex Property to make "any other form
of Software or Application," with no clean carve-out for a reference tool like this one. Email
IP@Jagex.com with a short description (what it does, non-commercial/open-source/ad-free status,
link to the repo) and ask whether it falls within an acceptable use or needs anything further.
Log whatever response (or silence) results in `COMPLIANCE.md`. This is optional but is the single
highest-value action for reducing legal uncertainty, since it's the one clause that doesn't
clearly cover this project as written.

**Acceptance criteria:**
- [ ] Email sent to IP@Jagex.com
- [ ] Response (or non-response) logged in `COMPLIANCE.md`

### TICKET-12: Create a `COMPLIANCE.md` log
**Where:** Repo root.
**Do:** A short running log of licensing decisions and any outreach done (TICKET-10, TICKET-11),
so the reasoning isn't only in a chat transcript. Useful if anyone (including future-you) asks
"why is it licensed this way" or if Jagex/Weird Gloop ever reach out.

**Acceptance criteria:**
- [ ] `COMPLIANCE.md` exists, dated, with a short changelog of licensing/outreach decisions

---

## Explicitly out of scope / not required
- No privacy policy needed — the site is static, collects no user data, has no accounts, no
  analytics as of this writing. Add one only if that changes.
- No need to remove or shrink the icon set on copyright grounds alone — Jagex's own Fan Content
  Policy doesn't object to volume, only to commercial use and (per §6.1.3) to "application"-type
  uses in general, which TICKET-11 addresses at the root rather than by trimming assets.