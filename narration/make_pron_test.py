#!/usr/bin/env python3
"""Pronunciation test for "debris": one sentence, several spellings, as standalone auditions in ./pron/.

    ELEVENLABS_API_KEY=... python3 make_pron_test.py

Same voice, model and settings as make_narration.py. Also prints the account's remaining characters and whether the
with-timestamps endpoint returns a request-id header (needed for request stitching in the full pass).
The key is read from the environment only and never printed or saved.
"""
import base64
import json
import os
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
VOICE = 'pqHfZKP75CvOlQylNhV4'  # Bill, ElevenLabs premade
SETTINGS = {'stability': 0.5, 'similarity_boost': 0.75, 'style': 0.25, 'use_speaker_boost': True}
SENTENCE = 'More than fourteen thousand of the objects in orbit are spent rocket stages, parts thrown off during launches, and {} from explosions and collisions.'
SPELLINGS = ['debris', 'duh-BREE', 'duhbree', 'deh-BREE', 'dih-BREE', 'de-bree', 'duh bree', 'debree']

key = os.environ.get('ELEVENLABS_API_KEY', '').strip()
if not key:
    sys.exit('ELEVENLABS_API_KEY is not set')

req = urllib.request.Request('https://api.elevenlabs.io/v1/user/subscription', headers={'xi-api-key': key})
with urllib.request.urlopen(req, timeout=60) as r:
    sub = json.load(r)
print(f"characters used {sub.get('character_count')} of {sub.get('character_limit')}, tier {sub.get('tier')}")

out = os.path.join(HERE, 'pron')
os.makedirs(out, exist_ok=True)
for i, word in enumerate(SPELLINGS, 1):
    body = {'text': SENTENCE.format(word), 'model_id': 'eleven_multilingual_v2', 'voice_settings': SETTINGS, 'seed': 1957}
    url = f'https://api.elevenlabs.io/v1/text-to-speech/{VOICE}/with-timestamps?output_format=mp3_44100_192'
    req = urllib.request.Request(url, data=json.dumps(body).encode(), method='POST',
                                 headers={'xi-api-key': key, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=120) as r:
        rid = r.headers.get('request-id')
        res = json.load(r)
    name = f"debris-{i}-{word.replace(' ', '_')}.mp3"
    open(os.path.join(out, name), 'wb').write(base64.b64decode(res['audio_base64']))
    print(f"{name}  request-id header: {'yes' if rid else 'no'}  alignment: {'yes' if res.get('alignment') else 'no'}")
print('clips in', out)
