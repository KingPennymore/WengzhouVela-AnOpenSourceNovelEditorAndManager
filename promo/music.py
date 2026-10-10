"""Original soundtrack for the 文舟 Vela promo: 96 BPM, D major, 42 bars (105 s).
Everything is synthesized here, so the track carries no third-party rights."""
import numpy as np, wave, sys

SR = 44100
BPM = 96
BEAT = 60 / BPM
BAR = BEAT * 4
BARS = 42
TOTAL = BARS * BAR + 3.0
N = int(TOTAL * SR)
rng = np.random.default_rng(7)
L = np.zeros(N); R = np.zeros(N)
dry_send = np.zeros(N)  # mono reverb send


def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


def place(sig, start, gain=1.0, pan=0.0, send=0.3):
    i = int(start * SR)
    if i >= N:
        return
    sig = sig[: N - i] * gain
    l = np.cos((pan + 1) * np.pi / 4); r = np.sin((pan + 1) * np.pi / 4)
    L[i:i + len(sig)] += sig * l * 1.414
    R[i:i + len(sig)] += sig * r * 1.414
    dry_send[i:i + len(sig)] += sig * send


def t_axis(dur):
    return np.arange(int(dur * SR)) / SR


def piano(m, dur=2.5, vel=1.0):
    t = t_axis(dur); f = hz(m); s = np.zeros_like(t)
    for k in range(1, 8):
        fk = f * k * (1 + 0.0004 * k * k)
        if fk > 16000:
            break
        s += np.sin(2 * np.pi * fk * t) / k ** 1.6 * np.exp(-t * (1.2 + 0.9 * k))
    env = np.minimum(t / 0.004, 1)
    rel = np.clip((dur - t) / 0.08, 0, 1)
    return s * env * rel * vel * 0.35


def pad(ms, dur):
    t = t_axis(dur); s = np.zeros_like(t)
    for m in ms:
        f = hz(m)
        for det in (-0.004, 0.0, 0.0045):
            ph = rng.uniform(0, 2 * np.pi)
            for k in range(1, 7):
                s += np.sin(2 * np.pi * f * (1 + det) * k * t + ph * k) / k ** 1.3
    a = 1.2; r = 1.4
    env = np.minimum(t / a, 1) * np.clip((dur - t) / r, 0, 1)
    lfo = 1 + 0.08 * np.sin(2 * np.pi * 0.2 * t)
    return s * env * lfo * 0.018


def bass(m, dur):
    t = t_axis(dur); f = hz(m)
    s = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(4 * np.pi * f * t) + 0.12 * np.sin(6 * np.pi * f * t)
    env = np.minimum(t / 0.01, 1) * np.exp(-t * 0.9) * np.clip((dur - t) / 0.06, 0, 1)
    return s * env * 0.32


def bell(m, dur=1.6):
    t = t_axis(dur); f = hz(m)
    mod = np.sin(2 * np.pi * f * 3.5 * t) * 1.6 * np.exp(-t * 3)
    s = np.sin(2 * np.pi * f * t + mod) + 0.3 * np.sin(2 * np.pi * f * 2 * t)
    return s * np.minimum(t / 0.003, 1) * np.exp(-t * 2.2) * 0.17


def kick():
    t = t_axis(0.45)
    f = 45 + 85 * np.exp(-t * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-t * 7) * 0.7 + rng.normal(0, 1, len(t)) * np.exp(-t * 300) * 0.05


def hat(open_=False):
    t = t_axis(0.3 if open_ else 0.06)
    n = rng.normal(0, 1, len(t)); n = np.diff(np.concatenate([[0], n]))
    return n * np.exp(-t * (14 if open_ else 70)) * 0.06


def clap():
    t = t_axis(0.35)
    n = rng.normal(0, 1, len(t))
    n = n - np.convolve(n, np.ones(6) / 6, mode='same')
    env = np.exp(-t * 16) + 0.6 * np.exp(-np.maximum(t - 0.012, 0) * 22) * (t > 0.012)
    return n * env * 0.12


