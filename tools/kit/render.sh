#!/bin/bash
# Renders the narrated "Everything we've ever launched" video on this Mac, in 4K at 60 fps, with the narration.
#   ./render.sh                     the whole video into everything-launched-4k60.mp4
#   CUT=social ./render.sh          the 5-minute cut, 1080p60, into everything-launched-5min-1080p60.mp4
#   FROM=0 TO=20 ./render.sh        just a stretch (start and end it in a pause between lines), to time it or review it
#   SCALE=1 ...                     1080p instead of 4K
#   OUTRO=end-logo-4k60.mp4 ...     end with the Protomota logo outro: the last half second of the film dissolves into
#                                   the outro's first frame (it starts on black), and the sound ends with the film
# Needs node, ffmpeg and Google Chrome, and `npm i playwright-core` in this folder. N parts render side by side
# (default 4); each part's log is in parts/. The voice comes from one recording pass: ../narration/clips-pass4 for the
# whole video, ../narration/clips-social-pass1 for the 5-minute cut, which has lines of its own (set CLIPS to use
# another); the narration track is mixed from it whole, and a stretch takes its matching slice of that one track.
# Never mix clips from different passes.
set -e
cd "$(dirname "$0")"
N=${N:-4}
if [ "$CUT" = social ]; then
  CLIPS=${CLIPS:-../narration/clips-social-pass1}
  SCALE=${SCALE:-1}; PAGEF=page-social.html; TIMING=timing-social.json; WAV=narration-social.wav; OUT=${OUT:-everything-launched-5min-1080p60.mp4}
else
  CLIPS=${CLIPS:-../narration/clips-pass4}
  SCALE=${SCALE:-2}; PAGEF=page.html; TIMING=timing.json; WAV=narration.wav; OUT=${OUT:-everything-launched-4k60.mp4}
fi
TOTAL=$(node -e "console.log(require('./$TIMING').total)")
FROM=${FROM:-0}
TO=${TO:-$TOTAL}
# with an outro, the last 2 seconds render as a part of their own, which is the only part re-encoded for the dissolve
BODY=$TO
if [ -n "$OUTRO" ]; then BODY=$(node -e "console.log((+'$TO' - 2).toFixed(3))"); fi
mkdir -p parts
rm -f parts/*.mp4 parts/*.log
for i in $(seq 0 $((N - 1))); do
  A=$(node -e "console.log((+'$FROM' + (+'$BODY' - +'$FROM') * $i / $N).toFixed(3))")
  B=$(node -e "console.log((+'$FROM' + (+'$BODY' - +'$FROM') * ($i + 1) / $N).toFixed(3))")
  CHANNEL=chrome PAGE=$PAGEF node record.mjs "$A" "$B" "parts/p$i.mp4" "$SCALE" > "parts/p$i.log" 2>&1 &
done
if [ -n "$OUTRO" ]; then CHANNEL=chrome PAGE=$PAGEF node record.mjs "$BODY" "$TO" parts/tail.mp4 "$SCALE" > parts/tail.log 2>&1 & fi
wait
for i in $(seq 0 $((N - 1))); do echo "file 'p$i.mp4'"; done > parts/list.txt
EXTRA=0
if [ -n "$OUTRO" ]; then
  # the film's last half second dissolves into the outro, encoded the same way as the parts so they join cleanly
  W=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 parts/p0.mp4)
  OLEN=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUTRO")
  ffmpeg -y -loglevel error -i parts/tail.mp4 -i "$OUTRO" -filter_complex \
    "[1:v]scale=${W%,*}:${W#*,},fps=60,format=yuv420p,settb=AVTB[o];[0:v]settb=AVTB[f];[f][o]xfade=transition=fade:duration=0.5:offset=1.5,format=yuv420p[v]" \
    -map "[v]" -c:v libx264 -preset slow -crf $([ "$SCALE" -gt 1 ] && echo 15 || echo 16) -pix_fmt yuv420p -r 60 -movflags +faststart parts/end.mp4
  echo "file 'end.mp4'" >> parts/list.txt
  EXTRA=$(node -e "console.log((+'$OLEN' - 0.5).toFixed(3))")
fi
if [ ! -f $WAV ] || [ $TIMING -nt $WAV ] || [ "$CLIPS" -nt $WAV ]; then node mix.mjs "$CLIPS" $TIMING $WAV; fi
if [ "$FROM" != 0 ] || [ "$TO" != "$TOTAL" ]; then OUT=${OUT%.mp4}-$FROM-$TO.mp4; fi
LEN=$(node -e "console.log((+'$TO' - +'$FROM').toFixed(3))")
ALL=$(node -e "console.log((+'$LEN' + +'$EXTRA').toFixed(3))")
# the very end fades out with the picture (with an outro, the sound still ends with the film, and silence runs under
# the outro); a stretch keeps its sound exactly as it is in the track
AF="apad"
if [ "$TO" = "$TOTAL" ]; then AF="afade=t=out:st=$(node -e "console.log(Math.max(0, $LEN - 1.8).toFixed(3))"):d=1.6,apad"; fi
# the parts are joined straight into the final file (no separate joined copy), so the disk only needs room for the
# parts and the final once each
ffmpeg -y -loglevel error -f concat -safe 0 -i parts/list.txt -ss "$FROM" -t "$LEN" -i $WAV -map 0:v -map 1:a -c:v copy \
  -af "$AF" -t "$ALL" -c:a aac -b:a 320k -movflags +faststart "$OUT"
ffprobe -v error -show_entries format=duration:stream=width,height,r_frame_rate -of compact "$OUT"
echo "done: $OUT"
