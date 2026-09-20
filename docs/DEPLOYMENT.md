# Deployment

## 1. Google Sheet + Apps Script

1. Create a Sheet. Row 1 = headers, students from row 2:
   `Student ID | Name | Program | Year Level | (session columns…)`.
2. **Extensions → Apps Script**. Replace `Code.gs` with `backend/apps-script/Code.gs`, then save.
3. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Authorize when prompted, then copy the URL ending in `/exec`.
5. Optional access key: **Project Settings → Script properties → Add** `ACCESS_KEY`.
6. After editing the script later: **Deploy → Manage deployments → Edit → New version**
   (saving alone does not update the live URL).

`backend/apps-script/appsscript.json` is included for [clasp](https://github.com/google/clasp) users; it is not needed for copy-paste.

## 2. GitHub Pages

1. Create a repo and push this folder's contents (the `backend/`, `docs/` and `tests/` folders are harmless to publish).
2. **Settings → Pages → Source: Deploy from a branch → `main` / `(root)`**.
3. Wait ~1 minute. The site is at `https://<user>.github.io/<repo>/`.

```bash
git init
git add .
git commit -m "Attendance scanner"
git branch -M main
git remote add origin https://github.com/<user>/<repo>.git
git push -u origin main
```

## 3. First launch

1. Open the site on the phone **while online**.
2. Enter the Web App URL, sessions and column letters, then **Save and download roster**.
3. **Add to Home Screen** to install. After that it opens offline.

## Updating

Change files, bump `VERSION` in `sw.js`, push. Devices fetch the update in the background and apply it on the next launch.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "The script did not return data" | Redeploy as Web App with access **Anyone**; use the `/exec` URL |
| "Invalid access key" | App key must equal the `ACCESS_KEY` script property |
| Camera won't start | Needs HTTPS (GitHub Pages is) and camera permission |
| Scans skipped: ID/session not found | Roster is stale (refresh it) or session names changed |
| Changes not showing | Bump `VERSION` in `sw.js`, reload twice |
