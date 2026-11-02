"""Bake GCAT's orbital launch log (J. McDowell, planet4589.org/space/gcat, CC BY 4.0) into ../src/launches.json.

One entry per launch that headed for orbit or beyond (orbital, deep space and near-orbital attempts), in time order:
when, from which site, on which rocket, carrying what, and whether it made it.
"""
import json, os, re, sys, collections
import datetime
from who import who
# the GCAT files: gcat/ at the top of the project (npm run fetch-gcat), or GCAT=<folder> for another download
SRC = os.path.join(os.environ.get('GCAT') or os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'gcat'), '')
EPOCH = datetime.datetime(1957, 1, 1)
MONTHS = {m: i + 1 for i, m in enumerate('Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split())}

# (same readers as bake.py)
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


# Launch sites: GCAT code -> (name shown on the page, latitude, longitude). Sea and air launches use the usual area.
SITES = {
    'NIIP-5': ('Baikonur', 45.92, 63.34), 'GIK-5': ('Baikonur', 45.92, 63.34),
    'NIIP-53': ('Plesetsk', 62.93, 40.58), 'GIK-1': ('Plesetsk', 62.93, 40.58), 'GNIIPV': ('Plesetsk', 62.93, 40.58),
    'GNIIP': ('Plesetsk', 62.93, 40.58),
    'GTsP-4': ('Kapustin Yar', 48.57, 46.25), 'GTsMP-4': ('Kapustin Yar', 48.57, 46.25),
    'VOST': ('Vostochny', 51.88, 128.33), 'GIK-2': ('Svobodny', 51.88, 128.33), 'YAS': ('Yasny', 51.09, 59.84),
    'BLA': ('Barents Sea (submarine)', 69.8, 35.0),
    'CC': ('Cape Canaveral', 28.49, -80.58), 'SPFL': ('Cape Canaveral', 28.47, -80.55),
    'SPFLA': ('Cape Canaveral', 28.47, -80.55), 'KSC': ('Kennedy Space Center', 28.61, -80.6),
    'V': ('Vandenberg', 34.73, -120.57), 'VS': ('Vandenberg', 34.63, -120.61), 'VSFB': ('Vandenberg', 34.73, -120.57),
    'VSFBS': ('Vandenberg', 34.63, -120.61), 'PA': ('Point Arguello', 34.58, -120.62),
    'WI': ('Wallops Island', 37.84, -75.48), 'MARS': ('Wallops Island', 37.83, -75.49),
    'WIMB': ('Wallops Island (air launch)', 37.9, -75.0),
    'EAFB': ('Edwards (air launch)', 34.9, -117.9), 'NOTS': ('China Lake (air launch)', 35.7, -117.7),
    'MHV': ('Mojave (air launch)', 34.0, -120.0), 'NEWQ': ('Cornwall (air launch)', 50.0, -6.5),
    'GANC': ('Gran Canaria (air launch)', 27.9, -15.4), 'KMR': ('Kwajalein', 9.05, 167.74),
    'PSCA': ('Kodiak, Alaska', 57.43, -152.34), 'KLC': ('Kodiak, Alaska', 57.43, -152.34),
    'KAU': ('Kauai, Hawaii', 22.03, -159.78), 'KLA': ('Pacific Ocean (Sea Launch)', 0.0, -154.0),
    'STB': ('Starbase, Texas', 25.99, -97.15),
    'CSG': ('Kourou', 5.24, -52.77), 'HMG': ('Hammaguir', 30.88, -3.06), 'SMLC': ('San Marco, Kenya', -2.94, 40.21),
    'ALCA': ('Alcântara', -2.37, -44.4), 'AND': ('Andøya', 69.29, 16.02),
    'JQ': ('Jiuquan', 40.96, 100.29), 'XSC': ('Xichang', 28.25, 102.03), 'TYSC': ('Taiyuan', 38.85, 111.61),
    'TYSC?': ('Taiyuan', 38.85, 111.61), 'WEN': ('Wenchang', 19.61, 110.95),
    'HCSLS': ('Hainan commercial site', 19.6, 110.95), 'HHAI': ('Yellow Sea (sea launch)', 34.9, 121.2),
    'YJ': ('South China Sea (sea launch)', 21.4, 112.3), 'ECS': ('East China Sea (sea launch)', 31.0, 124.0),
    'SHAR': ('Sriharikota', 13.72, 80.23), 'SDSC': ('Sriharikota', 13.72, 80.23),
    'TNSC': ('Tanegashima', 30.4, 130.97), 'KASC': ('Kagoshima', 31.25, 131.08), 'USC': ('Uchinoura', 31.25, 131.08),
    'KII': ('Spaceport Kii', 33.55, 135.89),
    'NARO': ('Naro', 34.43, 127.53), 'JEJU': ('Off Jeju (sea launch)', 33.0, 126.5),
    'SOHAE': ('Sohae', 39.66, 124.71), 'TONGH': ('Tonghae', 40.86, 129.67),
    'SEM': ('Semnan', 35.23, 53.92), 'SHAHR': ('Shahroud', 36.2, 55.33),
    'PALB': ('Palmachim', 31.88, 34.68), 'WOO': ('Woomera', -30.95, 136.5),
    'MAHIA': ('Mahia, New Zealand', -39.26, 177.86), 'BOWEN': ('Bowen, Australia', -19.95, 148.2),
    'APBS': ('Arnhem, Australia', -12.38, 136.82),
}
OUT = os.path.join(os.path.dirname(__file__), '..', 'src', 'launches.json')

def tidy_lv(s):
    return re.sub(r'\s+', ' ', s).strip()

RENAME = {'1-y ISZ': 'Sputnik 1', '2-y ISZ': 'Sputnik 2', '3-y ISZ': 'Sputnik 3', 'Explorer I': 'Explorer 1'}

def name_of(ps):
    """One label for a launch's payloads. Parts attached to a bigger spacecraft (no piece letter in GCAT, like
    Skylab's airlock or Apollo's surface experiments) don't count as separate payloads."""
    sep = [p for p in ps if re.search(r'[A-Z]+$', p.get('Piece') or '')]
    ps = sep or ps
    n = len(ps)
    nm = lambda p: RENAME.get(p.get('Name') or p.get('PLName') or '?', p.get('Name') or p.get('PLName') or '?')
    first = nm(ps[0])
    if n == 1:
        return first
    if n == 2:
        return f'{first} and {nm(ps[1])}'
    pl = [p.get('PLName') or '' for p in ps]
    cp = os.path.commonprefix(pl)
    cp = re.sub(r'[\s\-/#.]*\d*$', '', cp) if not cp.endswith(' ') else cp.strip()
    cp = cp.rstrip(' -/#.')
    if len(cp) >= 5:
        return f'{cp} ({n} satellites)'
    return f'{first} + {n - 1} more'

def main():
    by = collections.OrderedDict()
    for r in rows('launchlog.tsv'):
        by.setdefault(r['Launch_Tag'], []).append(r)
    out = []
    missing = collections.Counter()
    for tag, ps in by.items():
        code = ps[0]['Launch_Code']
        if not code or code[0] not in 'ODN':
            continue
        site = ps[0]['Launch_Site']
        if site not in SITES:
            missing[site] += 1
            continue
        day = pdate(ps[0]['Launch_Date'])
        if day is None:
            continue
        ok = len(code) > 1 and code[1] == 'S'
        out.append((day, site, tidy_lv(ps[0]['LV_Type']), ok, len(ps), name_of(ps), who(ps[0].get('Agency'), ps[0].get('LVState')), tag))
    out.sort(key=lambda x: x[0])
    if missing:
        print('sites without coordinates (skipped):', missing.most_common(), file=sys.stderr)
    site_names = sorted({SITES[s][0] for _, s, *_ in out})
    site_list = []
    site_idx = {}
    for s in sorted({s for _, s, *_ in out}):
        name, lat, lon = SITES[s]
        site_idx[s] = len(site_list)
        site_list.append([name, lat, lon])
    lvs = sorted({lv for _, _, lv, *_ in out})
    lv_idx = {lv: k for k, lv in enumerate(lvs)}
    # minutes since 1957-01-01, delta-coded
    mins = [round(d * 1440) for d, *_ in out]
    deltas = [mins[0]] + [b - a for a, b in zip(mins, mins[1:])]
    data = {
        'source': 'GCAT launch log, J. McDowell, planet4589.org/space/gcat (CC BY 4.0), ' + getattr(rows, 'updated', ''),
        'sites': site_list,
        'lv': lvs,
        'dt': deltas,
        's': [site_idx[s] for _, s, *_ in out],
        'v': [lv_idx[lv] for _, _, lv, *_ in out],
        'ok': ''.join('1' if x[3] else '0' for x in out),
        'n': [x[4] for x in out],
        'p': [x[5] for x in out],
        'w': ''.join(str(x[6]) for x in out),
    }
    with open(OUT, 'w') as f:
        json.dump(data, f, separators=(',', ':'), ensure_ascii=False)
    # the launches' order, for the search index (search.py)
    with open(os.path.join(os.path.dirname(__file__), 'launch-order.json'), 'w') as f:
        json.dump([x[7] for x in out], f)
    oks = sum(1 for x in out if x[3])
    print('launches by group (reached orbit):', collections.Counter(x[6] for x in out if x[3]))
    print(f'{len(out)} launches ({oks} reached orbit or beyond), {len(site_list)} sites, {len(lvs)} rockets, '
          f'{os.path.getsize(OUT) // 1024} KB')

if __name__ == '__main__':
    main()
