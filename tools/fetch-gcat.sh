#!/bin/bash
# Downloads the four GCAT files the bake reads into gcat/ (or the folder given): satcat.tsv and psatcat.tsv from
# GCAT's cat/ folder, currentcat.tsv and launchlog.tsv from derived/. GCAT is by Jonathan McDowell, CC BY 4.0
# (https://planet4589.org/space/gcat/web/intro/ack.html). If planet4589.org is unreachable from your network, the daily
# mirror at https://github.com/sizhewang25/jonathon-space-archive (data/) has the same files: point GCAT= at it.
set -e
OUT=${1:-gcat}
BASE=https://planet4589.org/space/gcat/tsv
mkdir -p "$OUT"
for f in cat/satcat.tsv cat/psatcat.tsv derived/currentcat.tsv derived/launchlog.tsv; do
  echo "$BASE/$f"
  curl -fsSL --retry 3 -o "$OUT/$(basename $f)" "$BASE/$f"
done
sed -n 2p "$OUT/satcat.tsv"
