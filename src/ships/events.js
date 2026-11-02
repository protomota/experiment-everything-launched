// Cards for the three debris events. Counts (cataloged, still in orbit, the chart) come from the catalog; the rest
// from contemporary reports by NASA's Orbital Debris Program Office, US Space Command and ESA.
// %CATALOGED% and %LEFT% are filled in from the data.

export const EVENT_CARDS = {
  fengyun: {
    key: 'fengyun',
    title: 'Fengyun-1C destroyed',
    kind: 'Anti-satellite missile test · China',
    place: 'Over central China, in an 845 × 865 km orbit',
    when: '2007-01-11T22:28',
    specs: [
      ['Orbit', '845 × 865 km'],
      ['Impact', 'head-on, about 8 km/s'],
      ['Target', 'Fengyun-1C, a 1999 weather satellite'],
      ['Pieces cataloged', '%CATALOGED%'],
      ['Still in orbit', '%LEFT%'],
    ],
    body: 'China tested an anti-satellite missile by hitting one of its own retired weather satellites. The impact made the largest debris cloud ever recorded. At 865 km there is almost no air to slow the pieces down, so most of them are still up there nearly 20 years later, crossing the paths of working satellites.',
  },
  iridium: {
    key: 'iridium',
    title: 'Iridium 33 hits Kosmos-2251',
    kind: 'Accidental collision · United States and Russia',
    place: '790 km above northern Siberia',
    when: '2009-02-10T16:56',
    specs: [
      ['Altitude', '790 km'],
      ['Closing speed', '11.7 km/s'],
      ['Satellites', 'Iridium 33, 560 kg, working; Kosmos-2251, 900 kg, dead'],
      ['Pieces cataloged', '%CATALOGED%'],
      ['Still in orbit', '%LEFT%'],
    ],
    body: 'The first time two whole satellites crashed into each other by accident. A working Iridium phone satellite and a dead Russian military satellite crossed paths almost at right angles. Nobody was steering Kosmos-2251, and the close pass was not flagged as dangerous. Since then operators get warnings of close passes and move their satellites out of the way.',
  },
  kosmos1408: {
    key: 'kosmos1408',
    title: 'Kosmos-1408 destroyed',
    kind: 'Anti-satellite missile test · Russia',
    place: 'About 480 km up',
    when: '2021-11-15T02:50',
    specs: [
      ['Altitude', 'about 480 km'],
      ['Target', 'Kosmos-1408, a 1982 Soviet spy satellite'],
      ['Missile', 'launched from Plesetsk'],
      ['Pieces cataloged', '%CATALOGED%'],
      ['Still in orbit', '%LEFT%'],
    ],
    body: 'Russia hit one of its own dead satellites with a missile. Hours later the seven people on the International Space Station sheltered in their Soyuz and Crew Dragon capsules as the station passed near the cloud. The pieces were low enough to feel the thin upper air, so almost all of them fell back within three years. Since then the US and many other countries have pledged not to run destructive tests like it.',
  },
};
