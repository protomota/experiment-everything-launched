"""Bake GCAT (J. McDowell, planet4589.org/space/gcat, CC BY 4.0) into a compact binary for the page.

Output: ../src/catalog.bin (structure-of-arrays, little-endian) and ../src/catalog.json (counts, events, field layout).
Orbit size, shape and tilt come from GCAT. Plane orientation and position along the orbit are seeded (illustrative):
objects from one launch share a plane, debris shares its parent's plane and starts at the parent's position at breakup.
"""
import json, math, os, struct, hashlib, datetime, collections, sys, re
from who import who, GROUPS
# the GCAT files: gcat/ at the top of the project (npm run fetch-gcat), or GCAT=<folder> for another download
SRC = os.path.join(os.environ.get('GCAT') or os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'gcat'), '')
RE = 6371.0
MU = 398600.4418
J2 = 1.08263e-3
EPOCH = datetime.datetime(1957, 1, 1)
MONTHS = {m: i + 1 for i, m in enumerate('Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split())}

def rows(fn):
    with open(SRC + fn, encoding='utf-8', errors='replace') as f:
        hdr = None
        for line in f:
            line = line.rstrip('\n')
            if line.startswith('#'):
                if hdr is None:
                    hdr = [h.strip() for h in line[1:].split('\t')]
                elif 'Updated' in line:
                    rows.updated = line[1:].strip()
                continue
            yield dict(zip(hdr, [p.strip() for p in line.split('\t')]))

def pdate(s):
    """GCAT date like '2009 Feb 10 1656', '1957 Oct  4', '2026 Jul', '2017 Feb?' -> days since 1957-01-01, or None."""
    if not s or s == '-':
        return None
    s = s.replace('?', ' ').split()
    try:
        y = int(s[0])
    except ValueError:
        return None
    m = MONTHS.get(s[1][:3], 1) if len(s) > 1 else 7
    d = 1
    if len(s) > 2 and s[2].isdigit():
        d = int(s[2])
    elif len(s) == 2:
        d = 15
    hh = mm = 0
    if len(s) > 3:
        t = s[3].split(':')[0]
        if t.isdigit() and len(t) >= 3:
            t = t.zfill(4); hh, mm = int(t[:2]), int(t[2:4])
    try:
        dt = datetime.datetime(y, m, d, min(hh, 23), min(mm, 59))
    except ValueError:
        dt = datetime.datetime(y, m, 1)
    return (dt - EPOCH).total_seconds() / 86400.0

def num(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None

def h01(key):
    return int.from_bytes(hashlib.sha1(key.encode()).digest()[:4], 'little') / 2**32

SKIP_STATUS = {'DK', 'DSO', 'DSA', 'TFR', 'ERR', 'ATT'}  # AO/AR (payloads that stayed on their stage) are kept
sat = list(rows('satcat.tsv'))
updated = rows.updated
cur = {r['JCAT']: r for r in rows('currentcat.tsv')}
by = {r['JCAT']: r for r in sat}

objs = []
def add(r, src):
    t0 = pdate(r.get('SDate')) if r.get('SDate') not in (None, '', '-') else None
    if t0 is None:
        t0 = pdate(r.get('LDate'))
    if t0 is None:
        return
    st = r.get('Status', '')
    c = cur.get(r['JCAT'])
    up_now = bool(c) and c.get('ExpandedStatus') == 'In Earth orbit'
    # attached or docked when GCAT last filed it (Hubble, filed as attached to the Shuttle) but flying free today
    if st in SKIP_STATUS and not (up_now and st in ('ATT', 'DK')):
        return
    if re.search(r'\bdup(licate)?\b', r['Name'].lower()):
        return
    t1 = pdate(r.get('DDate'))
    if r['JCAT'] == 'S25544':  # Zarya: its "group" date is when ISS assembly began; the station is still up
        t1 = None
    if st in ('ATT', 'DK'):
        t1 = None
    per, apo, inc = num(r.get('Perigee')), num(r.get('Apogee')), num(r.get('Inc'))
    if t1 is None and c and c.get('ExpandedStatus') != 'In Earth orbit':
        return  # lost, or no longer in Earth orbit, with no end date to draw it to
    if t1 is None and c and num(c.get('Perigee')) is not None and num(c.get('Apogee')) is not None:
        per, apo = num(c['Perigee']), num(c['Apogee'])  # still up: draw today's orbit
        if num(c.get('Inc')) is not None:
            inc = num(c['Inc'])
    if per is None or apo is None or inc is None:
        return
    if apo > 150000 or apo < 100:
        return
    per = max(per, 100.0)
    apo = max(apo, per)
    if t1 is not None and t1 <= t0:
        return
    ty = r['Type'][:1]
    name = r['Name']
    if ty == 'P':
        cat = 1 if name.startswith('Starlink') else 0
    elif ty == 'R':
        cat = 2
    elif ty == 'D':
        cat = 3
    else:
        cat = 4
    objs.append(dict(id=r['JCAT'], name=name, tag=r.get('Launch_Tag', '-'), parent=r.get('Parent', '-'), t0=t0, t1=t1,
                     per=per, apo=apo, inc=inc, cat=cat, sdate=(r.get('SDate') or '')[:11], src=src,
                     # second-generation Starlink (V2 Mini); objects only in currentcat are 2026 launches, all V2
                     v2=cat == 1 and ((r.get('Bus') or '').startswith('Starlink V2') or src == 'c'),
                     kuip=(r.get('Owner') or '').strip() == 'KUIP' or (r.get('Bus') or '').startswith('Kuiper'),
                     who=who(r.get('Owner'), r.get('State'))))

for r in sat:
    add(r, 's')
seen = set(by)
for j, c in cur.items():
    if j in seen or c.get('ExpandedStatus') != 'In Earth orbit':
        continue
    r = dict(c)
    r.setdefault('Status', 'O')
    r['Launch_Tag'] = '-'
    add(r, 'c')
print('objects', len(objs), collections.Counter(o['src'] for o in objs), collections.Counter(o['cat'] for o in objs))

# ---- plane keys: launches share a plane, debris shares its root parent's plane
idx = {o['id']: o for o in objs}
def root(jc, depth=0):
    r = by.get(jc) or cur.get(jc)
    if not r or depth > 8:
        return jc
    p = r.get('Parent', '-')
    if r.get('Type', ' ')[:1] in 'DC' and p not in ('-', '', None):
        return root(p, depth + 1)
    return jc
def plane_key(o):
    if o['cat'] in (3, 4) and o['parent'] not in ('-', ''):
        rj = root(o['id'])
        rr = by.get(rj) or cur.get(rj) or {}
        tag = rr.get('Launch_Tag', '-')
        return tag if tag not in ('-', '') else rj
    return o['tag'] if o['tag'] not in ('-', '') else o['id']

def elems(per, apo, inc):
    a = RE + (per + apo) / 2
    e = (apo - per) / (2 * a)
    n = math.sqrt(MU / a**3)  # rad/s
    p = a * (1 - e * e)
    i = math.radians(inc)
    k = 1.5 * n * J2 * (RE / p) ** 2 * 86400  # rad/day
    raan_dot = -k * math.cos(i)
    argp_dot = k * (2 - 2.5 * math.sin(i) ** 2)
    return a, e, n, raan_dot, argp_dot

# breakup groups: debris with the same parent and separation day
groups = collections.defaultdict(list)
for o in objs:
    o['pk'] = plane_key(o)
    if o['cat'] in (3, 4) and o['parent'] not in ('-', '') and o['sdate']:
        groups[(root(o['id']), o['sdate'])].append(o)
for o in objs:
    a, e, n, rd, wd = elems(o['per'], o['apo'], o['inc'])
    o.update(a=a, e=e, n=n, rd=rd, wd=wd)
for key, g in groups.items():
    if len(g) < 2:
        continue
    na = sum(o['n'] for o in g) / len(g)
    ra = sum(o['rd'] for o in g) / len(g)
    wa = sum(o['wd'] for o in g) / len(g)
    av = (MU / na**2) ** (1 / 3)
    M0 = h01('M' + key[0] + key[1]) * 2 * math.pi
    for o in g:
        o['grp'] = key
        o['aVis'] = av
        o['dM'] = (o['n'] - na) * 86400
        o['dR'] = o['rd'] - ra
        o['dW'] = o['wd'] - wa
        o['M0'] = (M0 + (h01('j' + o['id']) - 0.5) * 0.02) % (2 * math.pi)
for o in objs:
    o.setdefault('aVis', o['a']); o.setdefault('dM', 0.0); o.setdefault('dR', 0.0); o.setdefault('dW', 0.0)
    o.setdefault('M0', h01('M' + o['id']) * 2 * math.pi)
    o['R0'] = h01('R' + o['pk']) * 2 * math.pi
    o['W0'] = h01('W' + o['pk']) * 2 * math.pi

objs.sort(key=lambda o: o['t0'])
N = len(objs)
NONE = 65535
def u16(v, lo=0, hi=65534):
    return max(lo, min(hi, int(round(v))))
fields = collections.OrderedDict()
fields['t0'] = ('<u2', [u16(math.floor(o['t0'])) for o in objs])         # whole day (the fraction is t0f)
fields['t0f'] = ('<u1', [u16((o['t0'] % 1) * 255, 0, 255) for o in objs])  # fraction of day /255
fields['t1'] = ('<u2', [NONE if o['t1'] is None else u16(o['t1']) for o in objs])
fields['per'] = ('<u2', [u16(o['per'] / 4) for o in objs])                # altitude, 4 km units
fields['apo'] = ('<u2', [u16(o['apo'] / 4) for o in objs])
fields['avis'] = ('<u2', [u16((o['aVis'] - RE) / 4) for o in objs])      # semi-major axis minus Re, 4 km units
fields['inc'] = ('<u2', [u16(o['inc'] * 100) for o in objs])
fields['raan'] = ('<u2', [u16(o['R0'] / (2 * math.pi) * 65535) for o in objs])
fields['argp'] = ('<u2', [u16(o['W0'] / (2 * math.pi) * 65535) for o in objs])
fields['m0'] = ('<u2', [u16(o['M0'] / (2 * math.pi) * 65535) for o in objs])
fields['dm'] = ('<i2', [max(-32767, min(32767, int(round(o['dM'] * 1000)))) for o in objs])   # rad/day * 1e3
fields['dr'] = ('<i2', [max(-32767, min(32767, int(round(o['dR'] * 1e5)))) for o in objs])   # rad/day * 1e5
fields['dw'] = ('<i2', [max(-32767, min(32767, int(round(o['dW'] * 1e5)))) for o in objs])
fields['cat'] = ('<u1', [o['cat'] for o in objs])
fields['who'] = ('<u1', [o['who'] for o in objs])
import array
blob = bytearray()
layout = {}
for k, (fmt, vals) in fields.items():
    code = {'<u2': 'H', '<i2': 'h', '<u1': 'B'}[fmt]
    arr = array.array(code, vals)
    if sys.byteorder != 'little':
        arr.byteswap()
    while len(blob) % 2:
        blob.append(0)
    layout[k] = [len(blob), fmt]
    blob += arr.tobytes()
open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'catalog.bin'), 'wb').write(blob)
# the catalog's object order, for the search index (search.py)
json.dump([o['id'] for o in objs], open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'order.json'), 'w'))

