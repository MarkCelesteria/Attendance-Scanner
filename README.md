# Attendance Scanner

Offline-first barcode/QR attendance app. Runs as a static site on **GitHub Pages**
and writes timestamps into a **Google Sheet** through a small Apps Script web app.

- One row per student; one column per session (Morning In, Morning Out, …)
- Fully configurable on first launch (saved in `localStorage`), so one deployment fits any sheet
- Roster (5,000+ students) and unsent scans live in IndexedDB; lookups are in-memory
- Works offline; scans sync automatically when the connection returns
- Installable PWA (Add to Home Screen)

## Project layout

```
attendance-pwa/
├── index.html                 App shell (setup view + dashboard view)
├── manifest.webmanifest       PWA manifest
├── sw.js                      Service worker (must stay in the root for scope)
├── css/
│   ├── base.css               Tokens, reset, layout, reduced-motion
│   ├── components.css         Buttons, inputs, top bar, sync pill, toast
│   ├── setup.css              Setup screen
│   └── dashboard.css          Session toggle, scanner, result card, manual entry
├── js/                        ES modules (no build step)
│   ├── main.js                Entry point: events + first view
│   ├── constants.js           Storage keys and tunables (FPS, batch size, …)
│   ├── state.js               Shared state object
│   ├── utils.js               DOM helper, column letters, ID normalising, toast
│   ├── db.js                  IndexedDB: roster + pending queue
│   ├── config.js              localStorage config + form validation
│   ├── roster.js              Roster download
│   ├── ui.js                  Rendering: sessions, sync pill, result card
│   ├── scanner.js             Camera (html5-qrcode)
│   ├── scan.js                ID handling (camera + manual)
│   ├── sync.js                Batched upload + retry
│   ├── audio.js               Success/error beeps
│   ├── dashboard.js           Dashboard view
│   └── setup.js               Setup view, reset, roster refresh
├── assets/icons/              PWA icons
├── backend/apps-script/
│   ├── Code.gs                Google Apps Script web app (doGet / doPost)
│   └── appsscript.json        Apps Script manifest (for clasp users)
├── docs/
│   ├── DEPLOYMENT.md          Step-by-step deployment
│   └── ARCHITECTURE.md        Data flow and API contract
└── tests/backend.test.js      Backend tests (no dependencies)
```

## Quick start

1. Set up the sheet and Apps Script → [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#1-google-sheet--apps-script)
2. Publish to GitHub Pages → [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#2-github-pages)
3. Open the site, enter your settings, install it on the phone

Local preview: `npx serve .` (camera access needs HTTPS or `localhost`).

## Configuration

| Setting | Example | Notes |
|---|---|---|
| Web App URL | `https://script.google.com/macros/s/…/exec` | From the Apps Script deployment |
| Access key | `my-secret` | Optional; must match the `ACCESS_KEY` script property |
| Sessions | `Morning In, Morning Out` | Order = column order |
| Column letters | A / B / C / D | ID / Name / Program / Year |
| First timestamp column | `E` | 4 sessions → E, F, G, H |
| Sheet tab, first student row | blank, `2` | Advanced |

## Tests

```
npm test
```

Runs the Apps Script code against a fake spreadsheet (roster read, writes, duplicates, unknown IDs/sessions).

## Tuning

Edit `js/constants.js` (scan FPS, cooldown, sync interval, batch size). After changing any file, bump `VERSION` in `sw.js` so installed copies update.
