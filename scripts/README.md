# S3 Media Conversion Script

`convert-s3-media.ts` downloads photos and videos from your S3 bucket, converts them to smaller sizes while **preserving metadata** (EXIF date, location), and uploads copies to a separate prefix. Originals are left untouched so you can delete them from the admin after confirming.

## Supported formats

- **Images:** `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`, `.heic` → resized (max 1920px) JPEG/PNG with EXIF preserved
- **Video:** `.mp4`, `.mov` → re-encoded with H.264/AAC, metadata preserved

## Requirements

- Node 18+
- **ffmpeg** in `PATH` (for video conversion)
- npm deps: `sharp`, `heic-jpg-exif` (installed with the project)

## Environment

Use the same AWS env as the app (e.g. from `.env` or Vercel):

- `AWS_ACCESS_KEY_ID_DYNAMO`
- `AWS_SECRET_ACCESS_KEY_DYNAMO`
- `AWS_REGION` (default `us-west-1`)
- `S3_BUCKET_NAME`

Optional:

- `S3_SOURCE_PREFIX` – only list objects under this prefix (default: root)
- `S3_PROCESSED_PREFIX` – upload converted files under this prefix (default: `processed/`)

## Usage

From the project root:

```bash
# See what would be converted (no uploads)
npm run convert-media:dry

# Optional: limit to a prefix
npx tsx scripts/convert-s3-media.ts --dry-run --prefix=uploads/

# Run for real (download, convert, upload to processed/)
npm run convert-media
```

After running, check the `processed/` prefix in S3 or in the admin (use `?prefix=processed/` when loading photos). Once you’re happy, delete the originals via the admin “Delete selected from S3” or in the S3 console.

## Delete live-photo .mp4 companions

`delete-live-photo-mp4.ts` removes `.mp4` and `.mov` files that are the video part of a live photo when a matching `.jpg`/`.jpeg` exists (same path and base filename). Use this to clean up duplicate live video clips after converting the .heic to .jpg.

Same env as above. From project root:

```bash
# See which .mp4/.mov would be deleted (matching .jpg/.jpeg by name)
npm run delete-live-mp4:dry

# Optional: limit to a prefix
npx tsx scripts/delete-live-photo-mp4.ts --dry-run --prefix=Photos with Emily/

# Actually delete those .mp4/.mov objects
npm run delete-live-mp4
```

## Rebuild date-media index

`build-date-media-index.ts` scans the `processed/` prefix, extracts EXIF dates from each photo/video, and builds a JSON index (`processed/date-media-index.json`) mapping dates to media URLs. This speeds up the admin photo list API.

**Rebuild the index after:**
- Converting files (new URLs in `processed/`)
- Deleting files (removed entries)
- Any bulk changes to the `processed/` prefix

Same env as above. From project root:

```bash
# Preview what would be indexed (no upload)
npm run build-index:dry

# Actually build and upload the index
npm run build-index
```

## Prune date-media index (faster alternative)

`prune-date-media-index.ts` reads the existing index and removes entries for files that no longer exist. **Much faster** than rebuilding the entire index if you've only deleted files.

Use this after:
- Deleting live photo .mp4/.mov files
- Any selective deletions

```bash
# Preview what would be removed (no upload)
npm run prune-index:dry

# Actually prune and upload the cleaned index
npm run prune-index
```

The index is used by `/api/admin/photos` when `?source=processed` (default) to avoid re-reading EXIF for every request.

## Called by the valentine app

Conversion is **not** run on Vercel (it needs ffmpeg and longer runtime). The admin UI shows the command to run locally. To point the app at converted media only, use the same bucket with the `processed/` prefix (e.g. set `S3_SOURCE_PREFIX=processed/` for the photos API or list with `?prefix=processed/`).
