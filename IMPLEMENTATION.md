# Implementation report — 19 October 2026

## Built

Explore adds a separate compass entry in the header and five distinct review experiences: Scrapbook, Night Sky, Story River, Listening Room and Lucky Dip. They reuse the current profile’s stored moments and private media handling. An isolated fictional sample collection lets the owner assess every style immediately. Current local checks pass: TypeScript, production build, 30 unit/persistence tests and 18 browser scenarios, including all five views, a 72-record collection, Back navigation, profile/deletion filtering and voice playback. Capture has direct Photo and Video actions, a separate Gallery picker for existing photos/videos, and direct Voice clip recording; existing audio imports remain in Files. Microphone permission delay/denial is covered. See [EXPLORE.md](EXPLORE.md) for interactions, paging and sample boundaries.

The header title switches profiles through a keyboard-accessible dropdown, waiting for durable draft writes and guarding unfinished voice recordings. Tags use one horizontal chip row below the search box. The retrospective-date pill expands within the same surface with reduced-motion support. Draft photos use a two/three-column thumbnail grid with removal controls; private retrieval and full review/download behaviour remain available for saved records.

A functioning React/TypeScript/Vite PWA with three static profile entrypoints, separate manifests/icons and one isolated service worker. Capture goes directly to a warm mobile interface. Text, images, native video selection/capture, integrated audio recording and PDF/DOCX/TXT attachments persist locally before Save acknowledges success.

Implemented IndexedDB drafts, account-partitioned moments/media, shared canonical tags, profile-specific derived usage ranking, recent date groups, on-demand private media playback/download, editing, recoverable deletion and durable delayed cleanup. Firebase SDK transactions provide revision conflicts and idempotent operation acknowledgements. Metadata is visible before all media finishes. Account-bound upload metadata adds a rules check against uploading an old account’s queue under a new account.

Cloud metadata changes are paginated by server commit time so old event dates, offline delays and device clocks do not hide corrections/deletions. Media remains in IndexedDB, never localStorage or the app-shell cache. Photos are re-encoded to remove EXIF, and the original phone file is untouched.

Weekly local snapshots use content-addressed objects, with JSON export, media ZIP export, ZIP restore and a separate resumable desktop cloud backup script. Build/deployment automation and owner setup/security/recovery/Android guidance are included.

## Verification completed

| Evidence                                                                   | Result                                            |
| -------------------------------------------------------------------------- | ------------------------------------------------- |
| TypeScript strict check                                                    | Passed                                            |
| Domain, IndexedDB, tag, backup, sync scheduling and mocked-transport tests | 27 passed                                         |
| Firestore/Storage emulator regression scenarios                            | 19 passed                                         |
| Desktop Chrome browser/PWA scenarios                                       | 6 passed                                          |
| Actual Firebase SDK through local Auth/Firestore/Storage emulators         | 1 end-to-end scenario passed                      |
| Production build and generated static entrypoints/manifests/icons          | Passed                                            |
| Desktop backup/export script                                               | Syntax checked; live execution unverified         |
| Visual inspection                                                          | Mobile capture screenshot inspected at 390 CSS px |

The SDK scenario uses two distinct authenticated household accounts, uploads/retrieves a private PDF, makes concurrent online/offline edits, reviews a conflict, retains both versions and confirms sync. This is actual SDK/emulator traffic, separate from the deterministic mocked-transport tests.

Browser tests cover text save/reset, tag creation and keyboard selection, retrospective editing, durable drafts across reload, offline PDF capture, explicit quota failure retaining the capture, photo optimisation/thumbnails, multiple files, real MediaRecorder capture with Chrome’s fake microphone, a valid generated WebM video and playback metadata after reopening, independent profile drafts, direct static URLs, production offline shells and untouched cache names belonging to the older apps. This is desktop Chrome evidence; physical Android acceptance remains outstanding.

