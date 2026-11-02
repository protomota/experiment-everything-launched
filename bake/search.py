"""Bake the search index for the page: names, catalog numbers and facts for every object and every launch, from GCAT
(J. McDowell, planet4589.org/space/gcat, CC BY 4.0). Run bake.py and launches.py first: they write the order of the
objects and launches on the page (order.json, launch-order.json), and the rows here follow the same order.

Output: ../src/search.txt, fetched by the page the first time someone searches. Plain text, tab-separated:
  line 1: JSON header (field names, payload categories, countries)
  #O then one line per object:  name, other name, satcat number, COSPAR id, type, country, mass kg, length/diameter/span m,
         bus, launch index, parent object index, status, category, program, note
  #L then one line per launch:  tag, flight id, pad, payload names joined by |, payloads that left Earth orbit
"""
import json, os, re, collections
# the GCAT files: gcat/ at the top of the project (npm run fetch-gcat), or GCAT=<folder> for another download
SRC = os.path.join(os.environ.get('GCAT') or os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'gcat'), '')
HERE = os.path.dirname(os.path.abspath(__file__))

def rows(fn):
    with open(SRC + fn, encoding='utf-8', errors='replace') as f:
        hdr = None
        for line in f:
            line = line.rstrip('\n')
            if line.startswith('#'):
                if hdr is None:
                    hdr = [h.strip() for h in line[1:].split('\t')]
                continue
            yield dict(zip(hdr, [p.strip() for p in line.split('\t')]))

def clean(v):
    v = (v or '').strip()
    return '' if v in ('-', '?', '*') else v.replace('\t', ' ')

def num(v):
    v = clean(v).rstrip('?')
    try:
        x = float(v)
    except ValueError:
        return ''
    return '' if x <= 0 else (f'{x:.0f}' if x >= 100 else f'{x:g}')

order = json.load(open(os.path.join(HERE, 'order.json')))
lorder = json.load(open(os.path.join(HERE, 'launch-order.json')))
sat = {r['JCAT']: r for r in rows('satcat.tsv')}
cur = {r['JCAT']: r for r in rows('currentcat.tsv')}
psat = {r['JCAT']: r for r in rows('psatcat.tsv')}
lidx = {t.strip(): k for k, t in enumerate(lorder)}
oidx = {j: k for k, j in enumerate(order)}

# payload categories (GCAT psatcat Category codes), in plain words
CATEGORY = {
    'COM': 'Communications', 'IMG': 'Earth imaging', 'IMG-R': 'Radar imaging', 'TECH': 'Technology test',
    'CAL': 'Calibration target', 'SS': 'Human spaceflight', 'SIG': 'Signals intelligence', 'NAV': 'Navigation',
    'SCI': 'Science', 'MET': 'Weather', 'MET-RO': 'Weather (radio occultation)', 'PLAN': 'Planetary science',
    'AST': 'Astronomy', 'EW': 'Missile early warning', 'EOSCI': 'Earth science', 'GEOD': 'Geodesy',
    'MGRAV': 'Microgravity research', 'WEAPON': 'Weapons test', 'BIO': 'Biology', 'RV': 'Film return capsule',
    'TARG': 'Target', 'EDU': 'Education', 'MISC': 'Other',
}
# GCAT state codes, in plain words
STATES = {
    'US': 'United States', 'SU': 'Soviet Union', 'RU': 'Russia', 'CN': 'China', 'F': 'France', 'J': 'Japan',
    'UK': 'United Kingdom', 'IN': 'India', 'NZ': 'New Zealand', 'I-ESA': 'European Space Agency', 'D': 'Germany',
    'I': 'Italy', 'CA': 'Canada', 'L': 'Luxembourg', 'KR': 'South Korea', 'E': 'Spain', 'AU': 'Australia',
    'IL': 'Israel', 'TR': 'Turkey', 'I-INT': 'Intelsat (international)', 'UY': 'Uruguay', 'FI': 'Finland',
    'TW': 'Taiwan', 'BR': 'Brazil', 'I-EU': 'European Union', 'IR': 'Iran', 'UAE': 'United Arab Emirates',
    'SG': 'Singapore', 'ID': 'Indonesia', 'CH': 'Switzerland', 'PL': 'Poland', 'N': 'Norway', 'NL': 'Netherlands',
    'I-EUM': 'EUMETSAT (Europe)', 'GR': 'Greece', 'S': 'Sweden', 'SA': 'Saudi Arabia', 'MX': 'Mexico',
    'AR': 'Argentina', 'I-EUT': 'Eutelsat (Europe)', 'DK': 'Denmark', 'T': 'Thailand', 'MY': 'Malaysia',
    'HK': 'Hong Kong', 'I-ESRO': 'ESRO (Europe)', 'I-ARAB': 'Arabsat (international)', 'EG': 'Egypt',
    'CZ': 'Czech Republic', 'B': 'Belgium', 'PK': 'Pakistan', 'MN': 'Mongolia', 'LT': 'Lithuania', 'HU': 'Hungary',
    'ZA': 'South Africa', 'PH': 'Philippines', 'KZ': 'Kazakhstan', 'I-INM': 'Inmarsat (international)',
    'BGN': 'Bulgaria', 'UA': 'Ukraine', 'P': 'Portugal', 'KP': 'North Korea', 'I-NATO': 'NATO', 'DZ': 'Algeria',
    'CL': 'Chile', 'VN': 'Vietnam', 'RW': 'Rwanda', 'NG': 'Nigeria', 'BY': 'Belarus', 'AT': 'Austria',
    'SK': 'Slovakia', 'PE': 'Peru', 'MA': 'Morocco', 'RO': 'Romania', 'HKUK': 'Hong Kong (UK)', 'EC': 'Ecuador',
    'VE': 'Venezuela', 'SI': 'Slovenia', 'QA': 'Qatar', 'NP': 'Nepal', 'MC': 'Monaco', 'KW': 'Kuwait', 'EE': 'Estonia',
    'CYM': 'Cayman Islands', 'CO': 'Colombia', 'BM': 'Bermuda', 'AZ': 'Azerbaijan', 'ZW': 'Zimbabwe', 'TN': 'Tunisia',
    'PR': 'Puerto Rico', 'MU': 'Mauritius', 'KE': 'Kenya', 'IE': 'Ireland', 'I-RASC': 'RASCOM (Africa)',
    'ET': 'Ethiopia', 'DJ': 'Djibouti', 'CSSR': 'Czechoslovakia', 'BT': 'Bhutan', 'BD': 'Bangladesh', 'AO': 'Angola',
    'AM': 'Armenia', 'UG': 'Uganda', 'SN': 'Senegal', 'SD': 'Sudan', 'SB': 'Solomon Islands', 'PY': 'Paraguay',
    'PG': 'Papua New Guinea', 'OM': 'Oman', 'MYM': 'Myanmar', 'ME': 'Montenegro', 'MD': 'Moldova', 'LV': 'Latvia',
    'LK': 'Sri Lanka', 'LA': 'Laos', 'JO': 'Jordan', 'HR': 'Croatia', 'GT': 'Guatemala', 'GH': 'Ghana',
    'ESIB': 'ESA and Spain', 'CSFR': 'Czechoslovakia', 'CR': 'Costa Rica', 'IRL': 'Ireland', 'EST': 'Estonia',
    'LUX': 'Luxembourg', 'HUN': 'Hungary', 'BO': 'Bolivia', 'BH': 'Bahrain', 'BW': 'Botswana',
}

