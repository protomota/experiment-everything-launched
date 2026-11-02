# Everything we've ever launched

Every object humans have put into Earth orbit since Sputnik in 1957, more than 69,000 of them, on its orbit around a
3D Earth, with every orbital launch, 81 milestone rockets and spacecraft in 3D, and a narrated 34-minute film made
from the same page.

**Live:** https://protomota.com/experiments/everything-launched

![Everything we've ever launched: a dark Earth wrapped in tens of thousands of orbiting objects](https://protomota.com/experiments/everything-launched/card.png)

A [Protomota](https://protomota.com) experiment by Brad Dunlap. The data is
[GCAT](https://planet4589.org/space/gcat/), Jonathan McDowell's General Catalog of Artificial Space Objects.

## What it does

- **Every cataloged object, on its orbit.** 69,177 objects (as of GCAT's 2 Nov 2026 update), each drawn on an orbit
  with its real size, shape and tilt, appearing on the day it was launched and vanishing on the day it decayed.
  Colors split Starlink, other satellites, rocket stages, debris and discarded parts.
- **Every launch.** 7,433 launches from GCAT's launch log pulse at their launch sites as the timeline passes them
  (red for failures).
- **A guided tour.** On load the page plays a tour from 1957 to today: the date runs fast between milestones and
  stops at each of 81 ships with a spec card (a satellite's card draws its orbit on the globe among everything else
  in orbit, the camera easing out for the high ones; a rocket's or a probe's marks its launch site), then shows the three biggest debris events (Fengyun-1C, Iridium 33 and
  Kosmos-2251, Kosmos-1408) in slow motion, the state of orbit today, how much of it is junk, who launched it all,
  and finally every rocket side by side to scale.
- **Milestone cards with 3D models.** Each card has the launch time and site, specs, what the ship did, and a model
  you can turn. The models come from NASA or are built in code from published dimensions. A large view
  shows the model full screen beside its details, and a button jumps to the ship's own catalog object (its orbit on
  the globe) or to its launch.
- **Search.** Any object by name, satcat number or COSPAR ID, and any launch by payload, rocket or flight. Each
  result opens a card with its orbit drawn to scale, its rocket, launch site and status.
- **Country view.** Objects and launches split by owner: NASA, SpaceX, the rest of the US, Russia and the USSR,
  China, India, Japan, Europe and everyone else.
- **Sources.** A list at the bottom of the page links every data file, every 3D model and the pages behind each
  card's facts. The build fails if a ship has no sources.
- **One file.** The default build is a single offline HTML file (three.js, fonts, data and models inlined).

Positions along each orbit are illustrative. GCAT gives each object's perigee, apogee and inclination, so the size,
shape and tilt of every orbit are real; the orientation of its plane and where the object is along it are seeded
per object, because GCAT doesn't carry full orbital elements for every object over time. Satellites launched
together leave in a line and spread round their orbit over 30 days. The first Starlink train is placed along its
orbit so that it crosses the middle of the globe as the tour's Starlink card says "Watch them string out along their
orbit", and is drawn larger, in orange, for that card.

## Quick start

You need Node 18 or newer (developed on Node 22). The baked data is checked in, so building doesn't need GCAT.

```sh
npm install
npm run build            # dist/index.html: one offline file, open it straight in a browser
npm run build:site       # dist/site/: the page plus models/ as separate files, for a web server
python3 -m http.server -d dist/site 8000   # then open http://localhost:8000
```

On the page: drag the globe to turn it, drag the timeline to move through time, press space (or the play button)
to play or pause, and use **Skip the tour** to explore on your own.

Page options, as URL parameters: `?capture` renders the tour frame by frame for video (see `window.SIM`), `?card`
draws the 1200 × 630 share image, and `?clean` hides the text for clean stills.

## Updating the data

```sh
npm run fetch-gcat       # downloads satcat.tsv, psatcat.tsv, currentcat.tsv and launchlog.tsv into gcat/
npm run bake             # writes src/catalog.bin, catalog.json, launches.json, search.txt and src/ships/objects.json
npm run build
```

The bake needs Python 3 (standard library only). If planet4589.org is blocked from your network, the daily mirror at
[sizhewang25/jonathon-space-archive](https://github.com/sizhewang25/jonathon-space-archive) has the same files in
its `data/` folder: run the bake with `GCAT=/path/to/that/data npm run bake`.

The timeline ends on the date of GCAT's update (`endDay` in `src/catalog.json`), so the page never runs past its data.
The narration quotes some numbers in round figures ("more than sixty-nine thousand objects", "almost thirty-four
thousand in orbit"); check them against the new `catalog.json` after a bake.

## How it works

**The catalog.** `bake/bake.py` turns GCAT's satellite catalog into `src/catalog.bin`, a structure-of-arrays binary
(one typed array per field: launch and decay day, perigee, apogee, inclination, category, owner group, seeds) and
`src/catalog.json` (counts, field offsets, the debris events, chart data). Dates are days since 1957-01-01 UTC and
distances are kilometres; the scene works in Earth radii. `bake/launches.py` bakes the launch log into
`src/launches.json`, and `bake/search.py` writes the search index, `src/search.txt`, which the page fetches the first
time someone searches. `bake/who.py` maps GCAT's owner and agency codes to the Country view's groups.

**Drawing.** `src/orbits.js` decodes the catalog and holds the orbit math; the same math runs in a shader, so all
69,000 objects move on the GPU and the CPU only aims the camera. `src/prepare.js` adds two things the catalog can't
give: breakup clouds start where the broken object was (every fragment's orbit passes through the parent's position at
the moment of the breakup), and satellites from one launch leave in a line and spread around their orbit over the
following weeks. `src/earth.js` draws a dark Earth from Natural Earth coastlines with no photo texture, so it stays
crisp at 4K. `src/launches.js` draws the launch pulses.

**The tour.** `src/tour.js` defines the tour as pure functions of tour time: a list of beats (`PLAN`: a ship card,
a breakup, today, the junk and who charts, the rocket lineup), each with its camera moves, the date at every moment
and what is on screen. Because nothing depends on wall-clock time, the page and the video renderer show exactly the
same thing, and any frame can be rendered on its own.

**The camera.** The globe only ever turns one way on screen, smoothly, never back and forth. Every launch and breakup
shot lets the ground under the camera slip west slowly with its site (or the breakup's orbit) in view, and a plan
(dynamic programming over where each site starts in the frame and how fast it drifts) keeps the forward turns between
sites as short as they can be. Moves blend in bearing and elevation, never along a straight arc that could pass over
a pole, and a long swing round the globe takes longer than the gap between beats, so it never averages more than 90
degrees a second. `PAGE=dist/narrated.html node tools/spincheck.mjs [from] [to]` samples the camera at 30 fps and
lists any stretch where the globe turns backwards, and the fastest swings.

**The ships.** `src/ships/ships.js` holds the 81 ships: launch time and site, specs, text, and which model to show
and how. `src/ships/viewer.js` renders the card's model, the large view and the lineup. NASA models live in
`models/web/`, shrunk from the originals by `tools/models.mjs` (simplified, WebP textures, meshopt). Ships with no
free model (Sputnik 1, Vostok, Shenzhou, Falcon 9, Falcon Heavy, Crew Dragon, Starlink, Starship and others, plus the
Shuttle's tank and boosters) are built in code in `src/ships/build.js`. `src/ships/events.js` has the three debris
event cards, and `src/ships/objects.json` (from `tools/milestone-objects.mjs`) links each card to its catalog object
or launch. `src/sources.js` lists every source.

**The page.** `src/main.js` wires it together (globe, timeline, cards, search, Country view, charts), with
`src/index.html` and `src/style.css`. `build.mjs` bundles it with esbuild into one file.

## Project layout

```
bake/            GCAT -> src/ data (bake.py, launches.py, search.py, who.py)
build.mjs        bundles the page (dist/index.html, or dist/site/ with SITE=1)
models/web/      NASA 3D models, shrunk for the web (models/nasa/ originals are not checked in)
narration/       the narrated film: script, recording, the voice clips and timing
src/             the page: main.js, tour.js, orbits.js, prepare.js, earth.js, launches.js, find.js, belt.js,
                 index.html, style.css, and the baked data
src/ships/       ships.js (the 81 ships), build.js (ships built in code), viewer.js, events.js, objects.json
tools/           models.mjs, milestone-objects.mjs, narrate.mjs, record.mjs, card/still/shot/live (screenshots),
                 fetch-gcat.sh, mv/ (model contact sheets), kit/ (the render kit)
```

## Adding a milestone ship

1. Add an entry to `src/ships/ships.js`: `key`, `when` (UTC launch time), `title`, `kind`, `site` (a key of
   `SITES`), `specs`, `body` and `model` (`src` is a file in `models/web/` or `build:<name>` for a ship built in
   `src/ships/build.js`; `size` scales it to its real dimension; `view` is the card's starting angle).
2. For a NASA model, put the original in `models/nasa/` and run `node tools/models.mjs <name>`.
3. Add its sources to `SHIPS` in `src/sources.js` (and the model to `MODELS` if it's NASA's). The build stops if a
   ship has no sources.
4. Add a `['ship', '<key>', seconds]` beat to `PLAN` in `src/tour.js`, in launch order.
5. Run `node tools/milestone-objects.mjs` so its card can jump to its orbit or launch (`PICK` and `NONE` at the top
   fix the matches it gets wrong).

## The narrated film

The page doubles as the source of a narrated film: the tour plays with one narration line per beat, timed so each
picture lands on its words.

- `narration/script.py` writes `narration/script.json`: one line per beat, with `say` respellings where the voice
  needs help with a name, and for the finale, `marks` that tie each ship in the closing lineup to the words that
  name it.
- `narration/record_pass.py` records the whole narration with ElevenLabs text-to-speech (premade voice "Bill",
  `eleven_multilingual_v2`), every line in order and each stitched to the ones before it, so the read sounds like
  one session: `ELEVENLABS_API_KEY=... python3 narration/record_pass.py clips-passN`. It saves `NN-key.mp3` and
  `NN-key.json` (the character alignment) per line. Change any line and you record the whole pass again; clips from
  different passes are never mixed. The current pass is `narration/clips-pass4`. The 5-minute cut has lines of its
  own (`narration/script-social.json`: an opening line, the lineup first, a closing line), recorded as a pass of their
  own: `python3 narration/record_pass.py clips-social-pass1 narration/script-social.json`.
- `NOMIX=1 node tools/narrate.mjs narration/clips-pass4` fits each beat to its line and writes
  `narration/timing.json` (drop `NOMIX` to also mix `narration/narration.wav`). Some clips end with a short click
  after the last word; each cue's `cut` is where its clip's speech ends, and the mix stops the clip there with a
  40 ms fade (the clip itself is never edited or joined to another). The finale's timing comes from the
  lineup line's alignment, and `src/belt.js` plans the row of ships so each named ship is centred and still for all
  of its words. The 5-minute cut:
  `SCRIPT=narration/script-social.json KEYS=open,lineup,sputnik1,vostok1,apollo11,iss,starlink,jwst,starship,today,junk,close NAME=social GAP=1.4 NOMIX=1 node tools/narrate.mjs narration/clips-social-pass1`.
- `NARR=narration/timing.json node build.mjs` writes `dist/narrated.html` (and `timing-social.json` gives
  `dist/narrated-social.html`).

**Rendering.** Frames are deterministic, so ranges render independently and join cleanly:
`node tools/record.mjs <from s> <to s> <out.mp4> [scale]` (scale 2 is 4K; `FPS=30` and scale 0.6667 make a quick
720p review copy; `PAGE=dist/narrated.html` for the narrated timing). It needs ffmpeg and Playwright
(`npm i -D playwright && npx playwright install chromium`). Software rendering is slow; for the final film,
`tools/kit/` is a render kit for a Mac with Google Chrome: copy the two narrated pages in as `page.html` and
`page-social.html` with their timing files, run `npm i playwright-core` there, then `./render.sh` (4K60) or
`CUT=social ./render.sh` (1080p60). It renders four parts side by side with the GPU and mixes the narration track
from the clips.

## Deploying to protomota.com

```sh
GA_ID=G-DRL62HKS7W GA_SCRIPT=/analytics.js npm run build:site
```

Copy `dist/site/` into the protomota-com repo at `public/experiments/everything-launched/` (keep its `card.png`).
Without `GA_ID` the site build has no analytics; with `GA_ID` alone the page configures Google Analytics itself.

## Credits and licenses

The code in this repository is released under the [MIT License](LICENSE). Some of what it ships with comes from
others, under their own terms:

| What | Source | Terms |
| --- | --- | --- |
| Catalog and launch data, and the files baked from it (`src/catalog.*`, `src/launches.json`, `src/search.txt`, `bake/*.json`) | [GCAT](https://planet4589.org/space/gcat/) by Jonathan C. McDowell | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/): credit GCAT and its author ([acknowledgement](https://planet4589.org/space/gcat/web/intro/ack.html)) |
| 3D models in `models/web/` | [NASA 3D Resources](https://github.com/nasa/NASA-3D-Resources); the Opportunity rover is NASA/JPL-Caltech's [Spirit and Opportunity model](https://science.nasa.gov/resource/spirit-and-opportunity-rover-3d-model/) | Free to use under [NASA's media usage guidelines](https://www.nasa.gov/multimedia/guidelines/index.html); don't imply NASA endorsement |
| Coastlines | [Natural Earth](https://www.naturalearthdata.com/) via [world-atlas](https://github.com/topojson/world-atlas) | Public domain (Natural Earth), ISC (world-atlas) |
| Fonts bundled into the page | [Space Grotesk](https://github.com/floriankarsten/space-grotesk) and [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono) via Fontsource | SIL Open Font License 1.1 |
| Libraries | [three.js](https://threejs.org/), [topojson-client](https://github.com/topojson/topojson-client), [esbuild](https://esbuild.github.io/), [glTF Transform](https://gltf-transform.dev/) | MIT, ISC, MIT, MIT |
| Narration recordings in `narration/clips-pass*/` | Generated with [ElevenLabs](https://elevenlabs.io/) (premade voice "Bill") | Included so the film can be rebuilt; not covered by the MIT License |
| The Protomota name and logo (`src/protomota-logo.png`) | Protomota | Not licensed for reuse |

Ships built in code (`src/ships/build.js`) were made for this project from published dimensions and photographs and
are part of the MIT-licensed code. Card text was written for this project; the facts behind it are cited in
`src/sources.js` and on the page.

Thanks to Jonathan McDowell for keeping GCAT open and current, and to NASA for its free 3D models.
