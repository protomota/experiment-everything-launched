// Mixes the narration track from the clips and narration timing.json (made by tools/narrate.mjs in the project):
//   node mix.mjs <clips dir> [timing.json] [out.wav]
// Each clip starts at its cue; the track runs the length of the tour, levelled for YouTube (about -16 LUFS).
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const dir = process.argv[2] || 'clips';
const {cues, total} = JSON.parse(fs.readFileSync(process.argv[3] || 'timing.json', 'utf8'));
const out = process.argv[4] || 'narration.wav';
const files = Object.fromEntries(fs.readdirSync(dir).filter((f) => /^\d+-\w+\.mp3$/.test(f)).map((f) => [f.replace(/^\d+-|\.mp3$/g, ''), path.join(dir, f)]));
const missing = cues.filter((c) => !files[c.key]).map((c) => c.key);
if (missing.length) throw new Error(`no clip for ${missing.join(', ')}`);
const args = ['-y', '-loglevel', 'error'];
for (const c of cues) args.push('-i', files[c.key]);
const parts = cues.map((c, i) => `[${i}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${Math.round(c.at * 1000)}:all=1[a${i}]`);
const mix = `${cues.map((_, i) => `[a${i}]`).join('')}amix=inputs=${cues.length}:normalize=0:dropout_transition=0,apad=whole_dur=${total.toFixed(3)},atrim=0:${total.toFixed(3)},loudnorm=I=-16:TP=-1.5:LRA=11[out]`;
args.push('-filter_complex', [...parts, mix].join(';'), '-map', '[out]', '-ar', '48000', '-c:a', 'pcm_s16le', out);
execFileSync('ffmpeg', args, {stdio: 'inherit'});
console.log(out, (fs.statSync(out).size / 1e6).toFixed(1), 'MB,', (total / 60).toFixed(1), 'min');