# GCAT files the whole ISS under its first module
DISPLAY = {'S25544': 'International Space Station (Zarya)'}
# names people search for that GCAT doesn't use
ALIAS = {'S25544': 'ISS, International Space Station', 'S48274': 'Tiangong, China Space Station, CSS',
         'S20580': 'HST', 'S16609': 'Mir space station'}

def note(p):
    c = clean(p.get('Comment'))
    return c if c and len(c) <= 90 else ''

out = []
seen_states = collections.Counter()
for j in order:
    r = sat.get(j) or cur.get(j) or {}
    p = psat.get(j, {})
    name = DISPLAY.get(j) or clean(r.get('Name')) or j
    alt = re.sub(r'\s+', ' ', clean(r.get('PLName')))
    if alt == name:
        alt = ''
    if j in ALIAS:
        alt = f'{alt}, {ALIAS[j]}' if alt else ALIAS[j]
    state = clean(r.get('State')).rstrip('?')
    seen_states[state] += 1
    size = '/'.join(num(r.get(k)) for k in ('Length', 'Diameter', 'Span'))
    if size == '//':
        size = ''
    parent = clean(r.get('Parent'))
    pi = oidx.get(parent, '')
    cat = clean(p.get('Category')).split('/')[0].rstrip('?*')
    prog = clean(p.get('Program'))
    out.append('\t'.join(str(x) for x in (
        name, alt, (clean(r.get('Satcat')) or '').lstrip('0'), clean(r.get('Piece')), clean(r.get('Type')).split()[0] if clean(r.get('Type')) else '',
        state, num(r.get('Mass')), size, clean(r.get('Bus')), lidx.get(clean(r.get('Launch_Tag')), ''), pi,
        clean(r.get('Status')), cat if cat in CATEGORY else '', prog if prog != name else '', note(p))))

# launches: every payload name, and how many left Earth orbit
by = collections.OrderedDict()
for r in rows('launchlog.tsv'):
    by.setdefault(r['Launch_Tag'].strip(), []).append(r)
deep = {j for j, r in sat.items() if (r.get('Status') or '').startswith('DS')}
lout = []
for t in lorder:
    ps = by.get(t.strip(), [])
    names = []
    for p in ps:
        n = clean(p.get('Name')) or clean(p.get('PLName'))
        if n and n not in names:
            names.append(n)
    # long trains of one kind (Starlink, OneWeb ...) keep their first few names; search finds the rest as objects
    if len(names) > 12:
        names = names[:6]
    first = ps[0] if ps else {}
    nd = sum(1 for p in ps if (p.get('JCAT') or '').strip() in deep)
    lout.append('\t'.join((t.strip(), clean(first.get('Flight_ID')), clean(first.get('Launch_Pad')), '|'.join(names), str(nd) if nd else '')))

head = {'source': 'GCAT, J. McDowell, planet4589.org/space/gcat (CC BY 4.0)', 'categories': CATEGORY,
        'states': {k: STATES.get(k, k) for k in seen_states if k}}
missing = [k for k in seen_states if k and k not in STATES]
txt = json.dumps(head, ensure_ascii=False, separators=(',', ':')) + '\n#O\n' + '\n'.join(out) + '\n#L\n' + '\n'.join(lout) + '\n'
OUT = os.path.join(HERE, '..', 'src', 'search.txt')
open(OUT, 'w', encoding='utf-8').write(txt)
import gzip
print('objects', len(out), 'launches', len(lout), 'bytes', len(txt.encode()), 'gzip', len(gzip.compress(txt.encode(), 9)), 'states missing', missing)
