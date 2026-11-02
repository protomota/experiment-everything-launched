#!/bin/bash
# Renders the narrated "Everything we've ever launched" video on this Mac, in 4K at 60 fps, with the narration.
#   ./render.sh                     the whole video into everything-launched-4k60.mp4
#   CUT=social ./render.sh          the 5-minute cut, 1080p60, into everything-launched-5min-1080p60.mp4
#   FROM=0 TO=20 ./render.sh        just a stretch (start and end it in a pause between lines), to time it or review it
#   SCALE=1 ...                     1080p instead of 4K
# Needs node, ffmpeg and Google Chrome, and `npm i playwright-core` in this folder. N parts render side by side
# (default 4); each part's log is in parts/. The voice comes from one recording pass, ../narration/clips-pass3 (set
# CLIPS to use another); the narration track is mixed from it whole, and a stretch takes its matching slice of that
# one track. Never mix clips from different passes.
set -e
cd "$(dirname "$0")"
N=${N:-4}
CLIPS=${CLIPS:-../narration/clips-pass3}
if [ "$CUT" = social ]; then
  SCALE=${SCALE:-1}; PAGEF=page-social.html; TIMING=timing-social.json; WAV=narration-social.wav; OUT=${OUT:-everything-launched-5min-1080p60.mp4}
else
  SCALE=${SCALE:-2}; PAGEF=page.html; TIMING=timing.json; WAV=narration.wav; OUT=${OUT:-everything-launched-4k60.mp4}
fi
TOTAL=$(node -e "console.log(require('./$TIMING').total)")
FROM=${FROM:-0}
TO=${TO:-$TOTAL}
mkdir -p parts
rm -f parts/*.mp4 parts/*.log
for i in $(seq 0 $((N - 1))); do
  A=$(node -e "console.log((+'$FROM' + (+'$TO' - +'$FROM') * $i / $N).toFixed(3))")
  B=$(node -e "console.log((+'$FROM' + (+'$TO' - +'$FROM') * ($i + 1) / $N).toFixed(3))")
  CHANNEL=chrome PAGE=$PAGEF node record.mjs "$A" "$B" "parts/p$i.mp4" "$SCALE" > "parts/p$i.log" 2>&1 &
done
wait
for i in $(seq 0 $((N - 1))); do echo "file 'p$i.mp4'"; done > parts/list.txt
ffmpeg -y -loglevel error -f concat -safe 0 -i parts/list.txt -c copy parts/video.mp4
if [ ! -f $WAV ] || [ $TIMING -nt $WAV ] || [ "$CLIPS" -nt $WAV ]; then node mix.mjs "$CLIPS" $TIMING $WAV; fi
if [ "$FROM" != 0 ] || [ "$TO" != "$TOTAL" ]; then OUT=${OUT%.mp4}-$FROM-$TO.mp4; fi
LEN=$(node -e "console.log((+'$TO' - +'$FROM').toFixed(3))")
# the very end fades out with the picture; a stretch keeps its sound exactly as it is in the track
FADE=""
if [ "$TO" = "$TOTAL" ]; then FADE="-af afade=t=out:st=$(node -e "console.log(Math.max(0, $LEN - 1.8).toFixed(3))"):d=1.6"; fi
ffmpeg -y -loglevel error -i parts/video.mp4 -ss "$FROM" -t "$LEN" -i $WAV -map 0:v -map 1:a -c:v copy \
  $FADE -c:a aac -b:a 320k -movflags +faststart -shortest "$OUT"
ffprobe -v error -show_entries format=duration:stream=width,height,r_frame_rate -of compact "$OUT"
echo "done: $OUT"
