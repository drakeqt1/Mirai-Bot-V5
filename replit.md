# Mirai Bot V3 Unofficial

A Facebook Messenger chatbot built with Node.js that listens for messages and responds to commands and events via the Facebook Chat API.

## Run & Operate
- **Start**: `node index.js`
- **npm script**: `npm start`
- **Required credentials**: `appstate.json` (Facebook app state array) OR `cookie.txt` (Facebook cookies) must be present in the project root before the bot can log in.

## Stack
- Runtime: Node.js 20
- Facebook API: `stfca` + `@dongdev/fca-unofficial`
- Database: SQLite via Sequelize (file: `Fca_Database/database.sqlite` / `includes/data.sqlite`)
- Image processing: `jimp` (pure JS — canvas npm unavailable due to missing libuuid.so.1)
- AI image generation: Pollinations AI (`https://image.pollinations.ai`) — free, no key
- Music: `msedge-tts` (Microsoft TTS), `play-dl` (SoundCloud streaming), `fluent-ffmpeg`
- Scheduling: `node-cron`

## Where things live
- `index.js` — entry point, auto-restarts `mirai.js` on crash
- `mirai.js` — main bot logic: login, load modules, connect MQTT
- `config.json` — bot settings (prefix, admin IDs, feature flags)
- `fca-config.json` — Facebook API MQTT + browser header options (anti-detect)
- `utils/protection.js` — 12-layer anti-detect PRO system
- `modules/commands/` — 44 bot commands
- `modules/events/` — 3 event handlers (broadcast, join/leave)
- `includes/` — database setup, controllers, event/command handlers
- `languages/` — `en.lang`, `vi.lang`
- `utils/` — logging, utilities, runtime data

## Commands (48 total)
| Command | Description |
|---|---|
| `!eval` / `!exec` | Owner: Execute JavaScript code live |
| `!countdown [sec] [label]` | Live countdown timer with progress bar |
| `!imgsearch [query] [-n]` | Free image search via DuckDuckGo, sends image(s) |
| `!canva news [title]` | Generate STARTCOPE NEWS image (AI-designed, free) |
| `!canva design [prompt]` | Generate custom AI design poster |
| `!canva logo [text]` | Generate professional logo with star icon |
| `!pdf [your prompt]` | Generate custom PDF from ANY text — free for all users |
| `!pdf school/enrollment/clearance/permit/letter [name]` | Generate printable school PDF form |
| `!faceswap` | AI face swap — reply to image + attach face photo (free, HuggingFace AI) |
| `!weather [location]` | Real-time weather image + text + voice (male/female) |
| `!weather video [location]` | Short weather video clip with voice narration |
| `!weather typhoon / bagyo` | Philippines typhoon/LPA tracker via PAGASA |
| `!autofriend on/off/pending` | Admin: auto-accept all Facebook friend requests |
| `!autopost on/off` | Admin: auto-post every 51 min to GC, 24/7 |
| `!automor on/off` | Admin: dual-cycle — news+image every 10min, video every 4min |
| `!broadcast` | Event: auto Jesus messages to all GCs every ~1 hour |
| `!radio [station/freq]` | Search PH radio stations → streams live 30-sec clip |
| `!spotify [song]` | Search SoundCloud → sends MP3 audio |
| `!createmusic [theme]` | AI generates full song + mood-matched music + voice |
| `!jingle [script]` | MS Neural TTS jingle with echo/reverb |
| `!prayer` | AI-written personal prayer |
| `!verse` | Random Bible verse with reflection |
| `!poem` | AI-written Filipino/English poem |
| `!story` | AI short story |
| `!quote` | Inspirational quote |
| `!motivate` | Motivational speech |
| `!lost` | Message for grieving |
| `!help`, `!ping`, `!uid`, `!prefix`, `!admin`, etc. | Standard bot controls |

