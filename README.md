# Family Moments

A private, mobile-first React/TypeScript PWA for Giulia, Nina and My Moments. IndexedDB is the source of truth for capture; Firebase is the shared copy. This is an implementation with working local persistence and authenticated SDK synchronisation, not a visual mock-up.

## Run locally

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://127.0.0.1:5173/family-moments/giulia/`. Sign in with an existing household account. Initial membership verification requires internet. Local development is a different origin from GitHub Pages, so the Pages sign-in session will not transfer to localhost.

Copy `.env.example` to `.env.local` and set `VITE_FIREBASE_API_KEY` to the Firebase web key for local live authentication. The verified Storage bucket is already the default. `.env.local` is ignored by Git. Production builds require the key and read it from the `FIREBASE_WEB_API_KEY` GitHub Actions secret; pull-request build checks use a dummy key and do not deploy. No literal live key is kept in the current tracked source.

The Firebase web SDK necessarily includes the supplied key in the browser bundle. A build secret keeps it out of the source file, but does not turn it into a server-side credential. Firebase Authentication and security rules protect the records and files. Historical commits may still contain the earlier literal key; moving it to an environment variable does not revoke it or erase history.

## Owner handover

Follow [SETUP.md](SETUP.md) for the remaining repository, billing, bucket, CORS and deployment steps. See [IMPLEMENTATION.md](IMPLEMENTATION.md) for verified evidence and limitations, [BACKUP.md](BACKUP.md) for recovery, and [ANDROID-CHECKLIST.md](ANDROID-CHECKLIST.md) before using this for irreplaceable memories.

Planned production entrypoints (deployment has not yet been verified):

- https://fishdawg90.github.io/family-moments/giulia/
- https://fishdawg90.github.io/family-moments/nina/
- https://fishdawg90.github.io/family-moments/me/

Each is a real generated static directory, with a distinct manifest ID, start URL, scope, colour and 192/512px PNG icons. One shared service worker caches all three directories and build assets, scoped exclusively to `/family-moments/`.

## Verify

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:browser
# Java 21 is required for the local Firebase emulators:
pnpm test:rules
pnpm test:cloud-browser
```

The rules and cloud-browser commands use only `demo-family-moments` emulators. They do not deploy or write to the live Firebase project. CI uses Node 22 and Java 21. Playwright uses an installed Chrome/Edge on Windows, or its Chromium on Linux.

## Important operating details

- Saving is acknowledged only after the IndexedDB transaction commits. Media bytes are stored before they can be attached to a moment. Quota failures retain the editable capture.
- Accounts partition moments, tags, drafts, Blobs, backups and cleanup jobs. The actor UID is separate from the selected profile.
- Cloud metadata is committed before attachment uploads. Missing media remains visibly pending. Each completed upload is acknowledged separately. Stable UUIDs, content hashes, transaction operation IDs and revisions make retries idempotent.
- Conflict review offers this phone’s version, the other parent’s version, or both as separate records.
- Deleted records are tombstones. Cleanup jobs wait seven days, confirm current cloud references and retry when the originating account next opens the app. Local files are retained.
- Six attachments per moment; photo input up to 15 MB, video 100 MB, audio 25 MB, documents 20 MB. Re-encoded photos are JPEG, at most 2048px on their longest edge, without original EXIF metadata. JPEG/PNG/WebP, MP4/WebM/MOV, common audio, PDF/DOCX/TXT are supported. Other image formats require conversion on the phone.
- Tags are shared, canonicalised locally and ranked using saved, non-deleted moments. There are no increment-only usage counters. Search works offline.
- Cloud changes use server commit timestamps, including attachment confirmations. Old event dates and device clocks do not exclude an edit from subsequent sync queries.
- Browsers cannot promise scheduled work while a PWA is closed. Uploads and weekly local snapshots resume when opened or foregrounded.
- No analytics, public sign-up, public media URLs, AI processing or new backend service.

## Structure

- `src/storage.ts`: IndexedDB transactions and account partitions.
- `src/sync.ts`: transport-independent queue, partial progress and cleanup.
- `src/firebase.ts`: named Firebase app, authenticated Storage and Firestore transactions.
- `src/backup.ts`: content-addressed weekly snapshots, ZIP/JSON export and conservative restore.
- `scripts/backup.mjs`: resumable authenticated desktop cloud export for larger collections.
- `scripts/entries.mjs`: static profile entrypoints, manifests, icons and versioned precache.
- `firestore.rules`: complete combined shopping/calendar/memories ruleset.
- `storage.rules`: private media rules with cross-service household membership checks.

Do not deploy an older app’s rules file over the combined ruleset. [Security maintenance](docs/SECURITY.md) explains the coordinated update.
