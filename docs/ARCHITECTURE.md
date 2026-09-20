# Architecture

## Data flow

```
 camera / keyboard ──► scan.js ──► in-memory Map (roster) ──► ui.js (result card + beep)
                          │
                          └──► IndexedDB queue ──► sync.js ──POST──► Apps Script ──► Sheet
 Sheet ──GET──► roster.js ──► IndexedDB roster ──► in-memory Map
```

- **Roster**: downloaded once (and on demand), stored in IndexedDB, mirrored in a `Map` for O(1) lookups.
- **Queue**: every scan is saved to IndexedDB *before* upload; entries are deleted only after the script acknowledges them.
- **Sync triggers**: after each scan, on the `online` event, every 15 s, and when the tab becomes visible.
- **Stateless backend**: the app sends column layout and session names with each request, so the same script serves any sheet.

## Module dependencies (no cycles)

```
constants, state, utils ◄── db, config, audio ◄── ui ◄── sync ◄── scan, dashboard ◄── setup ◄── main
                                                          scanner ◄──────────────────────┘
```

## API contract

**GET** `?idCol=A&nameCol=B&programCol=C&yearCol=D&firstRow=2[&sheet=Tab][&key=…]`

```json
{ "ok": true, "count": 2, "students": [{ "id": "S001", "name": "Ann", "program": "BSCS", "year": "2" }] }
```

**POST** (`Content-Type: text/plain` to avoid a CORS preflight)

```json
{
  "key": "",
  "config": { "sheet": "", "idCol": "A", "startCol": "E", "sessions": ["Morning In", "Morning Out"], "firstRow": 2 },
  "entries": [{ "qid": 1, "id": "S001", "session": "Morning In", "ts": 1790000000000 }]
}
```

Response: `{ "ok": true, "results": [{ "qid": 1, "status": "written" }] }`
Status values: `written`, `duplicate`, `not_found`, `bad_session`. The script never adds rows.

## Design decisions

- **ES modules, no build step**: deploys as plain files on GitHub Pages.
- **Service worker at the root**: its scope cannot exceed its own folder.
- **Stale-while-revalidate cache**: instant offline start; updates apply on the next launch.
- **Duplicate policy**: first timestamp wins (`OVERWRITE_EXISTING` in `Code.gs` flips it).
