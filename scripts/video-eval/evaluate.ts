/**
 * Runs every video in videos.json through the app's exercise analyzers (using the keypoints
 * extract_poses.py saved in poses/) and compares reps / hold time with what is in the video.
 *
 *   npx tsx scripts/video-eval/evaluate.ts [movement] [--verbose] [--trace]
 *
 * --trace writes per-frame analyzer output to test-videos/debug/ for debug_sheet.py.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { judge, loadTrack, runVideo, type VideoEntry } from './runVideo';


const HERE = __dirname;
const only = process.argv.slice(2).find((a: string) => !a.startsWith('--'));
const verbose = process.argv.includes('--verbose');
const writeTrace = process.argv.includes('--trace');
const videos = (JSON.parse(readFileSync(join(HERE, 'videos.json'), 'utf8')) as VideoEntry[]).filter(
  (v) => !only || v.movement === only,
);

const pct = (x: number) => `${Math.round(x * 100)}%`;
let failed = 0;
for (const v of videos) {
  const posePath = join(HERE, 'poses', v.file.replace(/\.[^.]+$/, '.json.gz'));
  if (v.skip) {
    console.log(`- ${v.file}: skipped (${v.skip})`);
    continue;
  }
  if (!existsSync(posePath)) {
    console.log(`? ${v.file}: no keypoints yet (run extract_all.sh)`);
    continue;
  }
  const r = runVideo(v.movement, loadTrack(posePath));
  if (writeTrace) {
    const out = join(HERE, '..', '..', 'test-videos', 'debug', v.file.replace(/\.[^.]+$/, '.trace.json'));
    mkdirSync(join(out, '..'), { recursive: true });
    writeFileSync(out, JSON.stringify(r.trace));
  }
  const { ok, result } = judge(v, r);
  if (!ok && !v.offSetup) failed++;
  console.log(
    `${v.offSetup ? '·' : ok ? '✓' : '✗'} ${v.file}: ${result} · visible ${pct(r.visibleRatio)} · in position ${pct(r.inPositionRatio)} · ready ${r.readyAtS ?? 'never'}${r.readyAtS !== null ? ' s' : ''}`,
  );
  if (v.offSetup) console.log(`    off setup: ${v.offSetup}`);
  if (verbose || (!ok && !v.offSetup)) {
    if (r.repTimesS.length) console.log(`    reps at ${r.repTimesS.join(', ')} s`);
    if (Object.keys(r.rejected).length) console.log(`    rejected ${JSON.stringify(r.rejected)}`);
    if (Object.keys(r.cues).length) console.log(`    cues (frames) ${JSON.stringify(r.cues)}`);
  }
}
const offSetup = videos.filter((v) => v.offSetup).length;
console.log(
  `\n${failed ? `${failed} video(s) off` : 'All in-setup videos OK'} · ${offSetup} off-setup clip(s) not judged`,
);
process.exit(failed ? 1 : 0);