Security tests preserve shopping list/pantry/purchases/catalogue/usage-cycle operations, calendar phrase/history operations, and membership restrictions. They also reject anonymous/non-member traffic, author spoofing, invalid object paths, stale edits, executable MIME uploads and actual oversized media, and exercise six-attachment creates/edits within the Firestore rule budget.

## Live integration evidence

- Read the requested GitHub repository source snapshots; reused their public Firebase config and named-app persistence pattern.
- The GitHub connector identifies the signed-in account as `fishdawg90`.
- The owner created `fishdawg90/family-moments`; the application and owner-verified bucket configuration have been pushed to `main`.
- The owner confirmed the bucket `la-spesa-5cc7a.firebasestorage.app`, published the Storage and combined Firestore rules, and configured CORS. The supplied live Firestore rules matched the existing shopping/calendar clauses retained by the combined file.
- Live CORS preflight confirms `https://fishdawg90.github.io`, GET/HEAD and the configured 3600-second expiry. The actual Firebase SDK download endpoint accepts its authentication headers. An unauthenticated Firebase Storage listing returns HTTP 403.
- GitHub Pages is enabled with GitHub Actions. The first hosted run exposed a save-during-sync timing bug; a coalescing scheduler and three regression tests fix it without weakening the browser checks. The [replacement run](https://github.com/fishdawg90/family-moments/actions/runs/39319338159) passed every verification step and deployed successfully.
- All three live profile entrypoints, manifests and the scoped service worker return HTTP 200. A fresh desktop Chrome session cached the deployed assets and reopened each profile's sign-in shell offline with the correct profile title. This verifies the live shell, not an authenticated family-data transfer.
- No live authenticated family-record writes, live attachment uploads, billing modifications or physical two-phone acceptance are claimed.
- Existing shopping/calendar remote repositories and live deployments were left unchanged.

## Owner/access-dependent steps

Repository creation, the owner-verified bucket default, owner-published security rules, CORS configuration, Pages deployment and live offline-shell verification are complete. Confirm a billing budget alert, then test authenticated media transfer and install each phone’s shortcuts using [SETUP.md](SETUP.md) and [ANDROID-CHECKLIST.md](ANDROID-CHECKLIST.md). The older repositories still need coordinated combined-rules copies before they next deploy Firebase rules.

The verified live URLs are:

- https://fishdawg90.github.io/family-moments/giulia/
- https://fishdawg90.github.io/family-moments/nina/
- https://fishdawg90.github.io/family-moments/me/

## Limits and remaining work

- The weekly snapshot is in the same browser storage and runs while open/foregrounded; it is not an independent unattended backup. Complete independent ZIPs must be exported. Browser ZIP limit is 250 MB; larger cloud exports use the desktop script. Managed project backups and desktop restore tooling are not provisioned.
- Six attachments per moment, chosen after emulator checks against Firestore’s hard rule-expression budget. Per-format limits are 15 MB images, 100 MB videos, 25 MB audio and 20 MB documents.
- Android-specific camera/microphone/keyboard behaviour and three separate installations/shortcuts still require physical testing. Distinct identity and routing are implemented, but device installation UX varies.
- Media is retained locally in version 1; storage grows until an owner exports/manages it. Weekly snapshot retention/compaction has no UI yet. Captures that never reach cloud remain vulnerable to device loss; quota/pending warnings and exports are provided.
- Metadata-only synchronisation may page through the household catalogue on first use. Recent rendering is bounded to batches, and media is loaded only on opening an entry. More advanced timelines/search are deferred.
- Sharing an unlocked browser is outside the local account-separation privacy boundary. No browser-storage encryption or immediate offline membership-revocation guarantee is claimed.
- The production bundle includes the Firebase SDK (about 280 KB gzipped JavaScript at this build); Vite emits a size advisory. All assets are cached for subsequent offline launches.
- The live console rules must be compared before deployment; repository inspection alone cannot prove the active ruleset. The older repositories need their combined-rules copies coordinated before future Firebase rule deployments.

See [FUTURE.md](FUTURE.md) for the remaining roadmap.
