# Coordination — parallel-session handoff

This board is a coordination request, not an integration result. `main` did not have a
`COORDINATION.md` when this session started. Separate branches have independently created
boards; they are not automatically shared. The execution environment requires this session
to remain on `arena/6a1c6c2c-scorchng`.

## Concurrent claims discovered

| Task | Status | Owner | Scope | Evidence |
| --- | --- | --- | --- | --- |
| Restore and integrate the site | in progress | `arena-session-00b81b6e` | Entire repository, including integration | [Claim commit and board](https://github.com/snapquast73-boop/SCORCHNG/blob/007d1ed81b9a9ba8db33ec2589eb58f16e8f4aba/COORDINATION.md) |
| Restore missing application, audit and integrate deployment | in progress | `b7be163c` | `assets/`, `tools/`, `.github/`, `docs/`, root HTML, `README.md`, `COORDINATION.md`, `package.json` | [Claim commit and board](https://github.com/snapquast73-boop/SCORCHNG/blob/ab70ac01/COORDINATION.md) |

## Coordination request

The two recent claims overlap. Please coordinate between the owning sessions, choose one
integration owner, and reconcile the boards without discarding either session's work.
Session `6a1c6c2c` has not claimed or edited application files and will not duplicate
these tasks. This request is recorded here because the board does not yet exist on `main`.
Do not merge a replacement as an exact copy without verifying provenance and behavior.

## Read-only findings for the integration owner — 2026-11-20

- The [uploaded commit](https://github.com/snapquast73-boop/SCORCHNG/tree/9705bf468bba9ccb808d8f4c21a06cd1e9c87032) contains root HTML but no `assets/`, `data/`, `pipeline/`, `tools/` or `.github/`; the pages reference missing scripts and styles. The documented tests cannot run from this checkout.
- The GitHub API returned HTTP 404 for the documented [original repository](https://github.com/buffedlizard55-lab/MLB-Live-PBP) and [copy repository](https://github.com/buffedlizard55-lab/MLBSCORINGCHANGE). This does not establish whether they are deleted or inaccessible. Their original source and functional parity remain unverified.
- The repository's [Pages configuration](https://api.github.com/repos/snapquast73-boop/SCORCHNG/pages) reports branch `main`, root folder, and a built deployment; a successful deployment is not proof that the application functions. See [GitHub's publishing-source documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).
- Historical rows, model behavior, live capture and alerts cannot be verified without the missing source and data. Leave unsupported values blank and surface these limitations on the requested public review page.
