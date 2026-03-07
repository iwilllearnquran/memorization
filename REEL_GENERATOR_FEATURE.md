# Private Reel Generator

This feature adds a private ayah reel generator with:
- Input: `surah`, `ayah`
- Output: HD reel video (`1080x1920`, mp4) + download link
- Branding: `quranquest.com` stamped on poster
- No public app button (hidden page only)

## Files
- Backend service: `scripts/reel_service.py`
- Hidden UI page: `_private/reel-admin.html`
- Python deps: `scripts/requirements-reel-service.txt`
- Output folder: `generated/reels/`
- Background folder: `background/`

## Run
1. Install Python deps:
   `pip install -r scripts/requirements-reel-service.txt`
2. Ensure `ffmpeg` is installed and available in `PATH`.
3. Ensure ImageMagick is installed (required for Wand renderer to match original script style).
3. Set your private token:
   - Windows PowerShell: `$env:REEL_ADMIN_TOKEN="123456789"`
4. Start service:
   `python scripts/reel_service.py`

The service starts by default on:
- `http://127.0.0.1:8787`

## Deploy (Cloud Run)
Use:
- `scripts/deploy_reel_cloudrun.ps1`

Example:
```powershell
.\scripts\deploy_reel_cloudrun.ps1 -ProjectId "myquranquest786" -Region "us-central1" -ServiceName "quran-reel-service"
```

This script:
1. Builds image from `Dockerfile.reel`
2. Pushes to `gcr.io/<project>/<service>:<timestamp>`
3. Deploys Cloud Run with:
   - `REEL_ADMIN_TOKEN`
   - `REEL_USE_REMOTE_INDOPAK=1`

After deploy:
- Put Cloud Run URL into `_private/reel-admin.html` `Service URL` field.

## GitHub Actions Backend (No Always-On Server)
You can generate reels from the same hidden UI using GitHub Actions as backend.

Workflow file:
- `.github/workflows/reel-generate.yml`

UI:
- `_private/reel-admin.html`
- Fill:
  - GitHub Owner
  - GitHub Repo
  - Branch (usually `main`)
  - Workflow file (`reel-generate.yml`)
  - GitHub token
- Click `Generate via GitHub Actions`

Token requirements:
- Private repo: token must have `repo` + `workflow` scopes.
- Fine-grained token: allow Actions read/write and Contents read for this repo.

Result retrieval:
- UI gives you workflow runs page link.
- Open latest run, download artifact (`.mp4` + `result.json`).

## Use (Private Page)
Open:
- `_private/reel-admin.html`

Enter:
- Service URL
- Admin token
- Surah and ayah

Press `Generate Reel`.
The page returns a direct downloadable link to the generated mp4.

## Access Control
Generation and download endpoints are token-protected.

Required token:
- Header: `X-Reel-Token`
- Must match `REEL_ADMIN_TOKEN`

Endpoints:
- `POST /api/reel/generate`
- `GET /api/reel/download/<filename>?token=...`

## Notes
- This implementation intentionally skips progress bars and intro/outro ad clips.
- If Arabic shaping differs by environment, install fonts/system support and keep using the bundled IndoPak/Quran fonts.
- The API response includes `renderer` (`wand` or `pillow`) and `renderer_error` for fallback diagnostics.

## Required Asset Placement
To match your original `daily_quran.py` style, add these files:

1. Background image
- Place at: `background/background_1.jpg`

2. Fonts
- `PDMS_SALEEM_QURANFONTQESHIP_0.ttf` at repo root (already present in your repo)
- `fonts/MONTSERRAT-BOLD.TTF`
- `fonts/Montserrat-VariableFont_wght.ttf`

If `MONTSERRAT` files are missing, the service falls back to available fonts, but exact original look will differ.

You can check missing files from:
- `GET http://127.0.0.1:8787/api/reel/health`
- See `missingAssets` field.