# ---- events, counted from the data
def cnt_group(root_id, sday):
    # every piece GCAT catalogs from this breakup, including ones since lost or decayed
    return sum(1 for r in sat if r['Type'][:1] in 'DC' and (r.get('SDate') or '')[:11] == sday and root(r['JCAT']) == root_id)
def day(s):
    return pdate(s)
ev = []
def E(date, title, body, focus=None, kind='event'):
    ev.append(dict(t=day(date), date=date, title=title, body=body, focus=focus, kind=kind))
first_sl = sum(1 for o in objs if o['cat'] == 1 and o['t0'] < day('2019 May 25'))
E('1957 Oct  4 1928', 'Sputnik 1', 'The first satellite, and the rocket stage that carried it, reach orbit.', 'S00002', 'first')
E('1958 Mar 17', 'Vanguard 1', 'Launched by the US. It is still in orbit today, the oldest object up there.', 'S00005')
E('1964 Aug 19', 'Syncom 3', 'The first geostationary satellite. A ring of them now circles the equator 35,786 km up.', 'S00858')
fy = cnt_group('S25730', '2007 Jan 11')
E('2007 Jan 11 2228', 'Fengyun-1C destroyed', f'China destroys one of its old weather satellites in a missile test. {fy:,} pieces are cataloged.', 'S25730', 'breakup')
ik = cnt_group('S22675', '2009 Feb 10') + cnt_group('S24946', '2009 Feb 10')
E('2009 Feb 10 1656', 'Iridium 33 hits Kosmos-2251', f'The first accidental collision between two intact satellites. {ik:,} pieces are cataloged.', 'S24946', 'breakup')
E('2019 May 24', 'Starlink begins', f'SpaceX launches its first {first_sl} Starlink satellites.', None, 'starlink')
kz = cnt_group('S13552', '2021 Nov 15')
E('2021 Nov 15 0250', 'Kosmos-1408 destroyed', f'Russia destroys a dead Soviet satellite in a missile test. {kz:,} pieces are cataloged.', 'S13552', 'breakup')
for e_ in ev:
    if e_['focus']:
        fo = idx.get(e_['focus'])
        e_['focusIndex'] = objs.index(fo) if fo in objs else None
