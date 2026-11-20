# ⚾ MLB Scoring Changes — MLB Live PBP

**Your live site:** <https://snapquast73-boop.github.io/SCORCHNG/> ·
[Replay Feed](https://snapquast73-boop.github.io/SCORCHNG/reviews.html) ·
[Scoring Changes](https://snapquast73-boop.github.io/SCORCHNG/scoring.html) ·
[Flagged for Review](https://snapquast73-boop.github.io/SCORCHNG/flagged.html)

## Restoration status — 2026-11-20

The initial upload contained ten root files, but none of the assets, datasets, pipelines or tests
referenced by those files. Both documented upstream repositories returned HTTP 404 during this
session. The supplied HTML shells are retained; the missing runtime is reimplemented against
official MLB endpoints. **Exact visual/functional parity with the unavailable upstream is unverified.**

Working capabilities:
- Date-based scoreboard, live/final/upcoming filters, automatic refresh and game navigation.
- Game play-by-play, linescore, batting/pitching box score and exposed review/pending markers.
- All-scope error plays for a selected date, browser-local observed batting R/H/RBI changes and
  a separate silent hit → error tab. Missing values are blank, never default zeroes.
- Official scoring-change paragraphs, with MLB’s wording and an official source link on every row.
- Automated verification, scheduled official-text collection and GitHub Pages publication.

**Unavailable and flagged, not simulated:** historical first-call captures, fitted model,
forecasts, inherited historical numeric claims, full-season error scans, pitching-only change
detection and run-at-risk alerts. Browser logs are local, not shared across visitors. Old pending
markers in a current feed are not proof of an active unresolved review.

See [verification scope and official sources](docs/VERIFICATION.md), the public
[review page](flagged.html), and [coordination / deployment log](COORDINATION.md).

## Local use and checks

Requires Node.js 22 and Python 3. No application dependencies or credentials are required at runtime.

```sh
npm ci
npm test
python3 pipeline/official.py --output data/official.json
node server.mjs
```

Open port 8000. MLB access is needed to fetch real data; source failures are explicitly displayed.
The retained Node server disables shared log writes by default and does not serve private repository
files. Its legacy shared-merge code is not used by the restored client or certified as an evidence archive.

```sh
node tools/build.mjs                    # allowlisted static output in _site/
python3 pipeline/official.py            # collect official text into _site/data/official.json
npx playwright install chromium
npm run test:browser                    # clearly SYNTHETIC test fixtures
LIVE_BROWSER=1 npm run test:browser     # additionally verify real MLB browser requests
node tools/live-check.mjs               # real official source checks
```

GitHub Actions performs these checks with ordinary internet access before publication, and collects
official text every three hours. No server-side API is required on Pages. The browser polls MLB directly.

## 📌 Start here — project charter

Read this charter at the start of every session. The original owner's request is preserved verbatim:

> Review the repo. We are going to reverse engineer this site https://buffedlizard55-lab.github.io/MLB-Live-PBP/reviews.html Basically just copy the entire repo since it functionally works very well and i use it everyday. I don't want to break anything on this site so I want to create a copy that I can work on. Let's create a scoring-change model and integrate it into observed, captured, and any logged events that the alert system detects. We should aim to provide a score out of 100 whether the observed, captured, and logged event will be overturned from an error to a single, also for any scoring pending will be changed to a single, error, out, fielders choice, out, etc. We should include both the expected chance it will be overturned as well as the final result of the event.

> Put this prompt into the repo readme and read it everytime we work on the project as a starting point to make sure we are building what we are aiming for and have a strong base to continue building and improving on making something useful for everyday use. It should solve the problem of having to manually check everything ourselves and having an up to date current feed.

The model remains a **goal**, not an implemented/verified capability of this incomplete uploaded copy.
Follow-up requests and all original documentation remain available in the
[immutable initial README](https://github.com/snapquast73-boop/SCORCHNG/blob/9705bf468bba9ccb808d8f4c21a06cd1e9c87032/README.md).
Its statistical claims and absent-file references are **unverified**; they are not republished as
current results. Never modify the original user's repository or site.

### Standing verification rules

Use official MLB / Baseball Savant / GitHub sources and provide links. Leave unconfirmed values blank
and publish gaps on Flagged for Review. Never invent missing historical calls, deltas or model scores.
Keep hit → error changes out of the primary feed and sounds; main scoring alerts concern batting
R/H/RBI only. Do not train on final-ruling information that was unavailable at play time.

### Core values (preserved verbatim)

- **Maximize P(Win)** — “Maximize the Probability of Winning”: our decision making framework. In every decision, we weigh tradeoffs, assess risk, and choose the path that maximizes the probability that Arena succeeds. We set aside our emotions and make tough decisions in order to maximize P(Win). “Maximize P(Win)” frees us from constraints and clarifies that we must put Arena first.
- **Own the Outcome** — We own results end to end — not just our individual slice of the work. When problems arise and we have the means to act, we do so without waiting for permission or assignment. We treat failure and success as signals and use them to improve. At Arena, we stay accountable to the final outcome.

## License and source provenance

The uploaded MIT license is retained in [LICENSE](LICENSE). Original documented sources
([MLB-Live-PBP](https://github.com/buffedlizard55-lab/MLB-Live-PBP),
[MLBSCORINGCHANGE](https://github.com/buffedlizard55-lab/MLBSCORINGCHANGE)) were unavailable during
restoration. This repository does not claim that newly implemented code was recovered from them.
