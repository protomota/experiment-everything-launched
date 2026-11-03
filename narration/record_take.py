#!/usr/bin/env python3
"""Records a whole cut's narration as one take: a single request for every line, so it is one performance with one
voice all the way through (Brad, 3 Nov: lines recorded as separate requests, even stitched, sounded like two speakers).
It fits when the script is under ElevenLabs' 10,000 characters. The take is then cut into a clip per line, NN-key.mp3
and NN-key.json (that line's character alignment), the same files record_pass.py makes, for tools/narrate.mjs. Each
clip runs from just before its first word to just after its last, so the breaths between lines are left out.

    ELEVENLABS_API_KEY=... python3 record_take.py clips-social-take1 script-social-v5.json

A longer script (the full film) goes in as few long requests as fit, split where a new part starts at the keys given,
each stitched to the one before (previous_request_ids) and told how the next begins (next_text), so the voice carries
on from where the last part left off. Run it again within two hours if it stops part way: it carries on from the last
saved part, still stitched to it.

    ELEVENLABS_API_KEY=... python3 record_take.py clips-v5-take1 script-v5.json aryabhata,falcon1

The take and its alignment are kept as take.mp3 and take.json in the folder (take-1, take-2... when in parts). The key
is read from the environment only and never printed or saved. With every part saved, it only cuts the clips again (no
key needed), for a script whose lines are split differently over the same words: two lines joined into one, say.
"""
import base64
import json
import os
import subprocess
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
VOICE = 'pqHfZKP75CvOlQylNhV4'  # Bill, ElevenLabs premade
MODEL = 'eleven_multilingual_v2'
SETTINGS = {'stability': 0.5, 'similarity_boost': 0.75, 'style': 0.25, 'use_speaker_boost': True}
URL = f'https://api.elevenlabs.io/v1/text-to-speech/{VOICE}/with-timestamps?output_format=mp3_44100_192'
SEP = '\n\n'
LEAD = 0.06  # a clip starts this long before its first word
TAIL = 0.35  # and ends this long after its last (or halfway to the next line, if that is sooner)
NEXT = 400  # characters of the next part passed as next_text

key = os.environ.get('ELEVENLABS_API_KEY', '').strip()
if len(sys.argv) < 3:
    sys.exit(__doc__)
out = os.path.join(HERE, sys.argv[1])
script = json.load(open(os.path.join(HERE, sys.argv[2]), encoding='utf-8'))
breaks = sys.argv[3].split(',') if len(sys.argv) > 3 else []
keys = [s['key'] for s in script]
for b in breaks:
    if b not in keys:
        sys.exit(f'no line {b} in the script')
starts = [0] + [keys.index(b) for b in breaks]
parts = [script[a:b] for a, b in zip(starts, starts[1:] + [len(script)])]
os.makedirs(out, exist_ok=True)


def say_of(lines):
    return [s.get('say', s['text']) for s in lines]


def record(text, prev_id, next_text):
    body = {'text': text, 'model_id': MODEL, 'voice_settings': SETTINGS, 'seed': 1957}
    if prev_id:
        body['previous_request_ids'] = [prev_id]
    if next_text:
        body['next_text'] = next_text
    req = urllib.request.Request(URL, data=json.dumps(body).encode(), headers={'xi-api-key': key, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=900) as r:
        request_id = r.headers.get('request-id')
        res = json.load(r)
    return res, request_id


def cut(lines, take_mp3, al, first_clip):
    chars, t0s, t1s = al['characters'], al['character_start_times_seconds'], al['character_end_times_seconds']
    say = say_of(lines)
    spans = []
    pos = 0
    for s in say:
        a, b = pos, pos + len(s)
        first = next(i for i in range(a, b) if not chars[i].isspace())
        last = next(i for i in range(b - 1, a - 1, -1) if not chars[i].isspace())
        spans.append((a, b, first, last))
        pos = b + len(SEP)
    for n, (line, (a, b, first, last)) in enumerate(zip(lines, spans)):
        start = max(0.0, t0s[first] - LEAD)
        end = t1s[last] + TAIL
        if n + 1 < len(spans):
            end = min(end, (t1s[last] + t0s[spans[n + 1][2]]) / 2)
        if n > 0:
            start = max(start, (t1s[spans[n - 1][3]] + t0s[first]) / 2)
        name = f'{first_clip + n:02d}-{line["key"]}'
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', take_mp3, '-ss', f'{start:.3f}', '-to', f'{end:.3f}',
                        '-c:a', 'libmp3lame', '-b:a', '192k', os.path.join(out, f'{name}.mp3')], check=True)
        sub = {'characters': chars[a:b], 'character_start_times_seconds': [round(x - start, 3) for x in t0s[a:b]],
               'character_end_times_seconds': [round(x - start, 3) for x in t1s[a:b]]}
        json.dump({'key': line['key'], 'text': line['text'], 'take': [os.path.basename(take_mp3), round(start, 3), round(end, 3)],
                   'alignment': sub}, open(os.path.join(out, f'{name}.json'), 'w'))
        print(f'{name:18} {start:7.2f} to {end:7.2f}')


prev_id = None
clip = 1
for p, lines in enumerate(parts):
    text = SEP.join(say_of(lines))
    if len(text) > 10000:
        sys.exit(f'part {p + 1} is {len(text)} characters: split it at another line')
    stem = 'take' if len(parts) == 1 else f'take-{p + 1}'
    take_json = os.path.join(out, f'{stem}.json')
    take_mp3 = os.path.join(out, f'{stem}.mp3')
    if os.path.exists(take_json):
        saved = json.load(open(take_json))
    else:
        if not key:
            sys.exit(__doc__)
        next_text = SEP.join(say_of(parts[p + 1]))[:NEXT] if p + 1 < len(parts) else None
        res, request_id = record(text, prev_id, next_text)
        open(take_mp3, 'wb').write(base64.b64decode(res['audio_base64']))
        saved = {'text': text, 'model': MODEL, 'voice': VOICE, 'settings': SETTINGS, 'seed': 1957,
                 'request_id': request_id, 'previous_request_id': prev_id, 'alignment': res['alignment']}
        json.dump(saved, open(take_json, 'w'))
    prev_id = saved.get('request_id')
    al = saved['alignment']
    if ''.join(al['characters']) != text:
        sys.exit(f'the alignment of {stem} does not match its text')
    print(f'{stem}: {len(text)} characters, {len(lines)} lines')
    cut(lines, take_mp3, al, clip)
    clip += len(lines)
print(f'{len(script)} lines in {out}')
