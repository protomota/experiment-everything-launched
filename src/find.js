// Search: every object in the catalog, every launch and every milestone card. The index (search.txt, built by
// bake/search.py) is fetched the first time someone uses the box; its rows follow the order of the objects in
// catalog.bin and of the launches in launches.json, so a row number is also the object's or the launch's index.
//
// Object rows: name, other names, satcat number, COSPAR id, GCAT type, state, mass kg, length/diameter/span m, bus,
// launch index, parent index, status, payload category, program, note.
// Launch rows: tag, flight id, pad, payload names (|-separated), payloads that left Earth orbit.

export const norm = (s) =>
  (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export function parseIndex(text) {
  const nl = text.indexOf('\n');
  const head = JSON.parse(text.slice(0, nl));
  const oAt = text.indexOf('\n#O\n');
  const lAt = text.indexOf('\n#L\n');
  const obj = text.slice(oAt + 4, lAt).split('\n');
  const lau = text.slice(lAt + 4).replace(/\n+$/, '').split('\n');
  return {head, obj, lau};
}

// How well a padded haystack (' words ') matches the query: whole name, start of the name, start of a word, anywhere.
const scoreText = (name, hay, q, toks) => {
  if (hay.indexOf(toks[0]) < 0) return 0;
  if (name === ` ${q} `) return 1000;
  if (name.startsWith(` ${q} `)) return 720;
  if (name.startsWith(` ${q}`)) return 640;
  if (hay.indexOf(` ${q} `) >= 0) return 470;
  if (hay.indexOf(` ${q}`) >= 0) return 420;
  if (hay.indexOf(q) >= 0) return 260;
  for (let k = 1; k < toks.length; k += 1) if (hay.indexOf(toks[k]) < 0) return 0;
  return toks.every((t) => hay.indexOf(` ${t}`) >= 0) ? 200 : 140;
};

// The searchable text for everything, built once the index is in.
const KIND_WORD = ['satellite', 'starlink satellite', 'rocket stage', 'debris', 'discarded part'];
export function buildSearch(index, {objCat, objUp, launchText, milestones, famous = []}) {
  const {obj, lau} = index;
  const n = obj.length;
  const oName = new Array(n);
  const oHay = new Array(n);
  const oAlt = new Array(n); // other names, each scored like a name
  const satcat = new Map();
  const piece = new Map();
  const rows = obj.map((line) => line.split('\t', 11));
  for (let i = 0; i < n; i += 1) {
    const [name, alt, sc, pc] = rows[i];
    const nm = norm(name);
    oName[i] = ` ${nm} `;
    // also: the name run together (Feng Yun 1C finds as fengyun), the kind, and for stages, debris and parts the
    // object they came from
    const c = objCat(i);
    const parent = c >= 2 && rows[i][10] !== '' ? norm(rows[Number(rows[i][10])][0]) : '';
    const joined = (t) => (t.includes(' ') ? t.replace(/ /g, '') : '');
    const extra = [norm(alt), KIND_WORD[c], parent, joined(nm), joined(parent)].filter(Boolean).join(' ');
    oHay[i] = ` ${nm} ${extra} `;
    oAlt[i] = alt ? alt.split(', ').map((a) => ` ${norm(a)} `) : null;
    if (sc) satcat.set(sc, i);
    if (pc) piece.set(norm(pc), i);
  }
  const lHay = lau.map((line, k) => {
    const t = line.split('\t');
    return ` ${norm(`${t[3].replace(/\|/g, ' ')} ${t[1]} ${launchText(k)}`)} `;
  });
  const lName = lau.map((line, k) => ` ${norm(launchText(k, true))} `);
  const lTag = new Map(lau.map((line, k) => [norm(line.slice(0, line.indexOf('\t'))), k]));
  const mHay = milestones.map((m) => ` ${norm(m.text)} `);
  const mName = milestones.map((m) => ` ${norm(m.title)} `);
  const KIND = [80, 30, -60, -200, -200];
  // a few objects people mostly mean (the ISS before the Ionosphere Sounding Satellite)
  const fame = new Set(famous.map((sc) => satcat.get(String(sc))).filter((i) => i != null));

  return function search(raw, limit = 50) {
    const q = norm(raw);
    if (!q) return {q, total: 0, hits: []};
    const toks = q.split(' ');
    const hits = [];
    // milestone cards first
    milestones.forEach((m, k) => {
      const s = scoreText(mName[k], mHay[k], q, toks);
      if (s) hits.push({type: 'm', key: m.key, s: s >= 400 ? 3000 + s : s});
    });
    // a catalog number or a COSPAR id
    if (/^\d{1,6}$/.test(q) && satcat.has(q.replace(/^0+/, ''))) hits.push({type: 'o', i: satcat.get(q.replace(/^0+/, '')), s: 2500});
    if (/^\d{4} \d{3}/.test(q)) {
      const compact = q.replace(/^(\d{4}) (\d{3}) ?([a-z]*)$/, '$1 $2$3');
      if (piece.has(compact)) hits.push({type: 'o', i: piece.get(compact), s: 2400});
      const tag = compact.split(' ').slice(0, 2).join(' ');
      if (lTag.has(tag)) hits.push({type: 'l', k: lTag.get(tag), s: 2300});
    }
    for (let i = 0; i < n; i += 1) {
      let s = scoreText(oName[i], oHay[i], q, toks);
      if (!s) continue;
      if (oAlt[i]) for (const a of oAlt[i]) s = Math.max(s, scoreText(a, oHay[i], q, toks) - 30);
      hits.push({type: 'o', i, s: s + KIND[objCat(i)] + (objUp(i) ? 8 : 0) + (fame.has(i) ? 150 : 0) - Math.min(40, oName[i].length * 0.4)});
    }
    for (let k = 0; k < lHay.length; k += 1) {
      const s = scoreText(lName[k], lHay[k], q, toks);
      if (s) hits.push({type: 'l', k, s: s + 60 - Math.min(40, lName[k].length * 0.3)});
    }
    // the same object or launch found two ways keeps its best score
    const seen = new Set();
    hits.sort((a, b) => b.s - a.s || (a.i ?? a.k ?? 0) - (b.i ?? b.k ?? 0));
    const out = [];
    for (const h of hits) {
      const id = h.type + (h.key ?? h.i ?? h.k);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(h);
    }
    return {q, total: out.length, hits: out.slice(0, limit)};
  };
}
