"""Soundtrack of the 文舟 0.9.9 promo: an original Nordic-folk score (bowed strings over drones, a plucked kantele,
frame drums and wind), the sound effects, and the English voice-over from voice/*.wav, mixed to soundtrack.wav.
Everything is synthesised here from the timeline in lines.js, so cues land on the same frames as the picture and the
track carries no third-party rights. The voice is Kokoro-82M (Apache-2.0), rendered by voice.py.
Usage: python3 promo/0.9.9/soundtrack.py      (needs: numpy, scipy, soundfile)"""
import json, pathlib
import numpy as np, soundfile as sf
from scipy import signal

HERE = pathlib.Path(__file__).resolve().parent
PROMO = json.loads((HERE / 'lines.js').read_text('utf-8').split('\nwindow.PROMO=', 1)[1].strip().rstrip(';'))
SR = 48000
TOTAL = PROMO['duration'] + 1.0
N = int(TOTAL * SR)
rng = np.random.default_rng(99)
BUS = {k: np.zeros((N, 2)) for k in ('strings', 'pluck', 'drums', 'tone', 'sfx', 'wind', 'voice')}
SEND = np.zeros(N)  # mono reverb send


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def axis(d):
    return np.arange(int(d * SR)) / SR


def place(bus, sig, at, gain=1.0, pan=0.0, send=0.25):
    i = int(at * SR)
    if i >= N or len(sig) == 0:
        return
    if i < 0:
        sig, i = sig[-i:], 0
    sig = sig[:N - i] * gain
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    BUS[bus][i:i + len(sig), 0] += sig * l * 1.414
    BUS[bus][i:i + len(sig), 1] += sig * r * 1.414
    SEND[i:i + len(sig)] += sig * send


def band(x, lo, hi, order=2):
    return signal.sosfilt(signal.butter(order, [lo, hi], 'bandpass', fs=SR, output='sos'), x)


def low(x, f, order=2):
    return signal.sosfilt(signal.butter(order, f, 'lowpass', fs=SR, output='sos'), x)


def high(x, f, order=2):
    return signal.sosfilt(signal.butter(order, f, 'highpass', fs=SR, output='sos'), x)


def noise(d):
    return rng.normal(0, 1, int(d * SR))


# ---------------------------------------------------------------- instruments
def bowed(m, dur, amp=.1, att=.5, rel=.9, vib=.0045, bright=1.0, short=False):
    """A bowed string: a vibrato'd sawtooth whose brightness swells with the bow, plus a little bow noise."""
    f = hz(m)
    t = axis(dur + rel)
    v = 1 + vib * np.sin(2 * np.pi * 5.3 * t + rng.uniform(0, 6)) * np.minimum(t / .7, 1) + .0015 * np.sin(2 * np.pi * .7 * t)
    ph = 2 * np.pi * np.cumsum(f * v) / SR
    env = np.sin(np.pi / 2 * np.minimum(t / att, 1)) ** 2 * np.clip((dur + rel - t) / rel, 0, 1)
    K = int(min(18, 9000 / f))
    s = sum(np.sin(k * ph) / k * (bright ** (k - 1)) for k in range(1, K + 1))
    s += low(noise(dur + rel), 3000) * .025
    if short:
        env = np.exp(-t * 9) * np.minimum(t / .008, 1)
    return s * env * amp


def pluck(m, amp=.1, decay=1.0):
    f = hz(m)
    t = axis(3.2)
    s = sum(np.sin(2 * np.pi * k * f * (1 + .0006 * k * k) * t) / k ** 1.2 * np.exp(-t * (decay * .9 + .55 * k)) for k in range(1, 10) if k * f < 12000)
    return s * np.minimum(t / .002, 1) * amp


def drum(amp=.5, f0=60, decay=5.0, skin=.25):
    t = axis(1.6)
    f = f0 * (1 + .7 * np.exp(-t * 28))
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sin(ph) * np.exp(-t * decay) + .3 * np.sin(1.5 * ph) * np.exp(-t * decay * 2)
    s += low(noise(1.6), 1100) * np.exp(-t * 35) * skin
    return s * amp


def glass(m, dur, amp=.05):
    t = axis(dur)
    f = hz(m)
    s = np.sin(2 * np.pi * f * t) + .3 * np.sin(2 * np.pi * f * 2.001 * t) + .12 * np.sin(2 * np.pi * f * 3.003 * t)
    env = np.minimum(t / 2.0, 1) * np.clip((dur - t) / 1.5, 0, 1) * (1 + .15 * np.sin(2 * np.pi * .5 * t))
    return s * env * amp


