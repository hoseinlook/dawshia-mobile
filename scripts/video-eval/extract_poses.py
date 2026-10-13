#!/usr/bin/env python3
"""
Runs the app's pose model on a video, frame by frame, and saves the keypoints.

Same pipeline as the phone (src/features/pose/usePoseDetection.ts):
  frame -> letterbox ("contain") to 192x192 RGB uint8 -> movenet_lightning_f16.tflite
  -> keypoints normalized to the (cropped) frame, like decodeMoveNet().

  python extract_poses.py <video> <out.json.gz> [--crop W:H:X:Y] [--start S] [--end S] [--fps N] [--upside-down]

--crop simulates the phone's framing (e.g. a portrait 9:16 window out of a landscape clip).
Needs ffmpeg/ffprobe and `pip install ai-edge-litert numpy`.
"""
import argparse
import gzip
import json
import os
import subprocess
import sys

import numpy as np
from ai_edge_litert.interpreter import Interpreter

SIZE = 192
HERE = os.path.dirname(os.path.abspath(__file__))
MODEL = os.path.join(HERE, '..', '..', 'assets', 'models', 'movenet_lightning_f16.tflite')


def probe(path):
    out = subprocess.run(
        ['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries',
         'stream=width,height,avg_frame_rate:stream_side_data=rotation', '-of', 'json', path],
        check=True, capture_output=True, text=True).stdout
    s = json.loads(out)['streams'][0]
    num, den = s['avg_frame_rate'].split('/')
    w, h = s['width'], s['height']
    rotation = next((abs(int(d.get('rotation', 0))) for d in s.get('side_data_list', [])), 0)
    if rotation in (90, 270):  # ffmpeg auto-rotates the decoded frames
        w, h = h, w
    return w, h, float(num) / float(den or 1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('video')
    ap.add_argument('out')
    ap.add_argument('--crop', help='W:H:X:Y window of the upright frame, like the phone would see')
    ap.add_argument('--start', type=float, default=0)
    ap.add_argument('--end', type=float)
    ap.add_argument('--fps', type=float, default=30, help='max frames per second sent to the model')
    ap.add_argument('--upside-down', action='store_true',
                    help='also run each frame rotated 180° and keep the more confident pose (inverted exercises)')
    args = ap.parse_args()

    w, h, src_fps = probe(args.video)
    filters = []
    if args.crop:
        cw, ch, cx, cy = (int(v) for v in args.crop.split(':'))
        filters.append(f'crop={cw}:{ch}:{cx}:{cy}')
        w, h = cw, ch
    fps = min(src_fps, args.fps)
    if src_fps > args.fps + 0.5:
        filters.append(f'fps={args.fps}')
    # Letterbox exactly like the native resizer's "contain" mode: scale the long side to 192, pad with black.
    filters.append(f'scale={SIZE}:{SIZE}:force_original_aspect_ratio=decrease:flags=bilinear')
    filters.append(f'pad={SIZE}:{SIZE}:(ow-iw)/2:(oh-ih)/2:black')

    cmd = ['ffmpeg', '-v', 'error', '-ss', str(args.start)]
    if args.end is not None:
        cmd += ['-to', str(args.end)]
    cmd += ['-i', args.video, '-vf', ','.join(filters), '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']
    raw = subprocess.run(cmd, check=True, capture_output=True).stdout
    frames = np.frombuffer(raw, np.uint8).reshape(-1, SIZE, SIZE, 3)

    interp = Interpreter(model_path=MODEL)
    interp.allocate_tensors()
    inp = interp.get_input_details()[0]
    out = interp.get_output_details()[0]

    # decodeMoveNet(): undo the letterbox bars.
    aspect = w / h
    content_w = 1 if aspect >= 1 else aspect
    content_h = 1 / aspect if aspect >= 1 else 1
    off_x = (1 - content_w) / 2
    off_y = (1 - content_h) / 2

    def run(img):
        interp.set_tensor(inp['index'], img[None].astype(inp['dtype']))
        interp.invoke()
        return interp.get_tensor(out['index'])[0, 0].copy()  # 17 x (y, x, score)

    rows = []
    flipped_frames = 0
    for i, frame in enumerate(frames):
        kp = run(frame)
        if args.upside_down:
            # Same as the app (selectUpright): rotate 180°, keep the more confident reading, rotate back.
            rot = run(frame[::-1, ::-1])
            if rot[:, 2].mean() > kp[:, 2].mean():
                rot[:, 0] = 1 - rot[:, 0]
                rot[:, 1] = 1 - rot[:, 1]
                kp = rot
                flipped_frames += 1
        flat = []
        for y, x, s in kp:
            flat += [round(float((x - off_x) / content_w), 4), round(float((y - off_y) / content_h), 4),
                     round(float(s), 3)]
        rows.append([round(i * 1000 / fps), flat])

    data = {
        'video': os.path.basename(args.video),
        'frameWidth': w,
        'frameHeight': h,
        'fps': round(fps, 3),
        'start': args.start,
        'crop': args.crop,
        'upsideDown': args.upside_down,
        'flippedFrames': flipped_frames,
        # [timestampMs, [x, y, score] x 17 in KEYPOINT_NAMES order]
        'frames': rows,
    }
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with gzip.open(args.out, 'wt') as f:
        json.dump(data, f, separators=(',', ':'))
    print(f'{args.video}: {len(rows)} frames at {fps:.1f} fps, {w}x{h} -> {args.out}', file=sys.stderr)


if __name__ == '__main__':
    main()
