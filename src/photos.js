// Archive photos for the narrated video only (the page never has them): each one fades in beside the card as its
// line names it, drifts in slowly while it is up, and fades out before the line ends. tools/photos.mjs times them
// to the narration and build.mjs passes them in as window.__PHOTOS; without them this does nothing.
const PHOTOS = (typeof window !== 'undefined' && window.__PHOTOS) || [];
const FADE = 0.6;

const smooth = (x) => x * x * (3 - 2 * x);
const clamp01 = (x) => Math.max(0, Math.min(1, x));

let layer = null;
const els = [];

function build() {
  layer = document.createElement('div');
  layer.className = 'photos';
  for (const ph of PHOTOS) {
    const fig = document.createElement('figure');
    fig.className = 'photo';
    fig.innerHTML = `<div class="photo-frame"><img alt=""></div><figcaption><b></b><span></span></figcaption>`;
    fig.querySelector('img').src = ph.src;
    // every photo is the same size print, cropped around its subject
    fig.querySelector('img').style.objectPosition = ph.pos || '50% 40%';
    fig.querySelector('b').textContent = ph.caption;
    fig.querySelector('span').textContent = ph.credit;
    layer.append(fig);
    els.push(fig);
  }
  document.body.append(layer);
}

export const hasPhotos = PHOTOS.length > 0;

// how far the camera has made room for a photo (0 to 1): it starts a little before the photo fades in and eases
// slower than the fade, so the globe glides aside instead of jumping
const ROOM_LEAD = 1.2;
const ROOM_EASE = 1.4;
export function photoRoom(t) {
  let w = 0;
  for (const ph of PHOTOS) {
    w = Math.max(w, smooth(clamp01((t - ph.a + ROOM_LEAD) / ROOM_EASE)) * smooth(clamp01((ph.b + ROOM_LEAD - t) / ROOM_EASE)));
  }
  return w;
}

export function showPhotos(t) {
  if (!PHOTOS.length) return;
  if (!layer) build();
  PHOTOS.forEach((ph, i) => {
    const el = els[i];
    const op = smooth(clamp01((t - ph.a) / FADE)) * smooth(clamp01((ph.b - t) / FADE));
    if (op <= 0.001) {
      el.style.opacity = '0';
      el.style.visibility = 'hidden';
      return;
    }
    const k = clamp01((t - ph.a) / (ph.b - ph.a));
    el.style.visibility = 'visible';
    el.style.opacity = op.toFixed(3);
    el.style.transform = `translateY(${((1 - op) * 18).toFixed(2)}px)`;
    el.querySelector('img').style.transform = `scale(${(1.02 + 0.06 * k).toFixed(4)})`;
  });
}