def bell(m, amp=.08, d=3.0):
    t = axis(d)
    f = hz(m)
    mod = np.sin(2 * np.pi * f * 3.5 * t) * 1.8 * np.exp(-t * 2.5)
    return (np.sin(2 * np.pi * f * t + mod) + .4 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t * 3)) * np.exp(-t * 1.4) * np.minimum(t / .003, 1) * amp


def anvil(amp=.3):
    t = axis(2.4)
    s = sum(a * np.sin(2 * np.pi * 760 * r * t) * np.exp(-t * dk) for r, a, dk in ((1, 1, 2.2), (2.76, .7, 3), (5.4, .5, 4.5), (8.93, .35, 6), (13.3, .2, 8)))
    s += high(noise(2.4), 2500) * np.exp(-t * 40) * .8
    return s * amp


def whoosh(d, lo, hi, amp=.2):
    t = axis(d)
    x = noise(d)
    s = band(x, lo, hi) * np.sin(np.pi * np.clip(t / d, 0, 1)) ** 2
    return s * amp


def hoof(amp=.2, snow=True):
    t = axis(.25)
    s = np.sin(2 * np.pi * 85 * t) * np.exp(-t * 30) + low(noise(.25), 1800 if snow else 4000) * np.exp(-t * 55) * .7
    return s * amp


def crunch(amp=.1):
    t = axis(.18)
    grains = np.zeros(len(t))
    for g in rng.integers(0, int(.09 * SR), 26):
        grains[g:g + 120] += rng.normal(0, 1, len(grains[g:g + 120])) * np.exp(-np.arange(len(grains[g:g + 120])) / 30)
    return low(grains, 3500) * amp


def snort(amp=.2):
    t = axis(.7)
    e = np.exp(-((t - .12) / .07) ** 2) + .7 * np.exp(-((t - .38) / .12) ** 2)
    return band(noise(.7), 300, 1400) * e * amp


def sizzle(d=.8, amp=.06):
    t = axis(d)
    return high(noise(d), 4000) * np.exp(-t * 4) * (1 + .5 * np.sin(2 * np.pi * 31 * t)) * amp


def roar(d=2.6, amp=.5):
    t = axis(d)
    f = 62 + 14 * np.sin(2 * np.pi * 3.1 * t) + 20 * np.exp(-t * 2)
    ph = 2 * np.pi * np.cumsum(f) / SR
    saw = 2 * ((ph / (2 * np.pi)) % 1) - 1
    src = saw * (1 + .6 * low(noise(d), 60)) + noise(d) * .5
    s = band(src, 180, 420) * 1.2 + band(src, 600, 1000) * .8 + band(src, 1300, 1900) * .35
    env = np.minimum(t / .25, 1) * np.clip((d - t) / .9, 0, 1)
    return s * env * amp


def caw(amp=.18):
    t = axis(.32)
    f = 820 * (1 - .18 * t / .32) * (1 + .03 * rng.normal(0, 1, len(t)).cumsum() / 200)
    ph = 2 * np.pi * np.cumsum(f) / SR
    src = np.sign(np.sin(ph)) * .6 + np.sin(2 * ph) * .4
    s = band(src, 900, 1700) + band(src, 2200, 3200) * .5
    return s * np.sin(np.pi * t / .32) ** .6 * amp


def crackle(d, rate, amp=.1):
    out = np.zeros(int(d * SR))
    for at in rng.uniform(0, d, int(d * rate)):
        i, L = int(at * SR), int(rng.uniform(.002, .01) * SR)
        out[i:i + L] += rng.normal(0, 1, len(out[i:i + L])) * np.exp(-np.arange(len(out[i:i + L])) / (L / 4)) * rng.uniform(.3, 1)
    return band(out, 900, 7000) * amp


# ---------------------------------------------------------------- timeline helpers (same maths as scene.html)
G = PROMO['gallop']


def gallop_rate(t):
    for (t0, r0), (t1, r1) in zip(G, G[1:]):
        if t < t1:
            return r0 + (r1 - r0) * max(0, (t - t0)) / (t1 - t0) if t >= t0 else 0
    return 0


def contacts(t0, t1, phase_of, offsets_of, dt=1 / 400):
    """Times at which a leg with a given phase offset touches down (phase crosses k + offset)."""
    out, prev = [], phase_of(t0)
    t = t0 + dt
    while t <= t1:
        cur = phase_of(t)
        for i, off in enumerate(offsets_of(t)):
            if np.floor(cur - off) > np.floor(prev - off):
                out.append((t, i))
        prev, t = cur, t + dt
    return out


