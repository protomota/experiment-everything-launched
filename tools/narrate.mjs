// Fits the tour to its narration and builds the narration track for the video.
//   node tools/narrate.mjs <clips dir>      clips named NN-<beat key>.mp3, one per tour beat (narration/script.json)
// Writes narration/timing.json (each beat's length and the gap, read by NARR=narration/timing.json node build.mjs) and
// narration/narration.wav, the voice placed at each beat's start, as long as the whole tour.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';

const dir = process.argv[2] || 'narration/clips';
const LEAD = 0.2; // the voice starts this long into a beat, as the card slides in
const LEAD_FIRST = 0.6;
const TAIL = 0.3; // and the beat holds this long after the last word
const GAP = Number(process.env.GAP || 1.2); // between beats (the page's own tour uses 1.5); build.mjs passes it to src/tour.js
// a shorter cut: KEYS=sputnik1,vostok1,... NAME=social GAP=2 node tools/narrate.mjs narration/clips
//   -> narration/timing-social.json and narration/narration-social.wav, with only those beats, in that order
//   (SCRIPT=narration/script-social.json when the cut has lines of its own, recorded as a pass of their own)
const KEYS = process.env.KEYS ? process.env.KEYS.split(',') : null;
const NAME = process.env.NAME ? `-${process.env.NAME}` : '';
// the shortest a beat can be, whatever its line: breakups need time for the collision and the cloud to spread
const MIN = {ship: 6, breakup: 11, today: 6, stats: 10, lineup: 10, open: 6, close: 6};
// except the finale, which holds on the globe for a few seconds after its last word (as does the 5-minute cut's last
// line; its lineup comes first, and the row runs off and the globe comes back in those seconds)
const HOLD_AFTER = {lineup: 4.5, close: 4.5};
// the finale's pictures follow the words of its line: narration/script.json "marks" are found in each clip's
// character alignment (NN-key.json beside the mp3, saved by make_narration.py), or estimated from where they fall in
// the text when a clip has none
const SCRIPT = Object.fromEntries(JSON.parse(fs.readFileSync(process.env.SCRIPT || 'narration/script.json', 'utf8')).map((s) => [s.key, s]));

const PLAN = [...fs.readFileSync('src/tour.js', 'utf8').matchAll(/\['(ship|breakup|today|stats|lineup|open|close)', '(\w+)', ([\d.]+)\]/g)]
  .map(([, kind, key, dur]) => ({kind, key, dur: Number(dur)}));
const plan = KEYS
  ? KEYS.map((k) => PLAN.find((b) => b.key === k) || (() => { throw new Error(`no beat ${k} in src/tour.js`); })())
  : PLAN.filter((b) => b.kind !== 'open' && b.kind !== 'close');
const clips = Object.fromEntries(fs.readdirSync(dir).filter((f) => /^\d+-\w+\.mp3$/.test(f)).map((f) => [f.replace(/^\d+-|\.mp3$/g, ''), path.join(dir, f)]));
const missing = plan.filter((b) => !clips[b.key]).map((b) => b.key);
if (missing.length) throw new Error(`no clip for ${missing.join(', ')}`);

