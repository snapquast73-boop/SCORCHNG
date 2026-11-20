# Agent instructions — SCORCHNG

1. Read the **Start here — project charter** section of README.md and COORDINATION.md at session start.
   Claim non-overlapping work on the shared task board before editing. Stay on the Arena-assigned branch;
   do not switch/create branches when the execution environment prohibits it.
2. This upload was incomplete. Consult docs/VERIFICATION.md and flagged.html. Do not assume that the
   original README's pipeline, historical captures or fitted model exist. The immutable original
   instructions are at https://github.com/snapquast73-boop/SCORCHNG/blob/9705bf468bba9ccb808d8f4c21a06cd1e9c87032/AGENTS.md.
3. Never modify either original upstream repository or site. Preserve the uploaded MIT license.
4. No hallucinated facts: all data rows require official links (MLB StatsAPI, MLB official scoring-change
   page, Baseball Savant). Missing fields stay blank. A current final feed is not evidence of an initial
   call. Never fabricate a game, stat delta, pitcher, timestamp, video ID, model probability or coverage claim.
5. Publish irregularities and unavailable evidence on flagged.html. Runtime source/storage failures must
   remain visible. Official text is not independently play-reconciled; preserve its wording and any typos.
6. The missing runtime was reimplemented, not recovered. Exact upstream parity is unverified. Keep the
   existing HTML shell and feature separation; do not replace unavailable features with made-up results.
7. Model functionality is intentionally absent until real training data and leakage-free out-of-sample
   validation exist. Missing model/data must never break the feed or generate alerts.
8. Main scoring alerts are **batting R/H/RBI only**. Hit → error rows stay separate and silent. Unknown
   classifications do not imply H=0. Compare RBI only if both observations supply a number. Attribute R
   only to the same identified runner with explicit scoring flags in both snapshots, never to the batter
   based on the play's team score. Unsupported pitching/run-risk attribution must remain flagged.
9. Error Watch includes runner-level error movements/credits on hits, fielders choices and outs, not only
   batter-reached errors. Deduplicate to one row per play; do not confuse play counts with error credits.
10. Browser persistence keys must start `mlbScoringChange.`. Current logs are local to a browser, bounded
    to 500 rows across the newest seven selected dates; do not describe them as shared evidence. The optional
    server's legacy POST merging is not used by this client and writes default to disabled.
11. `pipeline/official.py` generates official text from explicit source season headings and HTML list
    positions. Never hand-edit generated official rows. Source errors yield a flagged empty result, not
    synthetic replacements. Generated `_site/`, dependency trees and test artifacts stay out of Git.
12. Before every push run `npm test`. CI also checks live official APIs and Chromium under `/SCORCHNG/`.
    All synthetic fixtures must be explicitly labelled SYNTHETIC. See package.json for commands.
13. Static builds use an explicit allowlist in tools/build.mjs. Never publish .git, credentials, the optional
    server, caches or test fixtures. Project-site navigation must work below `/SCORCHNG/`, including nested 404s.
14. Record source links, checks, PRs, deployment outcomes and remaining flags in COORDINATION.md.
    Do not mark historical claims verified just because a build passes. Own failures through deployment;
    never claim the site is live until GitHub confirms deployment and published resources are checked.
