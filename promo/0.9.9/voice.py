"""English voice-over for the 文舟 0.9.9 promo, synthesised locally with Kokoro-82M (Apache-2.0).
The model and voices come from npm (kokoro-q8-shards, kokoro-local-runtime) and are cached in dist/promo/kokoro.
Each line of lines.js becomes voice/<id>.wav; a line too long for its slot is re-read slightly faster.
Usage: python3 promo/0.9.9/voice.py      (needs: pip install kokoro-onnx soundfile; npm on PATH)"""
import json, os, pathlib, subprocess, tarfile, glob
import numpy as np, soundfile as sf
from kokoro_onnx import Kokoro

HERE = pathlib.Path(__file__).resolve().parent
CACHE = HERE.parents[1] / 'dist' / 'promo' / 'kokoro'
PROMO = json.loads((HERE / 'lines.js').read_text('utf-8').split('\nwindow.PROMO=', 1)[1].strip().rstrip(';'))


def fetch(package):
    target = CACHE / package.split('@')[0]
    if not target.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        name = subprocess.run(['npm', 'pack', package, '--silent'], cwd=CACHE, check=True, capture_output=True, text=True, shell=os.name == 'nt').stdout.strip().splitlines()[-1]
        with tarfile.open(CACHE / name) as tar:
            tar.extractall(target, filter='data')
    return target / 'package'


def model():
    onnx, voices = CACHE / 'kokoro-q8.onnx', CACHE / 'voices.npz'
    if not onnx.exists():
        shards = fetch('kokoro-q8-shards@1.0.0')
        onnx.write_bytes(b''.join((shards / f'kokoro-q8.part{i}.bin').read_bytes() for i in range(6)))
    if not voices.exists():
        files = glob.glob(str(fetch('kokoro-local-runtime@0.1.0') / 'voices' / '*.bin'))
        np.savez(voices, **{pathlib.Path(f).stem: np.fromfile(f, dtype=np.float32).reshape(-1, 1, 256) for f in files})
    return Kokoro(str(onnx), str(voices))


def trim(audio, sr):
    # Drop the leading/trailing near-silence Kokoro leaves, keeping 40 ms of air.
    loud = np.flatnonzero(np.abs(audio) > 0.01)
    if not len(loud):
        return audio
    pad = int(0.04 * sr)
    return audio[max(0, loud[0] - pad):loud[-1] + pad]


kokoro = model()
(HERE / 'voice').mkdir(exist_ok=True)
timing = {}
for line in PROMO['lines']:
    cast = PROMO['voices'][line['who']]
    slot, speed = line['end'] - line['at'], cast['speed']
    for _ in range(6):
        audio, sr = kokoro.create(line['en'], voice=cast['voice'], speed=speed, lang=cast['lang'])
        audio = trim(audio, sr)
        if len(audio) / sr <= slot - 0.2:
            break
        speed = round(speed * 1.05, 3)
    sf.write(HERE / 'voice' / f"{line['id']}.wav", audio, sr, subtype='PCM_16')
    timing[line['id']] = round(len(audio) / sr, 3)
    print(f"{line['id']} {cast['name']:5} {cast['voice']:9} speed {speed:.2f}  {len(audio) / sr:5.2f} s / slot {slot:.1f} s")
# scene.html times subtitles and cue words (map markers) from these lengths.
(HERE / 'voice' / 'timing.js').write_text('window.VOICE_TIMING=' + json.dumps(timing) + ';\n', 'utf-8')
