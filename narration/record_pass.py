#!/usr/bin/env python3
"""Records the whole narration in one pass, in script order, into a new folder, so every line comes from the same
session and reads as one performance. Never mix these clips with an earlier pass, and never splice a re-recorded
line into a pass: when any line changes, record the whole pass again.

    ELEVENLABS_API_KEY=... python3 record_pass.py clips-pass4
    ELEVENLABS_API_KEY=... python3 record_pass.py clips-social-pass1 script-social.json   (the 5-minute cut's own pass)

Each line is its own request, stitched to the lines before it (previous_request_ids, the last three) and given the
next line as context (next_text). Uses the with-timestamps endpoint and saves NN-key.json beside each NN-key.mp3 with
the character alignment and request id (tools/narrate.mjs syncs the finale's pictures to the words with it).
If the run stops part way, run the same command again within two hours: it carries on from the last saved line,
still stitched to it. Reads script.json next to this file, or the script named after the folder. The key is read from the environment only and never
printed or saved.
"""
import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
VOICE = 'pqHfZKP75CvOlQylNhV4'  # Bill, ElevenLabs premade
MODEL = 'eleven_multilingual_v2'
SETTINGS = {'stability': 0.5, 'similarity_boost': 0.75, 'style': 0.25, 'use_speaker_boost': True}
URL = f'https://api.elevenlabs.io/v1/text-to-speech/{VOICE}/with-timestamps?output_format=mp3_44100_192'

key = os.environ.get('ELEVENLABS_API_KEY', '').strip()
if not key:
    sys.exit('ELEVENLABS_API_KEY is not set')
if len(sys.argv) < 2:
    sys.exit('usage: record_pass.py <new folder> [script.json]')
out = os.path.join(HERE, sys.argv[1])
os.makedirs(out, exist_ok=True)
script = json.load(open(os.path.join(HERE, sys.argv[2] if len(sys.argv) > 2 else 'script.json'), encoding='utf-8'))
say = [s.get('say', s['text']) for s in script]

req = urllib.request.Request('https://api.elevenlabs.io/v1/user/subscription', headers={'xi-api-key': key})
with urllib.request.urlopen(req, timeout=60) as r:
    sub = json.load(r)
need = sum(len(x) for x in say)
left = sub.get('character_limit', 0) - sub.get('character_count', 0)
print(f'this pass uses about {need} characters; {left} left this period')
if left < need:
    sys.exit('not enough characters left for a whole pass')

ids = []
t_start = time.time()
for i, s in enumerate(script):
    base = os.path.join(out, f"{i + 1:02d}-{s['key']}")
    if os.path.exists(base + '.json') and os.path.exists(base + '.mp3'):
        meta = json.load(open(base + '.json', encoding='utf-8'))
        if meta.get('text') == say[i] and time.time() - meta.get('at', 0) < 6600:
            ids.append(meta['request_id'])
            continue
        if meta.get('text') == say[i]:
            sys.exit(f'{base}.json is over two hours old: stitching would break, so record the whole pass into a new folder')
        sys.exit(f'{base}.json was recorded from different text: record the whole pass into a new folder')
    body = {'text': say[i], 'model_id': MODEL, 'voice_settings': SETTINGS, 'seed': 1957}
    if ids:
        body['previous_request_ids'] = ids[-3:]
    if i + 1 < len(say):
        body['next_text'] = say[i + 1]
    data = json.dumps(body).encode()
    for attempt in range(4):
        try:
            req = urllib.request.Request(URL, data=data, method='POST', headers={'xi-api-key': key, 'Content-Type': 'application/json'})
            with urllib.request.urlopen(req, timeout=180) as r:
                rid = r.headers.get('request-id')
                res = json.load(r)
            break
        except urllib.error.HTTPError as e:
            msg = e.read()[:300].decode('utf-8', 'replace')
            print(f"{s['key']}: HTTP {e.code} {msg}")
            if e.code in (429, 500, 502, 503) and attempt < 3:
                time.sleep(5 * (attempt + 1))
                continue
            sys.exit('stopped; run again to carry on from this line')
        except Exception as e:  # network hiccup
            print(f"{s['key']}: {type(e).__name__} {e}")
            if attempt < 3:
                time.sleep(5 * (attempt + 1))
                continue
            sys.exit('stopped; run again to carry on from this line')
    if not rid:
        sys.exit('no request-id came back, so the lines could not be stitched; stopping')
    audio = base64.b64decode(res['audio_base64'])
    open(base + '.mp3', 'wb').write(audio)
    json.dump({'key': s['key'], 'text': say[i], 'request_id': rid, 'at': time.time(), 'model': MODEL, 'voice': VOICE,
               'settings': SETTINGS, 'seed': 1957, 'previous_request_ids': body.get('previous_request_ids', []),
               'alignment': res.get('alignment')}, open(base + '.json', 'w', encoding='utf-8'))
    ids.append(rid)
    print(f"{i + 1:02d}/{len(script)} {s['key']}  {len(audio) // 1024} KB")
print(f'pass complete: {len(script)} lines in {out} ({(time.time() - t_start) / 60:.1f} min)')