# breakups: each broken object with one fragment of its cloud. The page finds the rest of the cloud from that fragment
# (same plane, same day) and starts every piece at the parent's position at the moment of the breakup.
PARENTS = {'S25730': ['S25730'], 'S24946': ['S24946', 'S22675'], 'S13552': ['S13552']}
end_t_ = pdate(updated.replace('Updated ', '').rsplit(' ', 1)[0])
pos = {id(o): i for i, o in enumerate(objs)}
for e_ in ev:
    if e_['kind'] == 'breakup':
        sd = e_['date'][:11]
        parts = []
        for pid in PARENTS[e_['focus']]:
            frag = next((i for i, o in enumerate(objs) if o.get('grp') == (pid, sd)), None)
            members = sum(1 for o in objs if o.get('grp') == (pid, sd))
            parts.append(dict(parent=pos[id(idx[pid])], frag=frag, members=members))
        e_['parts'] = parts
        e_['fragIndex'] = parts[-1]['frag']
        # how many of the cataloged pieces were still in orbit at each date since, for the event card's chart
        pieces = [r for pid in PARENTS[e_['focus']] for r in sat
                  if r['Type'][:1] in 'DC' and (r.get('SDate') or '')[:11] == sd and root(r['JCAT']) == pid]
        decays = [pdate(r.get('DDate') or '-') for r in pieces]
        e_['cataloged'] = len(pieces)
        y0 = int(sd[:4])
        series = [[e_['t'], len(pieces)]]
        for y in range(y0 + 1, 2027):
            t = pdate(f'{y} Jan  1')
            series.append([t, sum(1 for d in decays if d is None or d > t)])
        series.append([end_t_, sum(1 for d in decays if d is None or d > end_t_)])
        e_['alive'] = series