## Architecture decisions
- `index.js` wraps `mirai.js` in a child process with up to 5 auto-restarts on crash
- Login supports both `appstate.json` (preferred) and `cookie.txt` (fallback)
- SQLite is used for user/thread/currency persistence — no external DB required
- Commands and events are dynamically loaded from `modules/` at startup
- `!spotify` uses SoundCloud via play-dl (YouTube is blocked by Meta bot detection)
- `!createmusic` detects mood (love/sad/happy/gospel/upbeat) from the theme and generates a matching chord-based background using ffmpeg synth
- Broadcast uses jitter scheduling (±5 min) to avoid Meta pattern detection
- `!automor` now has TWO independent timers: newsTimer (10 min) and videoTimer (4 min)
- `!canva` uses Pollinations AI for image generation (canvas npm unavailable — needs libuuid.so.1)
- `!imgsearch` uses DuckDuckGo unofficial image API (free, no key — VQD token flow)
- `utils/protection.js` v2.0 adds typing simulation, behavior randomizer, session fingerprint

## Anti-Detect Protection PRO v2.0 (utils/protection.js)
- **Keep-alive**: pings Facebook API every ~8 min ± 2.5 min jitter, 4 rotating strategies
- **Friend request guard**: auto-declines all incoming friend requests
- **Suspicious event handler**: marks notifications read, handles unknown event types
- **Checkpoint recovery**: `clearCheckpoint()` clears Facebook scraping warnings
- **Restriction detection**: autopost/automor detect restriction → 30 min backoff + auto-recover
- **Exponential backoff**: up to 30 min on errors
- **Appstate refresh**: every 5 keep-alive ticks and after every post
- **Typing simulation**: `simulateTyping()` sends typing indicator before every message
- **Behavior randomizer**: `startBehaviorRandomizer()` — reads threads, views profiles every 3–10 min
- **Session fingerprint**: per-session stable UA + screen/timezone/language fingerprint
- **User-agent rotation**: 13 real Chrome/Firefox/Safari/Edge/Mobile UA strings
- **Rate limiter**: max 8 sends/minute global throttle
- **Jitter scheduling**: autopost ±8–15 min, automor news ±60–90 sec, video ±30–60 sec
- **Browser headers**: 13 Sec-Fetch/Sec-CH-UA/DNT/Connection headers matching real Chrome 124

## Product
- Responds to commands with a configurable prefix (default: `!`)
- Handles Facebook group events (join/leave notifications)
- Auto-broadcasts Jesus + remembrance messages to all GCs every ~1 hour
- Per-thread autopost toggle (admin): every 51 minutes, non-stop
- AutoMOR dual-cycle: news text+thumbnail every 10 min, video news every 4 min
- PH radio live streaming (30-sec clips), music creation, TTS jingles
- Economy system, user/thread banning, admin controls
- AI image design via Canva command (STARTCOPE NEWS, logos, custom designs)
- Free web image search via DuckDuckGo (no API key)

## User preferences
- Deployment targets: Render.com (recommended), Netlify, Vercel
- `render.yaml`, `netlify.toml`, `vercel.json` config files are present
- replit.md must be kept updated whenever new commands are added

## Gotchas
- Bot will exit immediately if neither `appstate.json` nor `cookie.txt` is present
- `appstate.json` must be a valid JSON array (not a placeholder string)
- Render.com Worker is the best fit — Netlify/Vercel are serverless (not persistent MQTT)
- `appstate.json` and `cookie.txt` are in `.gitignore` — never commit credentials
- `!spotify` uses SoundCloud (not YouTube) — YouTube blocks server IPs
- Radio station streams may go offline; only Home Radio 95.1 and DZRH 666 AM confirmed live
- `canvas` npm package broken (libuuid.so.1 missing) — use `jimp` for all image work
- `!canva` uses Pollinations AI (90s timeout) — slow on first call but works reliably
- `!imgsearch` DuckDuckGo VQD flow can fail on cold start; has retry logic built in

## Pointers
- Deployment configs: `render.yaml`, `netlify.toml`, `vercel.json`
- Language files: `languages/en.lang`, `languages/vi.lang`
- Protection module: `utils/protection.js`
- Pollinations AI: `https://image.pollinations.ai/prompt/{prompt}?width=1080&height=1080&model=flux`
