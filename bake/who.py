"""Who an object or a launch belongs to, for the country view: one of GROUPS, from GCAT's owner code and state.

Objects use their Owner and State; launches use the launching Agency and the rocket's LVState. Debris belongs to the
owner of the object it came from, as GCAT records it.
"""
GROUPS = ['NASA', 'SpaceX', 'Other US', 'Russia & USSR', 'China', 'India', 'Japan', 'Europe', 'Everyone else']

# NASA and its centres, as GCAT owner and agency codes
NASA = {'NASA', 'NASAH', 'HQ', 'GSFC', 'JPL', 'MSFC', 'JSC', 'MSC', 'KSC', 'LERC', 'GRC', 'LARC', 'LARCN', 'ARC',
        'AMES', 'DFRC', 'AFRC', 'WFF', 'SSC', 'GISS'}
SPACEX = {'SPX', 'SPXS'}
# European states, and the European agencies GCAT files as international (I-ESA, I-EU, I-EUM, I-ESRO, I-ELDO ...)
EUROPE = {'F', 'UK', 'D', 'I', 'L', 'E', 'FI', 'CH', 'PL', 'N', 'NL', 'GR', 'S', 'DK', 'CZ', 'B', 'HU', 'LT', 'P', 'AT',
          'SK', 'RO', 'BGN', 'IRL', 'EST', 'LV', 'SI', 'HR', 'LUX'}


def who(owner, state):
    lead = (owner or '').split('/')[0].strip().rstrip('?')
    state = (state or '').strip()
    if lead in SPACEX:
        return 1
    if state == 'US':
        return 0 if lead in NASA else 2
    if state in ('SU', 'RU'):
        return 3
    if state in ('CN', 'HK'):
        return 4
    if state == 'IN':
        return 5
    if state == 'J':
        return 6
    if state in EUROPE or state.startswith('I-E'):
        return 7
    return 8
