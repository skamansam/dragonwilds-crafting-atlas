# COMPLIANCE — decisions & outreach log

Running record of licensing decisions and external outreach for this project.
Ticket references point at `TODO-compliance.md`; overall status lives in `PLAN.md`.

## 2026-09-22 — project decisions

- **Scraping method (TICKET-07):** all wiki data is fetched via the MediaWiki
  `api.php` endpoints (`action=query`, `prop=revisions&rvprop=content`,
  `prop=imageinfo`) — no rendered-HTML scraping. The wiki's own API is the
  access channel MediaWiki sites expect automated consumers to use.
- **Snapshot policy (TICKET-09):** the dataset in `site/data.js` is a
  **manually triggered snapshot** of the wiki as of the 1.0 update
  (15 September 2026). There is no cron job, no CI job, and no scheduled
  re-scrape; the deploy workflow only uploads the existing `site/` folder.
  Re-runs happen by hand after major game updates.
- **Non-commercial commitment (TICKET-03):** no ads, no paywall, no
  sponsorships, no donations tied to features — in perpetuity. This is the
  load-bearing fact that makes both the CC BY-NC-SA dataset license and the
  Jagex Fan Content Policy apply cleanly.
- **License split (TICKET-05):** original code is MIT (`LICENSE`); the dataset
  is CC BY-NC-SA 3.0 (`LICENSE-DATA.md` §1, matching the source wiki); icons
  are Jagex Limited assets used under the Fan Content Policy, explicitly
  outside the code license (`LICENSE-DATA.md` §2).
- **Attribution (TICKET-01/02/06):** Jagex's required FCP §8.1 sentence appears
  verbatim in README and in the running app (legend + welcome card).
  Per-item deep links to source articles cover Weird Gloop's attribution
  formats; the audit in `scripts/audit-links.mjs` tracks coverage.

## Outreach

### TICKET-10 — Weird Gloop — **pending** (human action)
- Plan: short email to support@weirdgloop.org describing the project
  (non-commercial, open-source, ad-free, API-only, rate-limited snapshot
  scraper) and asking for acknowledgment.
- Outcome: _not yet sent._

### TICKET-11 — Jagex — **pending** (human action)
- Plan: short email to IP@Jagex.com asking whether a non-commercial,
  open-source reference tool falls within acceptable use under FCP §6.1.3
  ("any other form of Software or Application").
- Outcome: _not yet sent._

## Changelog

| Date | Change |
|------|--------|
| 2026-09-22 | Created log; recorded scraping, snapshot, licensing, and attribution decisions |
