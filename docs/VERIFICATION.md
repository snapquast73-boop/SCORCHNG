# Verification and restoration audit

Review date: 2026-11-20. Sessions: b7be163c (initial restoration), 3123a9c4 (full-runtime restoration).

## Scope and evidence boundaries

The initial commit contains ten root files only. Every uploaded file was read during the initial session. HTML references and the README were compared with the actual tracked tree. The initial runtime was a minimal reimplementation; session 3123a9c4 restored the full runtime by porting the working LIVPBP2/POSTSSNALRT sites (same owner) and merging SCORCHNG's scoring-changes extensions. Neither exact appearance nor full upstream feature parity can be verified because both documented upstream repositories returned HTTP 404 and their Pages sites could not be fetched.

This is a source-code / deployment verification, not a certification of every sentence of the inherited 61 KB README. Its historical numbers and claims remain **unverified**, linked as immutable provenance rather than republished as current results in the README, and flagged on the public [Flagged for Review](../flagged.html) page. Missing numerical values remain blank. Official log text is reproduced, not corrected or converted into guessed deltas.

## File review

Each row links to GitHub's authoritative uploaded source, or the publisher's official source used for the implementation.

| Scope | Finding and action | Official source / authoritative repository evidence |
| --- | --- | --- |
| index.html | All five script references and stylesheet were absent. Full scoreboard restored from LIVPBP2 (hydrated schedule, probable pitchers, decisions, review flags, logos, live status sweep); shell preserved. | [Uploaded page](https://github.com/snapquast73-boop/SCORCHNG/blob/9705bf468bba9ccb808d8f4c21a06cd1e9c87032/index.html), [MLB schedule](https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2026-09-11&hydrate=team,linescore,probablePitcher,decisions,review,flags), [LIVPBP2 scoreboard](https://snapquast73-boop.github.io/LIVPBP2/) |
| game.html | Full game view restored from LIVPBP2 (live panel with count/outs/runners/on-deck, linescore, box score, Props hit forecast, Challenges & Reviews with score tracker). Supports gamePk query parameter. | [Uploaded page](https://github.com/snapquast73-boop/SCORCHNG/blob/9705bf468bba9ccb808d8f4c21a06cd1e9c87032/game.html), [MLB game feed](https://statsapi.mlb.com/api/v1.1/game/824631/feed/live), [LIVPBP2 game view](https://snapquast73-boop.github.io/LIVPBP2/game.html?gamePk=824631) |
| reviews.html | Full Replay Feed restored from LIVPBP2 (challenges, ABS, boundary calls, under-review strip, runs-at-risk, score tracker, challenges-remaining counters, desktop notifications) merged with SCORCHNG Error Watch / Hit → Error / Pitching / Other tabs and R/H/RBI attribution. Initial observations are baselines, not invented changes. | [Uploaded page](https://github.com/snapquast73-boop/SCORCHNG/blob/9705bf468bba9ccb808d8f4c21a06cd1e9c87032/reviews.html), [MLB event registry](https://statsapi.mlb.com/api/v1/eventTypes), [MLB feed schema](https://statsapi.mlb.com/api/v1.1/game/824631/feed/live), [LIVPBP2 Replay Feed](https://snapquast73-boop.github.io/LIVPBP2/reviews.html), [POSTSSNALRT Replay Feed](https://snapquast73-boop.github.io/POSTSSNALRT/reviews.html) |
| scoring.html | Missing data/model are not replaced by synthetic historical results. Collector publishes only official numbered paragraphs under an explicit year heading. Blank/unavailable model and detailed historical views explain the gap. | [Uploaded page](https://github.com/snapquast73-boop/SCORCHNG/blob/9705bf468bba9ccb808d8f4c21a06cd1e9c87032/scoring.html), [MLB official scoring changes](https://www.mlb.com/official-information/scoring-changes) |
| README.md and AGENTS.md | Inherited instructions reference absent files and data. Verbatim charter retained, unsupported old results replaced by a clearly unverified immutable archive link, current agent instructions aligned with actual files, and own-site URL corrected. Original site untouched. | [Original uploaded README](https://github.com/snapquast73-boop/SCORCHNG/blob/9705bf468bba9ccb808d8f4c21a06cd1e9c87032/README.md), [Original instructions](https://github.com/snapquast73-boop/SCORCHNG/blob/9705bf468bba9ccb808d8f4c21a06cd1e9c87032/AGENTS.md) |
| LICENSE | MIT permission and copyright retained unchanged. No upstream license beyond the uploaded file can be verified. | [Uploaded license](https://github.com/snapquast73-boop/SCORCHNG/blob/9705bf468bba9ccb808d8f4c21a06cd1e9c87032/LICENSE) |
| server.mjs | Optional Node server is not a GitHub Pages backend. Restored browser never POSTs to it. Static build explicitly excludes server and repository metadata. | [Uploaded server](https://github.com/snapquast73-boop/SCORCHNG/blob/9705bf468bba9ccb808d8f4c21a06cd1e9c87032/server.mjs), [GitHub Pages static hosting documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages) |
| 404.html, .gitignore, new assets and deployment | Missing stylesheet restored. Build/test outputs ignored. Repository-subpath links tested. Generated public build uses an explicit allowlist. | [GitHub Pages project-site rules](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages), [GitHub's documentation source checked in session](https://github.com/github/docs/blob/main/content/pages/getting-started-with-github-pages/what-is-github-pages.md) |

## Data verification rules

- Schedule/game values come directly from MLB's response, without default zeroes. Every displayed table row has an MLB link; every game/feed card has a link to its official source.
- The official-text collector keeps MLB's wording (normalizing whitespace only), including any apparent typos. It requires an explicit year heading. It never manufactures IDs, game IDs, dates, players or stat effects. Source collection failure publishes a warning and an empty list.
- These paragraphs have **not** been independently reconciled to plays. They are official published assertions, not independently verified current classifications. No guarantee is made that the current source retains all prior seasons.
- Batting H/RBI comparisons require both snapshots and the same batter. Runner R comparisons require the same runner identity and an explicit isScoringEvent boolean in both snapshots. Missing runners do not become zeroes. A current feed is not proof of an initial call.
- Non-HR hit → field_error rows are isolated and silent. Only observed batting-stat changes reach the scoring-change chime. Pitching-only changes are unavailable, not guessed.
- Error rows include error event types and runner error credits; multiple credits in one play produce one row. They are error **plays**, not asserted charged-error counts. Video links use only an MLB-provided playId.
- The Props hit forecast is a per-plate-appearance estimate from official season stats (log5 + adjustments), not an MLB projection or betting line. The scoring-change overturn model, calibration, accuracy, initial live-call evidence and historical coverage remain blank/unavailable. No fitted overturn model is loaded or simulated.
- Browser storage is isolated under `mlbScoringChange.restored.v1.` (scoring observations) and `livpbp_feed_log_` (feed log); storage failure is reported. Retention limits are disclosed, not advertised as a complete archive.
- External links to unavailable upstream repositories are intentional review evidence, not functional navigation dependencies.

## Tests and reproducibility

- `npm test`: runtime assertions (SYNTHETIC fixtures) for both the LIVPBP2 review engine (classification, counters, scoring-change diff, pending rulings) and SCORCHNG R/H/RBI attribution, HTML local asset/navigation resolution, JS syntax, storage namespaces and per-row source links; Python official-text parser checks.
- `node tools/build.mjs`: static output allowlist.
- `node tools/live-check.mjs`: real official schedule, game and event-registry checks (requires MLB network access; run in GitHub Actions). Source URLs and check timestamps are saved as an artifact, never fake live values. CI also exercises real cross-origin MLB calls in Chromium.
- `npm run test:browser`: Chromium checks under `/SCORCHNG/`, all core routes/tabs, mobile review page, missing-source states, source links and HTML escaping. Mock fixtures are explicitly SYNTHETIC and never published. The separate live browser scenario uses real official sources.
- The sandbox cannot directly reach MLB/browser-download hosts or Actions artifact/log blob hosts. The fetch tool verified MLB schedule/game payloads and official scoring text; Actions performs reproducible full-source and browser checks with ordinary internet access.
- No statement that "all external links work" is made: documented upstream links are known unavailable. Local HTML navigation and assets are checked automatically; arbitrary MLB video availability and every outbound link have not been independently confirmed.

The retained local server now hides private paths, safely rejects malformed paths, supports the project subpath and defaults shared writes to disabled. The legacy opt-in merge routine is not used or certified by this restoration.

Deployment and PR results are recorded in [COORDINATION.md](../COORDINATION.md).
