# Gaming-room background replacement pipeline

1. Extract frames, HDR (HLG) -> SDR tonemap: `ffmpeg -i in.mp4 -vf "zscale=t=linear:npl=203,format=gbrpf32le,zscale=p=bt709,tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=rgb24" fr/%04d.png`
2. `matte.py`  – RobustVideoMatting (resnet50 ONNX) temporal alpha mattes -> `alpha/`
3. `bg.py`     – procedural RGB gaming room (LED hex panels, curved ultrawide, glass PC case with RGB fans)
4. `motion.py` + `path.py` – camera motion estimated from the original background, smoothed into a bounded parallax path
5. `comp.py`   – composite: gaming chair, DoF, relight (RGB rim light, monitor key light, light wrap), grade, grain
6. Encode at 30000/1001 fps with the original audio; 4K = lanczos upscale.

## Real-photo variant
- `bg_photo.py` – background from a real photo (Pexels #7858743, free Pexels license: https://www.pexels.com/photo/a-gaming-computer-set-up-7858743/), cropped to portrait with motion margin.
- `comp_photo.py` – compositor tuned for that photo (no drawn chair, DoF blur, pink/blue relight).
