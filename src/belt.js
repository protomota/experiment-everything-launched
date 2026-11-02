// The finale's row of ships (src/tour.js uses this; tools can import it on its own to check the timing).
//
// stops: [[words start, name said, ship, words end]] for each ship the narration names, in launch order (from
// tools/narrate.mjs). Each named ship is in the middle of the screen, stopped, from just before its name until its
// words are done ("the first people in orbit," holds Vostok 1 through "orbit"). The row moves only in the quiet
// between one ship's words and the next one's name, always at the same steady speed (v ships a second, easing in and
// out over ramp seconds). The ships launched in between ride past in that move; when there isn't time for all of
// them, the ones that don't fit are left out of the row (the notable ones are kept first), so it never has to rush
// or stop late. Where even one slot at the steady speed won't fit the quiet, that one hop is a little quicker
// (never under hop seconds).
//
// The first ship is the exception: it slides in from off screen while its name starts, not before.
//
// Returns {row: [ship index at each slot], runs: [[start, from slot, to slot, duration]], stops: [[arrive, leave,
// ship, slot]], gone: when the row has run off after the last ship}.
export function planBelt(stops, o) {
  const {v, ramp, pre, trail, hop, enter, land, exit, hold, prefer = () => 0} = o;
  const runTime = (n) => (n >= v * ramp ? n / v + ramp : 2 * Math.sqrt((n * ramp) / v));
  const row = [stops[0][2]];
  const runs = [];
  const out = [];
  // the first ship waits off screen (enter slots to the right) and slides in as its words start ("First Sputnik"),
  // reaching the middle land seconds after they start
  let arr = stops[0][0] + land;
  runs.push([arr - runTime(enter), -enter, 0, runTime(enter)]);
  let pos = 0;
  for (let k = 0; k < stops.length; k += 1) {
    const [, , i0, pe] = stops[k];
    if (k === stops.length - 1) {
      const leave = Math.max(arr + hold, pe + 0.3);
      out.push([arr, leave, i0, pos]);
      runs.push([leave, pos, pos + exit, runTime(exit)]);
      return {row, runs, stops: out, gone: leave + runTime(exit), runTime};
    }
    const [ts1, , i1] = stops[k + 1];
    const lo = pe - trail; // may leave from here
    const want = ts1 - pre; // and should be on the next one by here
    const nb = i1 - i0;
    let m = nb;
    while (m > 1 && runTime(m) > want - lo) m -= 1;
    const dur = Math.max(hop, Math.min(runTime(m), want - lo));
    const end = Math.max(want, lo + dur);
    // the ships in between that ride along: the notable ones first, then spread evenly
    const between = [];
    for (let x = i0 + 1; x < i1; x += 1) between.push(x);
    const even = between.filter((x, j) => Math.floor(((j + 1) * m) / nb) !== Math.floor(((j + 2) * m) / nb));
    const pick = between
      .slice()
      .sort((a, b) => prefer(b) - prefer(a) || even.includes(b) - even.includes(a) || a - b)
      .slice(0, m - 1)
      .sort((a, b) => a - b);
    out.push([arr, end - dur, i0, pos]);
    runs.push([end - dur, pos, pos + m, dur]);
    row.push(...pick, i1);
    pos += m;
    arr = end;
  }
  return null;
}