const length = (file) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString());
// where the speaking stops: the clips end with up to a second or so of quiet, which shouldn't count as narration
const speechEnd = (file, len) => {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-i', file, '-af', 'silencedetect=n=-40dB:d=0.15', '-f', 'null', '-']).stderr.toString();
  const starts = [...r.matchAll(/silence_start: ([\d.]+)/g)].map((m) => Number(m[1]));
  const ends = [...r.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]));
  const lastStart = starts[starts.length - 1];
  // a silence still running at the end of the file has a start and no end, or ends at the very end
  if (lastStart !== undefined && (ends.length < starts.length || ends[ends.length - 1] >= len - 0.05)) return lastStart;
  return len;
};
let t = 0;
const dur = {};
const cues = [];
for (const [i, b] of plan.entries()) {
  const lead = i === 0 ? LEAD_FIRST : LEAD;
  const len = length(clips[b.key]);
  const talk = speechEnd(clips[b.key], len);
  const d = Math.max(Math.min(b.dur, MIN[b.kind]), Math.round((lead + talk + (HOLD_AFTER[b.kind] || TAIL)) * 10) / 10);
  dur[b.key] = d;
  cues.push({key: b.key, at: Math.round((t + lead) * 1000) / 1000, len: Math.round(len * 100) / 100, talk: Math.round(talk * 100) / 100, a: t, b: t + d});
  t += d + GAP;
}
const total = t - GAP;
// the finale's marks, in seconds from the lineup beat's start
const finale = (() => {
  const c = cues.find((x) => x.key === 'lineup');
  const line = SCRIPT.lineup;
  if (!c || !line || !line.marks) return null;
  const say = line.say || line.text;
  const aj = clips.lineup.replace(/\.mp3$/, '.json');
  const al = fs.existsSync(aj) ? JSON.parse(fs.readFileSync(aj, 'utf8')).alignment : null;
  if (al && al.characters.join('') !== say) console.warn('lineup alignment text differs from script.json; marks may drift');
  const lead = c.at - c.a;
  let from = 0;
  const F = {rise: [], carry: 0, stops: [], globe: [0, 0]};
  for (const [phrase, what, v] of line.marks) {
    const i = say.indexOf(phrase, from);
    if (i < 0) throw new Error(`finale mark not in the lineup line: ${phrase}`);
    from = i;
    const t = (j) => Math.round((lead + (al ? al.character_start_times_seconds[j] : (c.talk * j) / say.length)) * 100) / 100;
    const at = t(i);
    if (what === 'rise') F.rise.push([at, v]);
    // a ship the words name: [when its words start, when they end, ship]; src/tour.js plans the row of ships from these
    // and when the words about it end: the sentence's end if it ends before the next ship is named, else the last
    // comma before the next ship (so "the first people in orbit," runs to "orbit"), else the end of the name itself
    else if (what === 'pass') {
      const nx = line.marks.slice(line.marks.findIndex((m) => m[0] === phrase) + 1).find(([, w]) => w === 'pass' || w === 'globe');
      const j = nx ? say.indexOf(nx[0], i + phrase.length) : say.length;
      const span = say.slice(i, j);
      const name = phrase.replace(/ and$/, ''); // "Explorer and" only marks where Explorer is named: its words end at "Explorer"
      let e = span.indexOf('.', name.length - 1);
      if (e < 0) e = span.lastIndexOf(',');
      const tEnd = (k) => Math.round((lead + (al ? al.character_end_times_seconds[k] : (c.talk * (k + 1)) / say.length)) * 100) / 100;
      const said = e > 0 ? tEnd(i + e - 1) : tEnd(i + name.length - 1);
      F.stops.push([at, t(i + name.length - 1), v, Math.max(said, t(i + name.length - 1))]);
    }
    else if (what === 'carry') F.carry = at;
    else if (what === 'globe') F.globe[0] = at;
    else if (what === 'all') F.globe[1] = at;
  }
  console.log(`finale marks from ${al ? 'the alignment' : 'an estimate (no alignment saved)'}: carry ${F.carry} s, ${F.stops.length} named ships ${F.stops[0][0]}-${F.stops[F.stops.length - 1][1]} s, globe ${F.globe.join('-')} s of ${dur.lineup} s`);
  return F;
})();
fs.writeFileSync(`narration/timing${NAME}.json`, JSON.stringify({dur, gap: GAP, cues, total, finale, ...(KEYS ? {order: KEYS} : {})}, null, 1));
const pauses = cues.slice(1).map((c, i) => c.at - (cues[i].at + cues[i].talk));
console.log(`pauses between lines: median ${pauses.sort((x, y) => x - y)[pauses.length >> 1].toFixed(2)} s, longest ${pauses[pauses.length - 1].toFixed(2)} s`);
console.log(`${plan.length} beats, tour ${(total / 60).toFixed(1)} min (${total.toFixed(1)} s); narration ${(cues.reduce((a, c) => a + c.len, 0) / 60).toFixed(1)} min`);

// place every clip at its cue and mix them into one track, levelled for YouTube (about -16 LUFS)
// (NOMIX=1 skips it: the render kit mixes its own track from the same clips and timing)
if (process.env.NOMIX) process.exit(0);
const args = ['-y', '-loglevel', 'error'];
for (const c of cues) args.push('-i', clips[c.key]);
const parts = cues.map((c, i) => `[${i}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${Math.round(c.at * 1000)}:all=1[a${i}]`);
const mix = `${cues.map((_, i) => `[a${i}]`).join('')}amix=inputs=${cues.length}:normalize=0:dropout_transition=0,apad=whole_dur=${total.toFixed(3)},atrim=0:${total.toFixed(3)},loudnorm=I=-16:TP=-1.5:LRA=11[out]`;
args.push('-filter_complex', [...parts, mix].join(';'), '-map', '[out]', '-ar', '48000', '-c:a', 'pcm_s16le', `narration/narration${NAME}.wav`);
execFileSync('ffmpeg', args, {stdio: 'inherit'});
console.log(`narration/narration${NAME}.wav`, (fs.statSync(`narration/narration${NAME}.wav`).size / 1e6).toFixed(1), 'MB');
