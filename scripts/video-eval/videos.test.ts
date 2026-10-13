/**
 * Regression test on real videos: the keypoints the app's model found in each clip of
 * videos.json (committed in poses/; the videos themselves stay local) must still give the
 * right score through today's analyzers. See README "Testing on real videos".
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { judge, loadTrack, runVideo, type VideoEntry } from './runVideo';

const videos = JSON.parse(readFileSync(join(__dirname, 'videos.json'), 'utf8')) as VideoEntry[];
const judged = videos.filter((v) => !v.skip && !v.offSetup);

describe('analyzers on real videos', () => {
  it.each(judged.map((v) => [v.file, v] as const))('%s', (_, v) => {
    const poses = join(__dirname, 'poses', v.file.replace(/\.[^.]+$/, '.json.gz'));
    expect(existsSync(poses)).toBe(true);
    const { ok, result } = judge(v, runVideo(v.movement, loadTrack(poses)));
    if (!ok) throw new Error(`${v.file}: ${result}`);
  });
});
