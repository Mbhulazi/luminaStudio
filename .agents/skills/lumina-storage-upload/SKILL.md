---
name: lumina-storage-upload
description: How to work with image storage and uploads in the Lummina Studio backend. Use whenever touching src/services/storage.service.js, src/services/image.service.js, the /api/portfolio/upload route, image normalization/sharp, signed URLs, the Supabase or local storage adapters, or the sourceImageKey/sourceImageUrl fields on PortfolioItem/Analysis. Also use when adding a new storage driver, changing upload limits, or debugging a 400/404 on an upload.
---

# Lummina image storage & uploads

All image handling is server-side (`lumina-backend/src/`). The frontend never talks to storage directly — it uploads via the API and receives back a storage `key` + a short-lived `url`.

## The contract

- **Upload** (`POST /api/portfolio/upload`, multipart, field `image`): returns `{ uploadId (storage key), url, sha256, width, height, mime }`.
- The `uploadId` is then passed to `POST /api/analysis` as `sourceImageKey`.
- Storage is **private by design**. The `url` returned is either a local `/uploads/...` path (dev) or a Supabase signed URL (prod, 24h TTL). Signed URLs expire — never persist the URL as the source of truth, persist the `key`.

## Key files

| File | Purpose |
|---|---|
| `src/services/image.service.js` | `normalizeImage(buffer)` — the single chokepoint. Strips EXIF, caps long edge at 2000px, re-encodes as JPEG q88, rejects non-images and >8MB uploads. Every upload goes through it. |
| `src/services/storage.service.js` | Env-driven adapter (`STORAGE_DRIVER=local\|supabase`). Interface: `uploadImage`, `getSignedUrl`, `getImageBytes`, `deleteImage`. Supabase SDK is lazily `require()`d so dev/test never load it. |
| `src/routes/portfolio.routes.js` | The upload route. multer in memoryStorage, 8MB limit, MIME allowlist (jpeg/png/webp). `UploadError` and `MulterError` bubble as 400. |
| `prisma/schema.prisma` | `PortfolioItem.sourceImageKey` (stable) + `sourceImageUrl` (cache, may expire). `Analysis.sourceImageKey` + `imageHash`. |

## Privacy invariant

Portraits are personal data. `normalizeImage` strips all EXIF (GPS, camera serial, thumbnails) before the bytes ever touch storage. Never bypass it by writing raw uploads to disk, and never log image bytes or sha256 in full (truncate in logs). The `rotate()` before resize honors EXIF orientation so the stripped image still displays upright.

## Adding a new storage driver

The adapter pattern in `storage.service.js`:

1. Implement an object with `uploadImage(buffer, mime, opts)`, `getSignedUrl(key)`, `getImageBytes(key)`, `deleteImage(key)`.
2. Add it to the driver switch in `getDriver()` behind a new `STORAGE_DRIVER` value.
3. `uploadImage` must return `{ key, url, sha256 }` — `key` is the stable identifier, `url` is a freshly-minted readable URL, `sha256` is `crypto.createHash('sha256').update(buffer).digest('hex')`.
4. Keys should be content-addressed (sha prefix) + timestamp + random so re-uploads of the same image create distinct rows but are still dedupe-able via `imageHash`.

## Changing limits

- Max upload size: two places must agree — `multer({ limits: { fileSize: 8MB } })` in the route AND `MAX_BYTES` in `image.service.js`. Change both.
- Max long edge: `MAX_LONG_EDGE` in `image.service.js` (2000). The CV pipeline re-downsamples to 600px internally anyway, so this is a storage/format decision, not an analysis one.
- MIME allowlist: the multer `fileFilter` regex. Add `image/avif` etc. here if needed, and update `mimeToExt` in `storage.service.js`.

## Signed URL refresh

Signed URLs expire (24h for Supabase). When serving stored images:
- For freshly-uploaded images, the `url` from the upload response is fine for the immediate session.
- For historical portfolio items, call `storage.getSignedUrl(item.sourceImageKey)` to mint a fresh URL rather than trusting the cached `sourceImageUrl`.
- The frontend should treat any 403/expired-URL image as "refresh the signed URL" — there's no endpoint for this yet; if you add one, gate it behind `requireAuth` and only return URLs for the caller's own items.

## Debugging upload failures

| Symptom | Cause |
|---|---|
| 400 "No image provided" | No file under the `image` field — check the multipart form on the client. |
| 400 "Only JPEG, PNG, or WebP" | multer `fileFilter` rejected the MIME. |
| 400 "not a valid image" | sharp couldn't decode the buffer (corrupt or spoofed extension). |
| 400 "too large" | Over 8MB. |
| 404 "Source image not found" on analysis | `getImageBytes(key)` failed — the key doesn't exist or (Supabase) the bucket policy is wrong. |
| Tests crash on sharp | sharp's native libvips clashes with vitest parallel workers — keep `pool: 'forks'`, `singleFork: true` in `vitest.config.js`. |

## Test fixtures

Use sharp-generated synthetic images in tests, not tiny 1×1 PNGs (libpng has edge cases on Windows). A 16×16 solid-color PNG works; `tests/routes/upload.test.js` shows the pattern. The analysis tests generate richer synthetic portraits via SVG → sharp.