gp_cache = {}


def gallop_phase(t):
    key = round(t * 400)
    if key not in gp_cache:
        ph = 0.0
        for (a, r0), (b, r1) in zip(G, G[1:]):
            if t <= a:
                break
            e = min(t, b)
            k = (e - a) / (b - a)
            ph += (e - a) * (r0 + (r0 + (r1 - r0) * k)) / 2
        gp_cache[key] = ph
    return gp_cache[key]


LINES = {l['id']: l for l in PROMO['lines']}
HAMMER = PROMO['hammer']
WALK = PROMO['walk']

# ---------------------------------------------------------------- score
# 0–9: a low drone under the title, a soft bloom when it appears, the page crackling as it burns.
place('strings', bowed(38, 9.5, .16, att=2.5, rel=2.5, bright=.82), 0, pan=-.1, send=.5)
for m in (50, 57, 62, 69):
    place('strings', bowed(m, 2.4, .045, att=.6, rel=2.2, bright=.75), 2.0, pan=(m - 58) / 30, send=.7)
place('tone', glass(86, 3.2, .02), 2.0, pan=.2, send=.8)
for i in range(30):
    place('sfx', band(noise(.06), 2500, 9000) * np.hanning(int(.06 * SR)) * .05, .4 + i * .12 + rng.uniform(0, .08), pan=rng.uniform(-.4, .4), send=.1)
place('sfx', crackle(5.0, 70, .12) * np.minimum(axis(5.0) / .8, 1) * np.clip((5.0 - axis(5.0)) / 1.2, 0, 1), 4.3, pan=.3, send=.2)
place('sfx', low(noise(5.0), 300) * np.sin(np.pi * axis(5.0) / 5.0) * .12, 4.3, pan=.2)

# 9–23: solemn and uneasy: open fifths, a cello line, a slow heartbeat on the frame drum.
place('strings', bowed(38, 14.5, .14, att=3, rel=1.5, bright=.8), 8.6, pan=-.2, send=.4)
place('strings', bowed(45, 14, .09, att=3, rel=1.5, bright=.8), 9.2, pan=.2, send=.4)
place('strings', bowed(52, 6, .05, att=2, rel=1.5, bright=.8), 17.0, pan=.3, send=.5)
for m, at, d in ((57, 10.0, 2.2), (60, 12.2, 1.0), (62, 13.2, 2.4), (65, 15.6, .8), (64, 16.4, .8), (62, 17.2, 1.2), (60, 18.4, .8), (57, 19.2, 3.4)):
    place('strings', bowed(m - 12, d, .11, att=.35, rel=1.0, bright=.86), at, pan=-.25, send=.45)
for i, at in enumerate(np.arange(11.0, 23, 2.0)):
    place('drums', drum(.22 + i * .025, f0=52, decay=4), at, send=.3)
    place('drums', drum(.12 + i * .015, f0=52, decay=5), at + .32, send=.3)

# 23–36: spring and Arthur: warmer chords, the kantele, the war drums that answer his roar.
chords = ((23.4, (50, 57, 62, 65)), (26.0, (53, 57, 60, 65)), (28.5, (48, 55, 60, 64)), (31.0, (50, 57, 62, 65)), (33.5, (43, 55, 59, 62)))
for at, ch in chords:
    for j, m in enumerate(ch):
        place('strings', bowed(m, 2.7, .05, att=.8, rel=1.2, bright=.84), at, pan=-.4 + j * .27, send=.5)
    for k in range(8):
        place('pluck', pluck(ch[k % 4] + 12 + (12 if k in (3, 6) else 0), .07), at + k * .31, pan=.35, send=.35)
for at, big in ((28.6, 0), (29.85, 0), (30.2, 1), (31.45, 0), (32.7, 1), (33.95, 0), (35.2, 0)):
    place('drums', drum(.55 if big else .32, f0=48 if big else 56, decay=3 if big else 4.5), at, send=.4)

# 36–40: the climb into winter: strings rise and are cut off as the raven moves.
for i, m in enumerate((50, 52, 53, 55, 57, 59, 60, 62, 64, 65)):
    place('strings', bowed(m, .55, .05 + i * .006, att=.12, rel=.3, bright=.9), 36.1 + i * .38, pan=-.2 + i * .04, send=.5)
place('strings', bowed(38, 3.9, .12, att=1.5, rel=.05, bright=.85), 36.1, send=.4)