# D major: I V vi IV  (D A Bm G)
prog = [[62, 66, 69], [61, 64, 69], [62, 66, 71], [62, 67, 71]]
roots = [38, 45, 47, 43]
for b in range(BARS):
    c = prog[b % 4]; t0 = b * BAR
    outro = b >= 38
    # pad on every bar (longer and swelling on the last chord)
    if b < 41:
        place(pad([m - 12 for m in c] + [c[0]], BAR + 1.2 if b < 40 else BAR * 2 + 2.5), t0, pan=0, send=0.5)
    # sparse intro piano: chord root + fifth on beats 1 and 3
    if b < 4 or outro:
        place(piano(c[0] + 12, 2.4, 0.9), t0, pan=-0.2)
        place(piano(c[2] + 12, 2.0, 0.6), t0 + 2 * BEAT, pan=0.2)
        if b == 41:
            for m in c + [c[0] + 12, c[0] + 24]:
                place(piano(m, 5.0, 0.7), t0, pan=0)
    # arpeggio 8ths
    if 4 <= b < 38:
        arp = [c[0], c[1], c[2], c[1] + 12, c[2] + 12, c[1] + 12, c[2], c[1]]
        for i, m in enumerate(arp):
            place(piano(m + 12, 0.9, 0.55 if i % 2 else 0.75), t0 + i * BEAT / 2, pan=-0.35 + 0.1 * (i % 4))
    # bass
    if 4 <= b < 38:
        for i, (off, d) in enumerate([(0, 1.5), (1.5, 1.0), (2.5, 1.5)]):
            place(bass(roots[b % 4], d * BEAT), t0 + off * BEAT, gain=0.9 if i == 0 else 0.7, send=0.05)
    # drums
    if 8 <= b < 38:
        fill = b % 8 == 7
        for beat in range(4):
            if beat in (0, 2) or (fill and beat == 3):
                place(kick(), t0 + beat * BEAT, gain=0.9, send=0.02)
            if beat in (1, 3) and b >= 12:
                place(clap(), t0 + beat * BEAT, pan=0.05, send=0.4)
        for e in range(8):
            place(hat(e == 7 and fill), t0 + e * BEAT / 2 + 0.01, gain=0.8 if e % 2 else 0.5, pan=0.3, send=0.05)
        if fill:
            for s in range(4):
                place(hat(), t0 + 3 * BEAT + s * BEAT / 4, gain=0.6, pan=0.3)
    # crash-ish swell into sections
    if b in (8, 16, 24, 32):
        t = t_axis(2.5); n = rng.normal(0, 1, len(t)); n = np.diff(np.concatenate([[0], n]))
        place(n * np.exp(-t * 1.8) * 0.05, t0, pan=0, send=0.6)

# lead motif (bell) — 8-bar phrase, played in bars 8-15, 24-31 and 32-37 (variation)
motif = [  # (beat offset in phrase, midi, length beats)
    (0, 74, 1.5), (1.5, 76, 0.5), (2, 78, 2), (4, 76, 1.5), (5.5, 73, 0.5), (6, 76, 2),
    (8, 78, 1), (9, 81, 1), (10, 83, 2), (12, 79, 1.5), (13.5, 78, 0.5), (14, 76, 2),
    (16, 74, 1.5), (17.5, 76, 0.5), (18, 78, 2), (20, 81, 1.5), (21.5, 78, 0.5), (22, 76, 2),
    (24, 78, 1), (25, 76, 1), (26, 74, 2), (28, 74, 1), (29, 71, 1), (30, 74, 2)]
for start_bar in (8, 24, 32):
    for off, m, ln in motif:
        bt = start_bar * BAR + off * BEAT
        if start_bar == 32 and off >= 24:
            continue
        place(bell(m, 1.2 + ln * BEAT), bt, pan=0.15, send=0.55)
# soft counter-melody in bars 16-23 (piano, higher register)
for b in range(16, 24):
    c = prog[b % 4]
    for i, m in enumerate([c[2] + 12, c[1] + 12, c[0] + 12]):
        place(piano(m + 12, 1.6, 0.5), b * BAR + (0, 1.5, 3)[i] * BEAT, pan=0.4, send=0.6)

# reverb: exponentially decaying stereo noise impulse via FFT convolution
ir_t = t_axis(2.8)
irL = rng.normal(0, 1, len(ir_t)) * np.exp(-ir_t * 2.4)
irR = rng.normal(0, 1, len(ir_t)) * np.exp(-ir_t * 2.4)
smooth = np.ones(8) / 8
irL = np.convolve(irL, smooth, 'same'); irR = np.convolve(irR, smooth, 'same')
size = 1 << int(np.ceil(np.log2(N + len(ir_t))))
S = np.fft.rfft(dry_send, size)
wetL = np.fft.irfft(S * np.fft.rfft(irL, size), size)[:N]
wetR = np.fft.irfft(S * np.fft.rfft(irR, size), size)[:N]
wet_gain = 0.22 / (np.sqrt(np.sum(irL ** 2)) + 1e-9)
L += wetL * wet_gain; R += wetR * wet_gain

# master: fade-in, fade-out, soft clip, normalize
t = np.arange(N) / SR
fade = np.minimum(t / 0.8, 1) * np.clip((TOTAL - t) / 4.0, 0, 1)
mix = np.stack([L, R], 1) * fade[:, None]
mix = np.tanh(mix / np.max(np.abs(mix)) * 1.4)
mix = mix / np.max(np.abs(mix)) * 0.89
out = sys.argv[1] if len(sys.argv) > 1 else 'music.wav'
with wave.open(out, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((mix * 32767).astype('<i2').tobytes())
print(f'wrote {out}: {TOTAL:.1f}s')
