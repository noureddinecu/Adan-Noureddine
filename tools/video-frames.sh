#!/usr/bin/env bash
# Video -> frames tool, so Claude can "watch" a video by looking at its frames.
# Usage: tools/video-frames.sh <video-file-or-URL> [out-dir] [frame-count]
#   - Accepts a local file (mp4, mov, webm...) or a URL (needs yt-dlp + network access to the site).
#   - Writes evenly spaced frames, scene-change frames and one contact sheet (grid) image.
set -euo pipefail

SRC="${1:?usage: $0 <video-file-or-URL> [out-dir] [frame-count]}"
OUT="${2:-video-analysis}"
N="${3:-16}"
mkdir -p "$OUT/frames" "$OUT/scenes"

if [[ "$SRC" =~ ^https?:// ]]; then
  command -v yt-dlp >/dev/null || pip install -q yt-dlp
  yt-dlp -q -f "mp4/best" -o "$OUT/video.%(ext)s" "$SRC"
  SRC="$(ls "$OUT"/video.* | head -1)"
fi

DUR="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$SRC")"
echo "Video: $SRC  duration: ${DUR}s"
ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate -of default=nw=1 "$SRC"

# Evenly spaced frames
for i in $(seq 0 $((N-1))); do
  T="$(python3 -c "print(round($DUR*($i+0.5)/$N,2))")"
  ffmpeg -v error -y -ss "$T" -i "$SRC" -frames:v 1 -vf "scale=480:-2" "$OUT/frames/$(printf '%02d' "$i")_${T}s.jpg"
done

# Scene-change frames (where the picture changes a lot)
ffmpeg -v error -y -i "$SRC" -vf "select='gt(scene,0.3)',scale=480:-2" -vsync vfr "$OUT/scenes/scene_%03d.jpg" || true

# Contact sheet: all evenly spaced frames in one grid image
COLS=4; ROWS=$(( (N + COLS - 1) / COLS ))
ffmpeg -v error -y -pattern_type glob -i "$OUT/frames/*.jpg" \
  -vf "scale=320:-2,tile=${COLS}x${ROWS}:padding=4:margin=4" -frames:v 1 "$OUT/contact_sheet.jpg"

echo "Frames: $(ls "$OUT/frames" | wc -l)  Scene changes: $(ls "$OUT/scenes" | wc -l)"
echo "Contact sheet: $OUT/contact_sheet.jpg"
