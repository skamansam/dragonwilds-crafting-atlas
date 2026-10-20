Feature: The live-map drift guard inside CI
  public/map-links.js is a committed artifact whose 4.7 MB source is NOT
  committed: the host answers a scripted request with a Cloudflare challenge, so
  `cache/wyrmwatch/reference.json` only ever exists on a machine where someone
  saved it from a browser. CI has no cache, so its `--check` run can only judge
  the half that needs no source — every linked id still exists in data.json,
  every filter names a type the artifact carries, every view is a real place.

  The guard says so in its own header: a missing reference is unjudged, "so CI
  never fails over someone else's downtime". It did not do that. The fetch
  refusal exited 1 before the unjudged branch was reached, so the deploy of
  2026-10-20 failed at the guard and the live site kept serving the previous
  build for a day. These scenarios are that contract, driven through the real
  CLI rather than a refactored copy of it: the host refuses, the check judges
  what it can and passes, and a run that must GENERATE still refuses.

  Scenario: A refused reference leaves the drift comparison unjudged, not failed
    Given the reference host refuses scripts with HTTP "403"
    When the guard checks the committed artifact with no cached reference
    Then the guard exits 0
    And the guard reports the comparison as unjudged
    And the guard still checks the artifact against the dataset

  Scenario: A run that must generate cannot proceed without a reference
    Given the reference host refuses scripts with HTTP "403"
    When the guard is asked to generate with no cached reference
    Then the guard exits 1
    And the guard says it has no map reference
