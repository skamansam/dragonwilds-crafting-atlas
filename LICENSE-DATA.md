# Data & Asset Licensing

This repository mixes several kinds of content with **different licenses**.
The MIT `LICENSE` file covers original code only. Everything else is covered here.

## 1. The dataset — `site/data.js`

A derivative of text content from the [RuneScape: Dragonwilds Wiki](https://dragonwilds.runescape.wiki),
operated by Weird Gloop, whose text is licensed **CC BY-NC-SA 3.0**
(<https://creativecommons.org/licenses/by-nc-sa/3.0/>).

Accordingly, the dataset (item names, descriptions, stats, recipes, skill and
spell data, and the relationships between them) is licensed under
**Creative Commons Attribution-NonCommercial-ShareAlike 3.0**.

- **Attribution:** each node in the app links to its source wiki article; the
  dataset as a whole is attributed here to the wiki's contributors.
- **NonCommercial:** the dataset (and this project) may not be used commercially.
- **ShareAlike:** derivatives of the dataset must carry the same license.

## 2. Icons & images — `site/icons/`

The item, station, spell and skill icons are screenshots/artwork from
**RuneScape: Dragonwilds**, © **Jagex Limited**. They are used here under
Jagex's [Fan Content Policy](https://www.jagex.com/en-GB/legal/fan-content),
which is a separate, revocable, non-commercial permission — **not** an open
source or Creative Commons license, and **not** covered by this project's MIT
license. If you reuse them, you must comply with that policy yourself.

> Created using intellectual property belonging to Jagex Limited under the terms
> of Jagex's Fan Content Policy. This content is not endorsed by or affiliated
> with Jagex.

## 3. Fonts — `site/fonts/`

Cinzel and Alegreya Sans, both under the **SIL Open Font License 1.1**
(<https://openfontlicense.org/>), vendored from Google Fonts.

## 4. Source code

The scraper scripts and site code are MIT-licensed — see [`LICENSE`](LICENSE).

## Summary table

| Content | Location | License |
|---|---|---|
| Scraper & site code | `scripts/`, `site/*.js`, `site/*.html`, `site/*.css` | MIT |
| Game dataset | `site/data.js` | CC BY-NC-SA 3.0 (from the Dragonwilds Wiki) |
| Game icons | `site/icons/` | Jagex Fan Content Policy (all rights reserved) |
| Fonts | `site/fonts/` | SIL OFL 1.1 |