# 40–55: Sinfran: the bows stop; a clear, empty high tone, rising with each beat of the wings.
place('tone', glass(86, 12.8, .045), 40.0, pan=-.2, send=.9)
place('tone', glass(81, 12.8, .035), 40.4, pan=.25, send=.9)
place('tone', glass(89, 5.0, .03), 47.8, pan=0, send=.9)
for at, m in ((44.0, 86), (46.0, 88), (48.0, 93)):
    place('tone', bell(m, .07), at, pan=-.1, send=.8)

# 55–59: warmth gathers and lands on the first hammer blow.
for j, m in enumerate((38, 45, 50, 54, 57)):
    place('strings', bowed(m, 3.6, .07, att=3.2, rel=.08, bright=.86), 55.4, pan=-.3 + j * .15, send=.5)

# 59–87: the forge: restrained major chords, a small kantele tune, drum under every blow.
for at, ch in ((59.0, (50, 54, 57)), (63.0, (43, 55, 59)), (67.0, (50, 57, 62)), (71.0, (45, 52, 61)), (75.0, (47, 54, 62)), (79.0, (43, 55, 62))):
    for j, m in enumerate(ch):
        place('strings', bowed(m, 4.3, .045, att=1.2, rel=1.6, bright=.8), at, pan=-.3 + j * .3, send=.55)
tune = (74, 78, 81, 78, 76, 74, 73, 74, 76, 78, 76, 74)
for k, m in enumerate(tune):
    place('pluck', pluck(m, .06, decay=.8), 67.2 + k * .62, pan=.3, send=.45)
for at in HAMMER:
    place('drums', drum(.5, f0=50, decay=3.5), at, send=.35)

# 87–116: the road: a fiddle tune over the drone, quiet under Havard's words.
BEAT = 60 / 72
melody = ((69, 2), (71, 1), (74, 1), (76, 2), (74, 1), (71, 1), (69, 3), (66, 1), (64, 4),
          (69, 2), (71, 1), (74, 1), (78, 2), (76, 1), (74, 1), (71, 2), (69, 2), (74, 4))
place('strings', bowed(38, 28, .1, att=3, rel=2, bright=.8), 87.5, pan=-.2, send=.4)
place('strings', bowed(45, 28, .07, att=3, rel=2, bright=.8), 88.0, pan=.2, send=.4)
at = 88.0
for m, b in melody:
    place('strings', bowed(m, b * BEAT * .96, .07, att=.15, rel=.5, vib=.006, bright=.9), at, pan=.3, send=.45)
    at += b * BEAT
