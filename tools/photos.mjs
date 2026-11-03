// Times the video's archive photos to the narration and packs them for build.mjs.
//   node tools/photos.mjs <photos.json> <timing.json> <clips dir> <out.json>
// photos.json lists {key, from, to?, img, caption, credit, pos?, crop?} (pos: the crop's focus, as CSS object-position;
// crop: [x, y, w, h] as fractions of the source, cut out first, for a subject too small in the whole picture): the photo comes up as the beat's line says `from` and
// goes as it finishes saying `to` (or just before the beat ends). Times come from each clip's character alignment
// (NN-key.json beside the mp3). Each image is scaled to 1240 px on its long side (a 620 px print at 4K) and inlined.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import os from 'node:os';

const [specFile, timingFile, clipsDir, outFile] = process.argv.slice(2);
const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));
const timing = JSON.parse(fs.readFileSync(timingFile, 'utf8'));
const cue = Object.fromEntries(timing.cues.map((c) => [c.key, c]));
const align = (key) => {
  const f = fs.readdirSync(clipsDir).find((n) => n.replace(/^\d+-|\.json$/g, '') === key && n.endsWith('.json'));
  const a = JSON.parse(fs.readFileSync(path.join(clipsDir, f), 'utf8')).alignment;
  return {text: a.characters.join(''), start: a.character_start_times_seconds, end: a.character_end_times_seconds};
};
const imgDir = path.dirname(specFile);
const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'photos-'));

const out = spec.map((ph) => {
  const c = cue[ph.key];
  if (!c) return null; // this cut has no such beat
  const al = align(ph.key);
  const i = al.text.indexOf(ph.from);
  if (i < 0) throw new Error(`"${ph.from}" not in the ${ph.key} line`);
  const a = c.at + al.start[i] - 0.25;
  let b = c.b - 0.7;
  if (ph.to) {
    const j = al.text.indexOf(ph.to);
    if (j < 0) throw new Error(`"${ph.to}" not in the ${ph.key} line`);
    b = Math.min(b, c.at + al.end[j + ph.to.length - 1] + 0.5);
  }
  const src = path.join(imgDir, ph.img);
  const scaled = path.join(tmp, `${path.basename(ph.img, path.extname(ph.img))}.jpg`);
  const cut = ph.crop ? `crop=iw*${ph.crop[2]}:ih*${ph.crop[3]}:iw*${ph.crop[0]}:ih*${ph.crop[1]},` : '';
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-vf', `${cut}scale='if(gt(iw,ih),min(1240,iw),-2)':'if(gt(iw,ih),-2,min(1240,ih))':flags=lanczos`, '-q:v', '3', scaled]);
  const [w, h] = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', scaled]).toString().trim().split(',').map(Number);
  return {key: ph.key, a: +a.toFixed(3), b: +b.toFixed(3), ar: +(w / h).toFixed(4), caption: ph.caption, credit: ph.credit, pos: ph.pos,
    src: `data:image/jpeg;base64,${fs.readFileSync(scaled).toString('base64')}`};
}).filter(Boolean);
fs.writeFileSync(outFile, JSON.stringify(out));
fs.rmSync(tmp, {recursive: true});
for (const p of out) console.log(`${p.key.padEnd(12)} ${p.a.toFixed(2)} to ${p.b.toFixed(2)}  ${p.caption}`);
