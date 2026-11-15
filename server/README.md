# Gold Rail — TikTok LIVE comment relay

Small Node.js service. It reads the public comments of a TikTok LIVE by **@username**, using the unofficial
[`tiktok-live-connector`](https://www.npmjs.com/package/tiktok-live-connector) and Euler Stream signing. It then
pushes them to the عربة الذهب Android app over a WebSocket. No TikTok password or cookie is used.

```
TikTok LIVE ──(unofficial webcast protocol)──▶ relay ──WebSocket JSON──▶ phone app
```

## Deploy from a phone (Render, free)
See [`../docs/LIVE_GUIDE.md`](../docs/LIVE_GUIDE.md) §3.

| Setting | Value |
|---|---|
| Root directory | `server` |
| Build | `npm ci --omit=dev` |
| Start | `node src/server.js` |
| Env | `ACCESS_TOKEN` (required, your own secret), `EULER_API_KEY` (optional) |

There is also a `render.yaml` blueprint at the repo root and a `Dockerfile` (works on Railway, Fly.io, Koyeb and similar hosts).

## API
- `GET /health` → `{"ok":true,...}`
- `WS /ws?user=<username>&token=<ACCESS_TOKEN>` → messages:
  - `{"t":"status","state":"connecting|connected|offline|reconnecting|error","msg":"..."}`
  - `{"t":"chat","id":"...","u":"uniqueId","n":"nickname","a":"https://avatar","c":"comment","ts":1700000000000}`
  - `{"t":"viewers","n":123}`
  - client may send `{"t":"ping"}` → `{"t":"pong"}`

There is one upstream TikTok connection per creator, shared by all clients. If the creator is offline the relay
retries every 20 s, and it keeps the room open for 60 s after the last client leaves.

## Tests
```
npm test                  # unit + integration (fake TikTok upstream)
node test/e2e-app.mjs     # full app ⇄ relay test in Chromium (needs playwright)
```

## Risks
TikTok has no official API for LIVE comments. This relies on a reverse-engineered protocol: it may break when
TikTok changes things, may be rate-limited or blocked from datacenter IPs, and may conflict with TikTok's terms.
