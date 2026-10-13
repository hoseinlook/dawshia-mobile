#!/usr/bin/env python3
"""
Extracts keypoints for every video in videos.json that has no poses/ file yet (or all with --force).
Videos live in test-videos/ (not in git); keypoints go to scripts/video-eval/poses/ (in git).

  python scripts/video-eval/extract_all.py [movement] [--force]
"""
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..', '..')
args = [a for a in sys.argv[1:] if not a.startswith('--')]
force = '--force' in sys.argv

for v in json.load(open(os.path.join(HERE, 'videos.json'))):
    if args and v['movement'] != args[0]:
        continue
    video = os.path.join(ROOT, 'test-videos', v['file'])
    out = os.path.join(HERE, 'poses', os.path.splitext(v['file'])[0] + '.json.gz')
    if v.get('skip') or (os.path.exists(out) and not force):
        continue
    if not os.path.exists(video):
        print(f'missing {video} (download: {v.get("download")})', file=sys.stderr)
        continue
    cmd = [sys.executable, os.path.join(HERE, 'extract_poses.py'), video, out]
    if v['movement'] in ('handstand', 'handstandpushup'):
        cmd += ['--upside-down']  # like the app for inverted exercises
    if v.get('crop'):
        cmd += ['--crop', v['crop']]
    if v.get('activeRange'):
        start, end = v['activeRange']
        # A little lead-in so the analyzer sees the start position first.
        cmd += ['--start', str(max(0, start - 1)), '--end', str(end + 1)]
    subprocess.run(cmd, check=True)
