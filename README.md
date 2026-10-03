# Attendance Scanner

A lightweight, offline-first attendance app for scanning student IDs and writing attendance timestamps to a Google Sheet. The app runs as a static PWA on GitHub Pages and uses a small Google Apps Script backend for secure, sheet-based writes.

Live demo: [markcelesteria.github.io/Attendance-Scanner](https://markcelesteria.github.io/Attendance-Scanner/)

## Overview

This project is designed for educational or workplace attendance tracking where:

- a roster may contain thousands of students
- scans need to work offline on a mobile device
- the app must remain flexible across different sheet layouts
- attendance data needs to be written back to specific tabs and sessions

The app stores roster data and pending scan entries locally in IndexedDB, then syncs them automatically when the connection is available.

## Key features

- Offline-first attendance scanning with IndexedDB queueing
- Works with barcode scanners, QR scans, and manual entry
- Flexible column configuration for any Google Sheet layout
- Supports multiple sheet tabs merged into one roster
- Writes timestamps back to the correct tab for each student
- Session-aware attendance tracking such as Morning In, Morning Out, etc.
- PWA install support for mobile devices
- Admin dashboard with filtering, search, and QR/PDF export
- Automatic retry and sync when the device reconnects

## How it works

1. The app loads the student roster from Google Sheets.
2. Each scan is validated against the roster map in memory.
3. Valid results are queued locally for offline operation.
4. A background sync process sends queued entries to the Apps Script backend.
5. The backend writes the timestamps into the configured session columns.

## Project structure

```text
attendance-pwa/
├── index.html                 App shell for setup and dashboard views
├── manifest.webmanifest       PWA manifest
├── sw.js                      Service worker for offline updates
├── css/
│   ├── base.css               Global styles and layout
│   ├── components.css         Shared UI components
│   ├── setup.css              Setup screen styling
│   └── dashboard.css          Attendance dashboard styles
├── js/
│   ├── main.js                App bootstrap and event wiring
│   ├── constants.js           Configurable constants and limits
│   ├── state.js               Shared app state
│   ├── utils.js               Helpers and normalisation utilities
│   ├── db.js                  IndexedDB roster and queue storage
│   ├── config.js              Setup and localStorage config handling
│   ├── roster.js              Roster fetch and multi-tab merge logic
│   ├── ui.js                  Rendering and dashboard updates
│   ├── scanner.js             Camera scanning integration
│   ├── scan.js                Scan validation and handling
│   ├── scheduler.js           Sync scheduling and background triggers
│   ├── sync.js                Upload and retry logic
│   ├── audio.js               Sound notifications
│   ├── barcode.js             Keyboard/barcode input handling
│   ├── admin.js               Admin dashboard and filters
│   ├── qrpdf.js               QR/PDF export logic
│   ├── dashboard.js           Dashboard view logic
│   └── setup.js               Setup view logic
├── assets/
│   ├── icons/                 PWA icons
│   └── vendor/                Vendored libraries for offline use
├── backend/
│   └── apps-script/
│       ├── Code.gs            Google Apps Script backend
│       └── appsscript.json    Apps Script manifest
├── docs/
│   ├── ARCHITECTURE.md        Data flow and API contract
│   └── DEPLOYMENT.md          Deployment and setup guide
├── tests/
│   └── backend.test.js        Backend validation tests
├── LICENSE
├── package.json
├── README.md
└── sw.js
```

## Getting started

### Prerequisites

- A Google account
- A Google Sheet with student IDs and attendance columns
- A deployed Google Apps Script web app
- GitHub Pages access for the front-end deployment

### 1) Prepare the Google Sheet

Set up your sheet so each student has a row and each attendance session has a column.

Example layout:

- Column A: Student ID
- Column B: Name
- Column C: Program
- Column D: Year
- Column E onward: attendance session columns like Morning In, Morning Out

More detailed setup instructions are available in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

### 2) Deploy the Apps Script backend

- Open the Apps Script files in [backend/apps-script/Code.gs](backend/apps-script/Code.gs)
- Deploy as a web app
- Copy the generated web app URL
- Set script properties such as the access key if required

### 3) Publish the front end

The web front end is static and can be hosted on GitHub Pages.

Recommended local preview:

```bash
npx serve .
```

> Camera-based scanning requires HTTPS or localhost access.

### 4) Configure the app

On first launch, enter the following settings in the setup screen:

- Web App URL
- Access key (if enabled)
- Session names
- Column mapping
- Sheet tab names and first data row
- Optional sound settings

## Configuration reference

| Setting | Example | Notes |
|---|---|---|
| Web App URL | `https://script.google.com/macros/s/.../exec` | Generated by the Google Apps Script deployment |
| Access key | `my-secret` | Optional but recommended for protected switching |
| Sessions | `Morning In, Morning Out` | Order matches the sheet column order |
| ID / Name / Program / Year columns | `A / B / C / D` | Depends on your sheet structure |
| First timestamp column | `E` | Additional sessions continue across columns |
| Sheet tabs | `Tab1,Tab2` | Lets the app merge multiple tabs into one roster |
| First student row | `2` | Commonly the first data row |
| Sound on scan | On / Off | Enables or disables scan feedback |
| Require access key to switch sessions | On / Off | Adds a guard before session switching |

## Development

This project has no build step. It is a plain static web app using ES modules.

Useful commands:

```bash
npm test
npm run serve
```

## Testing

The repository includes backend validation tests for roster reads, duplicate handling, writes, and unknown IDs/session checks.

```bash
npm test
```

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) – data flow, modules, and API contract
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) – setup and deployment instructions

## Tuning

If you need to adjust scan behavior or sync timing, edit [js/constants.js](js/constants.js). After changing any front-end asset, bump the version in [sw.js](sw.js) so installed PWA clients update correctly.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