for k in range(16):
    place('pluck', pluck((50, 55, 50, 57)[k // 4 % 4] + 12, .05), 88.0 + k * 2 * BEAT, pan=-.35, send=.4)
# 116–128: almost nothing: one held note, then only the wind.
place('strings', bowed(69, 8, .03, att=2, rel=2.5, bright=.8), 116.5, pan=.1, send=.7)
place('strings', bowed(74, 7, .022, att=2, rel=2.5, bright=.8), 117.5, pan=-.1, send=.7)

# 128–161: the gallop: drums on every stride, a driving ostinato, a fiddle tune, faster and faster.
beats = [t for t, i in contacts(129.5, 160.65, gallop_phase, lambda t: [0])]
for k, bt in enumerate(beats):
    loud = min(1, .35 + k * .03)
    place('drums', drum(.42 * loud, f0=54, decay=5), bt, send=.25)
    nxt = beats[k + 1] if k + 1 < len(beats) else bt + .43
    if bt > 133.4:
        place('drums', drum(.16 * loud, f0=120, decay=9, skin=.6), (bt + nxt) / 2, pan=.25, send=.2)
    if bt > 131.0:
        place('strings', bowed(38, .2, .09 * loud, short=True, bright=.85), bt, pan=-.3, send=.2)
        place('strings', bowed(45, .2, .07 * loud, short=True, bright=.85), (bt + nxt) / 2, pan=.3, send=.2)
    if 137.2 < bt < 151.2:
        place('strings', bowed(50, .2, .05, short=True, bright=.85), bt + (nxt - bt) * .25, pan=-.1, send=.2)
        place('strings', bowed(57, .2, .05, short=True, bright=.85), bt + (nxt - bt) * .75, pan=.1, send=.2)
    if bt > 156.0:
        for q in (.25, .5, .75):
            place('drums', drum(.12 * loud, f0=70, decay=8, skin=.5), bt + (nxt - bt) * q, pan=-.2, send=.2)
fiddle = ((74, 2), (76, 1), (77, 1), (79, 2), (77, 1), (76, 1), (74, 2), (72, 1), (69, 1), (74, 4),
          (77, 2), (79, 1), (81, 1), (84, 2), (81, 2), (79, 2), (76, 2), (74, 4))
i = next(k for k, b in enumerate(beats) if b > 137.3)
for m, b in fiddle:
    if i + b >= len(beats):
        break
    place('strings', bowed(m, (beats[i + b] - beats[i]) * .95, .085, att=.06, rel=.3, vib=.006, bright=.92), beats[i], pan=.25, send=.4)
    i += b
place('strings', bowed(38, 4.6, .12, att=1.5, rel=.05, bright=.8), 151.0, send=.4)
place('strings', bowed(41, 4.6, .08, att=1.5, rel=.05, bright=.8), 151.2, pan=.2, send=.4)
place('strings', bowed(38, 4.7, .14, att=3, rel=.04, bright=.86), 155.9, send=.4)
place('strings', bowed(50, 4.7, .08, att=3, rel=.04, bright=.86), 155.9, pan=.3, send=.4)
place('drums', drum(.9, f0=44, decay=2.2), 160.6, send=.6)
place('sfx', high(noise(1.6), 3000) * np.exp(-axis(1.6) * 2.5) * .12, 160.6, send=.5)

# 161–169: 文舟: a low, warm chord rings to the end.
for j, m in enumerate((38, 45, 50, 54, 57, 62, 66)):
    place('strings', bowed(m, 5.6, .055, att=1.6, rel=2.0, bright=.8), 161.6 + j * .08, pan=-.45 + j * .15, send=.65)
place('tone', glass(86, 5.5, .02), 162.4, pan=.2, send=.9)
place('sfx', crackle(7.0, 9, .05), 161.8, pan=-.2, send=.3)

# ---------------------------------------------------------------- effects
# distant hooves drawing nearer under shots 2–4
for k, at in enumerate(np.arange(6.5, 23, .5)):
    near = (at - 6.5) / 16.5
    for d in (0, .11, .2):
        place('sfx', low(hoof(.04 + .16 * near ** 1.5), 500 + 1500 * near), at + d, pan=.5 - .3 * near, send=.35)
# Arthur: breathing on the snow, the roar
for at in np.arange(26.8, 28.4, .45):
    place('sfx', band(noise(.35), 300, 1500) * np.sin(np.pi * axis(.35) / .35) * .12, at, pan=-.1)
place('sfx', roar(2.8, .55), 30.15, pan=-.1, send=.5)
# Sinfran: a call, three wing beats, the whiteout and the pass in front of the lens
place('sfx', caw(.16), 42.5, pan=.1, send=.6)
place('sfx', caw(.13), 42.95, pan=.1, send=.6)
for at in (44.0, 46.0, 48.0):
    place('sfx', whoosh(.7, 200, 1600, .35), at - .3, pan=.1, send=.3)
place('sfx', caw(.12), 49.2, pan=-.2, send=.7)
place('sfx', whoosh(1.4, 80, 900, .75), 51.9, pan=0, send=.3)
# snow lit into sparks, the anvil, sparks hissing out
place('sfx', sizzle(3.0, .03), 55.6, pan=.1, send=.4)
for at in HAMMER:
    place('sfx', anvil(.32 if at < 66.3 else .22), at, pan=-.1, send=.45)
    place('sfx', sizzle(.9, .05), at + .02, pan=.2)
place('sfx', sizzle(1.6, .04), 82.35, pan=0, send=.3)
place('sfx', anvil(.12), 81.9, send=.9)
# the walk out of Sakalet: hooves and boots in snow, Pipe snorting
for t, i in contacts(WALK[0], WALK[1], lambda t: (min(t, WALK[1]) - WALK[0]) * WALK[2], lambda t: [0, .5, .25, .75]):
    place('sfx', hoof(.1), t, pan=-.2 + .1 * i, send=.15)
for k in range(int((WALK[1] - WALK[0]) * WALK[2] * 4)):
    place('sfx', crunch(.09), WALK[0] + k / (WALK[2] * 4) + .05, pan=.2, send=.1)
for at in (85.6, 92.6, 104.0, 119.2, 126.6):
    place('sfx', snort(.16), at, pan=-.2, send=.25)
# the embrace: landing in the snow, a few steps, the pats on the back
place('sfx', crunch(.2), 118.4, pan=.1)
place('sfx', hoof(.08), 118.4, pan=.1)
for k in range(4):
    place('sfx', crunch(.08), 118.85 + k * .23, pan=.15)
for at in (122.35, 122.8):
    place('sfx', low(noise(.06), 900) * np.exp(-axis(.06) * 60) * .25, at, pan=.1)
for k in range(4):
    place('sfx', crunch(.07), 127.45 + k * .22, pan=-.1)
place('sfx', crunch(.12), 129.2, pan=-.1)
# the gallop: every hoof, by the same gait maths as the picture
GALLOP_OFF, WALK_OFF = [0, .1, .42, .52], [0, .5, .25, .75]
for t, i in contacts(129.6, 160.6, gallop_phase, lambda t: WALK_OFF if gallop_rate(t) < 1.35 else GALLOP_OFF):
    place('sfx', hoof(.17 if i % 2 == 0 else .13), t, pan=-.15 + .1 * i, send=.12)
    if gallop_rate(t) > 1.35:
        place('sfx', crunch(.05), t + .01, pan=.1)

# wind: a bed under the winter shots, gusting where the storyboard asks for it
wind_pts = [(0, 0), (6, .05), (9, .35), (17, .4), (21.2, .9), (23, 1.0), (24, .25), (26, .08), (36, .1), (38, .3), (40, .4), (44, .55),
            (46, .8), (48, 1.0), (52, .9), (53.5, .5), (55, .35), (57, .1), (59, 0), (83, 0), (86, .25), (98, .3), (116, .3), (120, .45),
            (127.6, .5), (129, .35), (137, .5), (151, .45), (156, .6), (160.6, .55), (161.6, .15), (163, 0), (TOTAL, 0)]
tt = np.arange(N) / SR
wenv = np.interp(tt, *zip(*wind_pts))
gust = 1 + .5 * low(rng.normal(0, 1, N), .6) * 30
for ch, seed in ((0, 1), (1, 2)):
    x = np.random.default_rng(seed).normal(0, 1, N)
    BUS['wind'][:, ch] += (low(x, 420) * .9 + band(x, 900, 2600) * .18 * np.clip(gust, 0, 3)) * wenv * .22

# ---------------------------------------------------------------- voice
voice_mask = np.zeros(N)
for l in PROMO['lines']:
    v, sr = sf.read(HERE / 'voice' / f"{l['id']}.wav", dtype='float64')
    if v.ndim > 1:
        v = v.mean(1)
    v = signal.resample_poly(v, SR, sr)
    gain = 1.25 if l['who'] == 'young' else 1.0
    place('voice', v, l['at'], gain=gain * .9 / max(1e-6, np.max(np.abs(v))), send=.08 if l['who'] != 'young' else .18)
    i = int(l['at'] * SR)
    voice_mask[i:i + len(v)] = 1
# duck everything else under the voice
duck = 1 - .5 * np.convolve(voice_mask, np.ones(int(.25 * SR)) / int(.25 * SR), 'same')

# ---------------------------------------------------------------- mix
mix = np.zeros((N, 2))
levels = {'strings': 1.0, 'pluck': .9, 'drums': 1.0, 'tone': 1.0, 'sfx': .9, 'wind': 1.0, 'voice': 1.0}
strings = BUS['strings']
for ch in range(2):  # a little body resonance on the string bus
    strings[:, ch] = low(strings[:, ch], 5200) + band(strings[:, ch], 220, 420) * .4
for k, b in BUS.items():
    mix += b * levels[k] * (duck[:, None] if k != 'voice' else 1)
ir_t = axis(3.2)
ir = [np.random.default_rng(s).normal(0, 1, len(ir_t)) * np.exp(-ir_t * 2.1) for s in (5, 6)]
ir = [low(x, 6000) for x in ir]
for ch in range(2):
    mix[:, ch] += signal.fftconvolve(SEND, ir[ch])[:N] * (.32 / np.sqrt(np.sum(ir[ch] ** 2)))
fade = np.clip((TOTAL - .6 - tt) / 1.0, 0, 1) * np.minimum(tt / .05, 1)
mix *= fade[:, None]
mix = high(mix.T, 28).T
peak = np.max(np.abs(mix))
mix = np.tanh(mix / peak * 1.25) / np.tanh(1.25) * .93
sf.write(HERE / 'soundtrack.wav', mix.astype(np.float32), SR, subtype='PCM_16')
print(f'soundtrack.wav  {TOTAL:.1f} s  peak {np.max(np.abs(mix)):.2f}')
