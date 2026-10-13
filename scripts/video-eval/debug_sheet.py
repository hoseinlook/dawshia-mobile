#!/usr/bin/env python3
"""
Contact sheet for debugging an analyzer: video frames with the detected skeleton and the
analyzer's phase / metrics / events drawn on top.

  npx tsx scripts/video-eval/evaluate.ts <movement> --trace     # writes test-videos/debug/*.trace.json
  python scripts/video-eval/debug_sheet.py <movement>/<clip>.mp4 [--every 0.5] [--from S] [--to S]
  -> test-videos/debug/<movement>/<clip>.sheet.jpg

Needs `pip install pillow`.
"""
import argparse
import gzip
import json
import os
import subprocess

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..', '..')
NAMES = ['nose', 'lEye', 'rEye', 'lEar', 'rEar', 'lSho', 'rSho', 'lElb', 'rElb', 'lWri', 'rWri',
         'lHip', 'rHip', 'lKne', 'rKne', 'lAnk', 'rAnk']
BONES = [(5, 6), (5, 7), (7, 9), (6, 8), (8, 10), (5, 11), (6, 12), (11, 12), (11, 13), (13, 15),
         (12, 14), (14, 16)]
TILE_W = 320


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('clip', help='path under test-videos/, e.g. pullup/pexels-front-1.mp4')
    ap.add_argument('--every', type=float, default=0.5)
    ap.add_argument('--from', dest='start', type=float, default=0)
    ap.add_argument('--to', dest='end', type=float)
    ap.add_argument('--cols', type=int, default=6)
    args = ap.parse_args()

    stem = os.path.splitext(args.clip)[0]
    poses = json.load(gzip.open(os.path.join(HERE, 'poses', stem + '.json.gz'), 'rt'))
    trace = json.load(open(os.path.join(ROOT, 'test-videos', 'debug', stem + '.trace.json')))
    by_ms = {t['ms']: t for t in trace}
    w, h = poses['frameWidth'], poses['frameHeight']
    tile_h = round(TILE_W * h / w)

    # Raw frames in the same window extract_poses.py used.
    vf = []
    if poses.get('crop'):
        vf.append('crop=' + poses['crop'])
    vf.append(f'fps={poses["fps"]}')
    vf.append(f'scale={TILE_W}:{tile_h}')
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-ss', str(poses.get('start', 0)), '-i',
                          os.path.join(ROOT, 'test-videos', args.clip), '-vf', ','.join(vf), '-f', 'rawvideo',
                          '-pix_fmt', 'rgb24', '-'], check=True, capture_output=True).stdout
    size = TILE_W * tile_h * 3
    n = min(len(raw) // size, len(poses['frames']))

    # Pick frames every `--every` seconds, plus every frame with an event.
    picks, last = [], -1e9
    for i in range(n):
        ms = poses['frames'][i][0]
        if ms < args.start * 1000 or (args.end is not None and ms > args.end * 1000):
            continue
        t = by_ms.get(ms, {})
        if ms - last >= args.every * 1000 or t.get('events'):
            picks.append(i)
            last = ms

    tiles = []
    for i in picks:
        ms, flat = poses['frames'][i]
        t = by_ms.get(ms, {})
        img = Image.frombytes('RGB', (TILE_W, tile_h), raw[i * size:(i + 1) * size])
        d = ImageDraw.Draw(img)
        pts = [(flat[k * 3] * TILE_W, flat[k * 3 + 1] * tile_h, flat[k * 3 + 2]) for k in range(17)]
        color = (61, 220, 151) if t.get('inPosition') else (255, 176, 32)
        for a, b in BONES:
            if pts[a][2] >= 0.3 and pts[b][2] >= 0.3:
                d.line([pts[a][:2], pts[b][:2]], fill=color, width=2)
        for x, y, s in pts:
            if s >= 0.3:
                d.ellipse([x - 3, y - 3, x + 3, y + 3], outline=color)
        metrics = ' '.join(f'{k}={v:.2f}' if isinstance(v, float) else f'{k}={v}'
                           for k, v in (t.get('metrics') or {}).items())
        lines = [f'{ms / 1000:.2f}s {t.get("phase", "")} {"IN" if t.get("inPosition") else "out"}',
                 metrics[:60], metrics[60:120], ' '.join(t.get('events', []) + t.get('cues', []))[:60]]
        d.rectangle([0, 0, TILE_W, 52], fill=(0, 0, 0))
        for k, line in enumerate(lines):
            d.text((3, 1 + k * 12), line, fill=(255, 80, 80) if k == 3 and t.get('events') else (255, 255, 255))
        tiles.append(img)

    cols = args.cols
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * TILE_W, max(1, rows) * tile_h), (20, 20, 20))
    for k, img in enumerate(tiles):
        sheet.paste(img, ((k % cols) * TILE_W, (k // cols) * tile_h))
    out = os.path.join(ROOT, 'test-videos', 'debug', stem + '.sheet.jpg')
    sheet.save(out, quality=80)
    print(out, f'{len(tiles)} tiles')


if __name__ == '__main__':
    main()
