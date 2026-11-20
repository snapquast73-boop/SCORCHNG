# Coordination

Session: `b7be163c` (Arena assigned branch `arena/b7be163c-scorchng`). All work stays on that branch as required by the execution environment; no other session claims existed at start.

| Task | Status | Owner | File scope | Evidence |
| --- | --- | --- | --- | --- |
| Restore missing application, audit and integrate deployment | in progress | b7be163c | assets/, tools/, .github/, docs/, all root HTML, README.md, COORDINATION.md, package*.json, playwright.config.mjs, .gitignore | [Uploaded repository](https://github.com/snapquast73-boop/SCORCHNG/tree/9705bf468bba9ccb808d8f4c21a06cd1e9c87032) |

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
