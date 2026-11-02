#!/usr/bin/env python3
"""Records the tour narration with ElevenLabs, one mp3 per tour stop, into ./clips/.

    ELEVENLABS_API_KEY=... python3 make_narration.py            # every missing clip
    ELEVENLABS_API_KEY=... python3 make_narration.py sputnik1   # just these (re-records them)

Reads script.json next to this file. The key is read from the environment only and never printed or saved.
Already-recorded clips are skipped, so a failed run can be re-run.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
VOICE = 'pqHfZKP75CvOlQylNhV4'  # Bill, ElevenLabs premade
URL = f'https://api.elevenlabs.io/v1/text-to-speech/{VOICE}?output_format=mp3_44100_192'
SETTINGS = {'stability': 0.5, 'similarity_boost': 0.75, 'style': 0.25, 'use_speaker_boost': True}

key = os.environ.get('ELEVENLABS_API_KEY', '').strip()
if not key:
    sys.exit('ELEVENLABS_API_KEY is not set')
script = json.load(open(os.path.join(HERE, 'script.json'), encoding='utf-8'))
only = set(sys.argv[1:])
out = os.path.join(HERE, 'clips')
os.makedirs(out, exist_ok=True)
say = [s.get('say', s['text']) for s in script]

# clips are named by their place in the script; when lines are added, renumber the ones already recorded
have = {f.split('-', 1)[1][:-4]: f for f in os.listdir(out) if f.endswith('.mp3') and '-' in f}
for i, s in enumerate(script):
    want = f"{i + 1:02d}-{s['key']}.mp3"
    if s['key'] in have and have[s['key']] != want:
        os.rename(os.path.join(out, have[s['key']]), os.path.join(out, want + '.tmp'))
for f in os.listdir(out):
    if f.endswith('.mp3.tmp'):
        os.rename(os.path.join(out, f), os.path.join(out, f[:-4]))

done = failed = 0
for i, s in enumerate(script):
    path = os.path.join(out, f"{i + 1:02d}-{s['key']}.mp3")
    if only and s['key'] not in only:
        continue
    if not only and os.path.exists(path) and os.path.getsize(path) > 1000:
        continue
    body = {
        'text': say[i],
        'model_id': 'eleven_multilingual_v2',
        'voice_settings': SETTINGS,
        'seed': 1957,
        'previous_text': say[i - 1] if i else None,
        'next_text': say[i + 1] if i + 1 < len(say) else None,
    }
    body = {k: v for k, v in body.items() if v is not None}
    req = urllib.request.Request(URL, data=json.dumps(body).encode(), method='POST',
                                 headers={'xi-api-key': key, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg'})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                audio = r.read()
            open(path, 'wb').write(audio)
            print(f'{os.path.basename(path)}  {len(audio) // 1024} KB')
            done += 1
            break
        except urllib.error.HTTPError as e:
            msg = e.read()[:300].decode('utf-8', 'replace')
            print(f"{s['key']}: HTTP {e.code} {msg}")
            if e.code in (429, 500, 502, 503) and attempt < 3:
                time.sleep(5 * (attempt + 1))
                continue
            failed += 1
            break
        except Exception as e:  # network hiccup
            print(f"{s['key']}: {type(e).__name__} {e}")
            if attempt < 3:
                time.sleep(5 * (attempt + 1))
                continue
            failed += 1
            break
print(f'recorded {done}, failed {failed}, clips in {out}')
