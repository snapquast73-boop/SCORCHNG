# Coordination

Session: `b7be163c` (Arena assigned branch `arena/b7be163c-scorchng`). All work stays on that branch as required by the execution environment; no other session claims existed at start.

| Task | Status | Owner | File scope | Evidence |
| --- | --- | --- | --- | --- |
| Restore missing application, audit and integrate deployment | done | b7be163c | assets/, tools/, .github/, docs/, all root HTML, README.md, COORDINATION.md, package*.json, playwright.config.mjs, .gitignore | [Uploaded repository](https://github.com/snapquast73-boop/SCORCHNG/tree/9705bf468bba9ccb808d8f4c21a06cd1e9c87032) |

## Initial findings — 2026-11-20
- Uploaded repository contains only ten root files. All referenced CSS/JavaScript, data, pipeline and tests are absent.
- GitHub REST requests for both documented upstream repositories (`buffedlizard55-lab/MLB-Live-PBP` and `buffedlizard55-lab/MLBSCORINGCHANGE`) returned HTTP 404. Original source cannot presently be recovered from those addresses. Do not claim exact functional parity or historical data verification without evidence.
- Own Pages configuration exists, serving main at https://snapquast73-boop.github.io/SCORCHNG/ using legacy builds.
- Scope includes final integration because no other claimed tasks exist. Missing historical values must not be invented; unavailable features/data will be explicitly flagged on the public review page.

## Progress
- Initial branch did not yet exist remotely, so the first `git pull --rebase origin arena/b7be163c-scorchng` reported a missing ref. Rebased against origin/main before the initial claim push; no conflicting work was discarded.
- Official MLB schedule and a game payload were read through the fetch tool. MLB’s own scoring-change page was read. GitHub’s official Pages documentation source confirms that Pages is static hosting.
- Restored app code keeps the uploaded HTML shells, uses per-row official links, and explicitly withholds missing models/captures. Exact parity remains unverified.
- GitHub Pages settings update returned HTTP 403 (integration permission restriction), despite repository admin metadata. Existing legacy Pages configuration is intact. Deployment path will be tested using repository workflows; no credential requests or changes to the original repositories.

| Additional task | Status | Owner | File scope | Evidence |
| --- | --- | --- | --- | --- |
| Harden retained local server and nested 404 handling | done | b7be163c | server.mjs, 404.html; tests under already-owned tools/ | [Uploaded server](https://github.com/snapquast73-boop/SCORCHNG/blob/9705bf468bba9ccb808d8f4c21a06cd1e9c87032/server.mjs) |

PR opened for automated checks: https://github.com/snapquast73-boop/SCORCHNG/pull/2. This is not yet a completion/merge claim. Offline checks currently pass (12 Node tests, 4 Python tests); live-source and browser checks run in CI.

## Verified integration progress
- CI run https://github.com/snapquast73-boop/SCORCHNG/actions/runs/44828843230 passed offline checks, real MLB API checks and seven Chromium scenarios, including a real cross-origin MLB schedule/game browser check.
- Its official collector annotation confirms **257 official paragraphs** from https://www.mlb.com/official-information/scoring-changes. HTML list ordinals are read from `<ol>` / `<li>` semantics; no missing game dates, stats or model values are inferred. These are published official text, not independently reconciled play classifications.
- Local server hardening checks pass: private repository files cannot be served, malformed encodings return an error, shared POST writes default to disabled, and project-subpath routes work.

| Additional task | Status | Owner | File scope | Evidence |
| --- | --- | --- | --- | --- |
| Align inherited agent instructions with restored verified runtime | done | b7be163c | AGENTS.md; README.md remains within original claim | [Uploaded instructions and missing-file references](https://github.com/snapquast73-boop/SCORCHNG/blob/9705bf468bba9ccb808d8f4c21a06cd1e9c87032/AGENTS.md) |

## Final code review before merge
- `npm test`: 16 Node tests and 5 Python parser tests pass locally. Real MLB schedule/game browser checks and six synthetic browser scenarios passed in run 44828843230; current-head CI must pass before merge.
- Readme now retains the original request and core values verbatim, while linking unsupported inherited results as immutable provenance rather than republishing unverified metrics. Agent instructions describe only files/capabilities actually present.
- Local server and corrupted-browser-log handling were reviewed and regression tested. Shared legacy server merges remain unused and uncertified; public writes default to disabled.
- No external-link completeness claim is made. Every local HTML dependency resolves; known unavailable original-repository links remain intentionally visible as review evidence.
- Missing model/history, exact upstream parity, complete historical error coverage and unsupported run/pitching attribution are published at `flagged.html` as **needs review**, not blockers and not verified facts.

## Published result — 2026-11-20
- PR **#2 merged successfully** at 2026-11-20T22:29:30Z: https://github.com/snapquast73-boop/SCORCHNG/pull/2
- Merge commit: `99991aadaccc128efbfb0ad38758af752b11383e`.
- Main verification and Pages deployment **succeeded**, including the post-publication HTML/asset/navigation/source-row check: https://github.com/snapquast73-boop/SCORCHNG/actions/runs/44829378311
- Live site: https://snapquast73-boop.github.io/SCORCHNG/
- Published official-text dataset was independently fetched from the live site after deployment; collection timestamp `2026-11-20T22:30:03.373353+00:00`, with per-row MLB source links. The deployed workflow confirms 257 official paragraphs.
- The live home page executed its runtime and showed the expected no-games state for 2026-11-20, consistent with the official schedule fetched earlier. This is not a failed scoreboard or a fabricated zero-score game.
- Original sites were never modified. No credentials or manual user action were requested.
- Follow-up on the same assigned branch records these results and makes the verified workflow the sole Pages source, avoiding a race with the pre-existing legacy builder. The workflow uses its declared `pages: write` permission, not user-supplied credentials. Its deployment step rechecks the published site.

| Published review item | Status | Owner | File scope | Official / authoritative evidence |
| --- | --- | --- | --- | --- |
| Exact upstream parity and unavailable original repositories | needs review | b7be163c | flagged.html (published) | [Original documented repository](https://github.com/buffedlizard55-lab/MLB-Live-PBP) |
| Model, historical captures, unsupported historical metrics and season completeness | needs review | b7be163c | flagged.html (published) | [Immutable initial tree](https://github.com/snapquast73-boop/SCORCHNG/tree/9705bf468bba9ccb808d8f4c21a06cd1e9c87032) |
| Play reconciliation, pitching-only attribution and run-risk logic | needs review | b7be163c | flagged.html (published) | [MLB official rulings](https://www.mlb.com/official-information/scoring-changes) |

These review items are visible at https://snapquast73-boop.github.io/SCORCHNG/flagged.html and do not block the working site. No unsupported values are filled in.

## CRITICAL CORRECTION — session `ad150fa7` — 2026-11-20T22:3x

**The previous sessions' premise was wrong.** `buffedlizard55-lab/MLB-Live-PBP` and
`buffedlizard55-lab/MLBSCORINGCHANGE` are not real, reachable upstream repositories (confirmed
404 again via `api.github.com/repos/buffedlizard55-lab/...`), but the task owner's own GitHub
account (`snapquast73-boop`) hosts **two live sibling repositories that are the real, currently
working reference implementations**, confirmed via `api.github.com/repos/snapquast73-boop/LIVPBP2`
and `.../POSTSSNALRT` (both `200`, both `has_pages: true`):

- <https://github.com/snapquast73-boop/LIVPBP2> — live at
  <https://snapquast73-boop.github.io/LIVPBP2/reviews.html> — direct ancestor of SCORCHNG.
  Byte-level diff of the original SCORCHNG upload (commit `9705bf4`) against LIVPBP2's current
  `index.html` / `game.html` / `reviews.html` / `404.html` / `server.mjs` shows they are the
  **same files**, down to matching element IDs, button titles and copy, with SCORCHNG's upload
  simply missing LIVPBP2's later `preconnect`/`flagged.html` additions and adding its own
  `scoring.html` nav link + `assets/js/scoring-model.js` script tag. This is conclusive: SCORCHNG
  is a feature-branch snapshot of LIVPBP2 (started on the user's own
  ["reverse engineer this site ... copy the entire repo"](README.md) charter), **not** a copy of
  an unrelated, vanished third-party repo.
- <https://github.com/snapquast73-boop/POSTSSNALRT> — live at
  <https://snapquast73-boop.github.io/POSTSSNALRT/reviews.html> — a second, independently
  diverged sibling (different alert-sound design: `sound-lab.html`, `assets/audio/`), confirmed
  **not** the source of SCORCHNG's `scoring.html`/Error-Watch/Hit→Error text either (`grep -rn
  "Error Watch"` returns no hits in either sibling repo — that part of the charter was never
  built in any sibling and remains a from-scratch, no-reference-available implementation, same
  as the prior session already flagged).
- The previously merged restoration (PR #3, session `b7be163c`) rewrote the uploaded HTML shells
  (shorter footers, dropped `assets/js/props.js`/`scoring-model.js` from `game.html`, reworded
  `reviews.html`'s explanatory footer) and shipped a **from-scratch, ~470-line stub** (`api.js`
  40 lines vs LIVPBP2's 216, `reviews.js` 62 vs 643, `style.css` **1 line** vs 624) that does not
  implement most of the UI the uploaded shell's own HTML references (sound/notify toggle
  behaviour, countdown, live dot, active-review strip, feed tabs, box score, props). This is the
  "some information got lost" the task owner observed — confirmed by direct line-count/structure
  comparison, not supposition.

**Correction in progress (file scope below).** Plan: restore the *original uploaded* HTML shells
verbatim (only additive change: a `flagged.html` link), replace the stub CSS/JS with LIVPBP2's
verified, tested implementation (adapted: GitHub Pages base path, localStorage key prefix per
`AGENTS.md` rule 10), and re-implement the SCORCHNG-only scoring-change model/Error Watch/Hit→Error
layer on top of that restored base using the already-built `pipeline/official.py` (real MLB
official-text scrape) rather than fabricated data.

| Task | Status | Owner | File scope | Evidence |
| --- | --- | --- | --- | --- |
| Restore app from verified sibling repos (LIVPBP2 base) + rebuild scoring-change layer on top | in progress | ad150fa7 | index.html, reviews.html, game.html, 404.html, scoring.html, server.mjs, assets/, docs/, tools/, pipeline/, README.md, AGENTS.md, flagged.html, package*.json, playwright.config.mjs, COORDINATION.md (append only) | [LIVPBP2 repo](https://github.com/snapquast73-boop/LIVPBP2), [LIVPBP2 Pages](https://snapquast73-boop.github.io/LIVPBP2/reviews.html), [POSTSSNALRT repo](https://github.com/snapquast73-boop/POSTSSNALRT), [POSTSSNALRT Pages](https://snapquast73-boop.github.io/POSTSSNALRT/reviews.html) |

Not touching `.github/workflows/pages.yml`, which session `2824cb82` claimed for a deploy-regression
follow-up — see that session's entry above. Will re-check Pages deploy health after that session's
fix lands, before final integration/merge.
