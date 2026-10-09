#!/usr/bin/env python3
"""
Synthesizes Dawshia's original match sounds (arcade-arena style) as WAV files.
No dependencies. Run from the project root:  python3 scripts/generate-sounds.py

Output: assets/sounds/match/
  countdown.wav   short beep for 3-2-1
  start.wav       horn when the match goes live
  music.wav       seamless background loop (120 BPM)
  intense.wav     seamless "final seconds" loop (150 BPM, rising, more drums)
  tick.wav        clock tick for the last 5 seconds
  buzzer.wav      end of match
  fanfare.wav     record / level up celebration
"""
import math
import os
import random
import struct
import wave

RATE = 22050
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'sounds', 'match')
random.seed(7)


def silence(seconds):
    return [0.0] * int(seconds * RATE)


def add(buf, start, samples, gain=1.0):
    for i, v in enumerate(samples):
        j = start + i
        if j < len(buf):
            buf[j] += v * gain


def note_freq(semitones_from_a4):
    return 440.0 * 2 ** (semitones_from_a4 / 12)


def env(i, n, attack=0.005, decay=None):
    t = i / RATE
    a = min(1.0, t / attack) if attack > 0 else 1.0
    if decay is None:
        tail = min(1.0, (n - i) / (0.01 * RATE))  # tiny release to avoid clicks
        return a * tail
    return a * math.exp(-t / decay)


def tone(freq, seconds, wave_type='sine', decay=None, vibrato=0.0):
    n = int(seconds * RATE)
    out, phase = [], 0.0
    for i in range(n):
        f = freq * (1 + vibrato * math.sin(2 * math.pi * 6 * i / RATE))
        phase += f / RATE
        p = phase % 1.0
        if wave_type == 'sine':
            v = math.sin(2 * math.pi * p)
        elif wave_type == 'square':
            v = 1.0 if p < 0.5 else -1.0
        else:  # saw
            v = 2 * p - 1
        out.append(v * env(i, n, decay=decay))
    return out


def lowpass(samples, cutoff):
    rc = 1 / (2 * math.pi * cutoff)
    alpha = (1 / RATE) / (rc + 1 / RATE)
    out, y = [], 0.0
    for v in samples:
        y += alpha * (v - y)
        out.append(y)
    return out


def kick():
    n = int(0.18 * RATE)
    out, phase = [], 0.0
    for i in range(n):
        t = i / RATE
        f = 45 + 90 * math.exp(-t / 0.03)
        phase += f / RATE
        out.append(math.sin(2 * math.pi * phase) * math.exp(-t / 0.07))
    return out


def snare():
    n = int(0.16 * RATE)
    return [
        (random.uniform(-1, 1) * 0.8 + 0.4 * math.sin(2 * math.pi * 190 * i / RATE)) * math.exp(-(i / RATE) / 0.05)
        for i in range(n)
    ]


def hat(length=0.04):
    n = int(length * RATE)
    prev, out = 0.0, []
    for i in range(n):
        x = random.uniform(-1, 1)
        out.append((x - prev) * math.exp(-(i / RATE) / (length / 3)))  # crude high-pass
        prev = x
    return out


def normalize(buf, peak=0.85):
    m = max(1e-9, max(abs(v) for v in buf))
    return [v * peak / m for v in buf]


def save(name, buf):
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, name)
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(b''.join(struct.pack('<h', int(max(-1, min(1, v)) * 32767)) for v in buf))
    print(f'{name}: {len(buf) / RATE:.2f}s')


def loop(bpm, bars, intense):
    beat = 60 / bpm
    step = beat / 2  # eighth notes
    total = int(bars * 4 * beat * RATE)
    buf = [0.0] * total
    # A-minor pentatonic riff (semitones from A4), one note per eighth.
    riff = [-24, -24, -12, -24, -21, -24, -19, -17] if not intense else [-24, -12, -24, -12, -21, -9, -19, -7]
    for s in range(bars * 8):
        at = int(s * step * RATE)
        beat_in_bar = (s // 2) % 4
        if s % 2 == 0 and (intense or beat_in_bar in (0, 2)):
            add(buf, at, kick(), 0.9)
        if intense and s % 2 == 1 and beat_in_bar == 3:
            add(buf, at, kick(), 0.6)
        if s % 2 == 0 and beat_in_bar in (1, 3):
            add(buf, at, snare(), 0.55)
        add(buf, at, hat(), 0.25 if s % 2 else 0.35)
        if intense:
            add(buf, at + int(step / 2 * RATE), hat(0.025), 0.2)  # sixteenth hats
        bass = lowpass(tone(note_freq(riff[s % 8]), step * 0.9, 'saw', decay=step * 0.6), 900)
        add(buf, at, bass, 0.5)
        if s % 8 == 0:  # chord stab at the start of each bar
            for semis in (0, 3, 7):
                add(buf, at, lowpass(tone(note_freq(-12 + semis), beat * 0.5, 'saw', decay=0.12), 2500), 0.12)
    if intense:  # rising siren across the loop builds tension
        n = total
        phase = 0.0
        for i in range(n):
            f = 600 + 500 * (i / n)
            phase += f / RATE
            buf[i] += 0.06 * math.sin(2 * math.pi * phase) * (0.5 + 0.5 * math.sin(2 * math.pi * 4 * i / RATE))
    # Short fades at both edges so the loop point never clicks.
    fade = int(0.008 * RATE)
    for i in range(fade):
        g = i / fade
        buf[i] *= g
        buf[-1 - i] *= g
    # The intense loop is mixed hotter than the normal one so the switch feels like a lift.
    return normalize(buf, 0.85 if intense else 0.65)


def main():
    save('countdown.wav', normalize(tone(880, 0.16, 'square', decay=0.06), 0.7))
    horn = silence(0.9)
    for semis, g in ((-12, 0.5), (-8, 0.4), (-5, 0.4), (0, 0.3)):  # A major chord
        add(horn, 0, lowpass(tone(note_freq(semis), 0.85, 'saw', vibrato=0.006), 3000), g)
    save('start.wav', normalize(horn))
    save('music.wav', loop(120, 4, intense=False))
    save('intense.wav', loop(150, 4, intense=True))
    save('tick.wav', normalize(tone(1500, 0.05, 'square', decay=0.012), 0.6))
    buzz = silence(1.0)
    add(buzz, 0, tone(110, 0.95, 'square'), 0.5)
    add(buzz, 0, tone(164.8, 0.95, 'square'), 0.4)
    save('buzzer.wav', normalize(lowpass(buzz, 1800)))
    fan = silence(1.6)
    for k, semis in enumerate((3, 7, 10, 15)):  # C E G C arpeggio
        add(fan, int(k * 0.13 * RATE), lowpass(tone(note_freq(semis), 0.45 if k < 3 else 1.0, 'saw', vibrato=0.004), 3500), 0.5)
    save('fanfare.wav', normalize(fan))


if __name__ == '__main__':
    main()
