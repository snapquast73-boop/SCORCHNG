// Keep the verified artifact last when a pre-existing legacy Pages publisher is enabled.
// No repository administration or settings changes are required.
import { setTimeout } from 'node:timers/promises';
const repository = process.env.GITHUB_REPOSITORY;
const sha = process.env.GITHUB_SHA;
if (!repository || !sha || !process.env.GH_TOKEN) throw new Error('Missing Actions context');
for (let attempt = 0; attempt < 30; attempt++) {
 const response = await fetch(`https://api.github.com/repos/${repository}/actions/runs?head_sha=${sha}&per_page=100`, {
  headers: { Authorization: `Bearer ${process.env.GH_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
  signal: AbortSignal.timeout(30000)
 });
 if (!response.ok) throw new Error(`Could not check legacy publisher: HTTP ${response.status}`);
 const result = await response.json();
 const legacy = (result.workflow_runs || []).filter(r => r.path === 'dynamic/pages/pages-build-deployment' || r.name === 'pages build and deployment');
 const active = legacy.filter(r => r.status !== 'completed');
 if (!active.length) {
  console.log(`Legacy publisher barrier clear (${legacy.length} matching completed runs). Publishing the verified artifact now.`);
  break;
 }
 if (attempt === 29) throw new Error('Legacy publisher is still active; refusing to race its deployment. Retry this workflow after it finishes.');
 console.log(`Waiting for ${active.length} legacy publisher(s) to finish.`);
 await setTimeout(10000);
}
