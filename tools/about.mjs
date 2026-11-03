// Times the video's intro (the about beat, src/about.js) to the words of its line and picks the catalog rows it shows.
//   node tools/about.mjs <timing.json> <clips dir> <out.json>
// The cues are where the line says each part, in tour seconds; the rows are real catalog entries in launch order,
// each with its year (and its place among that year's launches standing in for the date).
import fs from 'node:fs';
import path from 'node:path';

const [timingFile, clipsDir, outFile] = process.argv.slice(2);
const PHRASES = {title: 'This is', proto: 'an experiment', gcat: 'Gee Cat', kept: 'kept by', launch: 'Every launch', debris: 'Every piece', who: 'And who', film: 'This film'};

const timing = JSON.parse(fs.readFileSync(timingFile, 'utf8'));
const cue = timing.cues.find((c) => c.key === 'about');
const clip = fs.readdirSync(clipsDir).find((n) => /^\d+-about\.json$/.test(n));
const a = JSON.parse(fs.readFileSync(path.join(clipsDir, clip), 'utf8')).alignment;
const text = a.characters.join('');
const cues = Object.fromEntries(Object.entries(PHRASES).map(([k, p]) => {
  const i = text.indexOf(p);
  if (i < 0) throw new Error(`"${p}" not in the about line`);
  return [k, +(cue.at + a.character_start_times_seconds[i]).toFixed(3)];
}));

// launch order from the international designator: 1963-050C is the 50th launch of 1963; before 1963 the year's
// launches were lettered in Greek (1957 ALP 2, 1958 BET 1)
const GREEK = ['ALP', 'BET', 'GAM', 'DEL', 'EPS', 'ZET', 'ETA', 'THE', 'IOT', 'KAP', 'LAM', 'MU', 'NU', 'XI', 'OMI', 'PI', 'RHO', 'SIG', 'TAU', 'UPS', 'PHI', 'CHI', 'PSI', 'OME'];
const order = (cospar) => {
  let m = cospar.match(/^(\d{4})-(\d{3})/);
  if (m) return [+m[1], +m[2]];
  m = cospar.match(/^(\d{4}) ([A-Z]+)/);
  if (m && GREEK.includes(m[2])) return [+m[1], GREEK.indexOf(m[2]) + 1];
  return null;
};
const txt = fs.readFileSync('src/search.txt', 'utf8');
const lines = txt.slice(txt.indexOf('\n#O\n') + 4, txt.indexOf('\n#L\n')).split('\n');
const all = lines.map((l) => l.split('\t')).filter((f) => f.length > 5).map((f) => ({f, o: order(f[3])})).filter((r) => r.o)
  .sort((x, y) => x.o[0] - y.o[0] || x.o[1] - y.o[1] || +x.f[2] - +y.f[2]);
const most = {};
for (const r of all) most[r.o[0]] = Math.max(most[r.o[0]] || 0, r.o[1]);
// every row of the first years, then an even sample (about 900 rows in all)
const step = Math.max(1, Math.round(all.length / 900));
const picked = all.filter((r, i) => r.o[0] < 1959 || i % step === 0);
const rows = picked.map(({f, o}) => [+(o[0] + (o[1] - 0.5) / (most[o[0]] + 1)).toFixed(4), f[2], f[3], f[1] || f[0], f[4], f[5]]);
fs.writeFileSync(outFile, JSON.stringify({cues, rows}));
console.log(cues, `${rows.length} rows`);