end_t = pdate(updated.replace('Updated ', '').rsplit(' ', 1)[0])
meta = dict(count=N, layout=layout, updated=updated, endDay=end_t, events=ev,
            byCat=collections.Counter(o['cat'] for o in objs),
            inOrbitNow=sum(1 for o in objs if o['t1'] is None),
            inOrbitNowByCat=collections.Counter(o['cat'] for o in objs if o['t1'] is None),
            starlinkEver=sum(1 for o in objs if o['cat'] == 1),
            starlinkV2Now=sum(1 for o in objs if o['v2'] and o['t1'] is None),
            kuiperNow=sum(1 for o in objs if o['kuip'] and o['t1'] is None),
            groups=GROUPS,
            inOrbitNowByWho=collections.Counter(o['who'] for o in objs if o['t1'] is None))
# V2 Minis in orbit over time, as [day, change] steps (launches add, reentries subtract)
_up = collections.Counter(round(o['t0'], 2) for o in objs if o['v2'])
_down = collections.Counter(round(o['t1'], 2) for o in objs if o['v2'] and o['t1'] is not None)
_steps = collections.Counter(_up)
_steps.subtract(_down)
meta['starlinkV2Steps'] = sorted([d, n] for d, n in _steps.items() if n)
json.dump(meta, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'catalog.json'), 'w'), indent=1)
print(json.dumps({k: meta[k] for k in ('count', 'updated', 'endDay', 'inOrbitNow', 'inOrbitNowByCat', 'byCat', 'starlinkEver', 'starlinkV2Now', 'kuiperNow', 'inOrbitNowByWho')}), len(meta['starlinkV2Steps']), 'v2 steps')
for e_ in ev: print(e_['date'], e_['title'], '|', e_['body'], e_.get('focusIndex'), e_.get('parts'))
print('bin bytes', len(blob))
