# Schema version 1

## Cloud

`households/home/moments/{uuid}` contains `id`, stable `profileId`, multiline `text`, `tagIds`, UTC ISO `eventAt`/`createdAt`/`updatedAt`, `createdByUid`, `updatedByUid`, integer `revision`, attachment array, nullable UTC `deletedAt`, `schemaVersion: 1`, and UUID `lastOpId`.

The Firebase transport adds `cloudUpdatedAt` using Firestore’s server timestamp on every document commit or media acknowledgement. It is represented as milliseconds in IndexedDB/exports. Inclusive, paginated queries by this server timestamp catch late offline writes and edits/deletions with old event dates; a durable per-account watermark advances only after all returned metadata is stored. It is not the user-facing event time.

Attachments contain `id`, `kind`, friendly `name`, `mime`, byte `size`, stable Storage `path`, SHA-256 `hash`, and acknowledged `remote` state. Bytes are never placed in Firestore. Objects use `moments/home/{profileId}/{momentId}/{attachmentId}`. There is no dependency on filename extensions for object identity; SDK MIME metadata controls playback/downloads.

`households/home/momentTags/{encodeURIComponent(canonical)}` contains `id`, friendly `label`, and canonical search text. NFKD, accent removal, case folding, punctuation-to-space and collapsed whitespace prevent ordinary duplicate variants. Tags are immutable in version 1, so concurrent create uses the first stored friendly label.

Profiles live in a shared frontend configuration. Existing stable IDs are retained when names change. The schema/rules accept future slug IDs without separate frontends or migrations. Browser route entrypoints/manifests must be regenerated for added profiles. There is no profile-administration UI.

## Local

IndexedDB database `family-moments`, version 1:

- `moments`: `[uid, id]`, value plus base remote revision, stable pending operation ID, sync/conflict/error state and retained remote conflict version. This is the durable outbox, not a second incrementing queue.
- `drafts`: `[uid, profileId]`, text, tags, event time, attachment metadata and optional edited moment ID.
- `media`: `[uid, sha256]`, immutable Blob content. Reused files can share one Blob. Files remain locally retained in this version.
- `tags`: `[uid, id]`, value and pending flag. Pending unused tag creation is allowed; usage is derived only from saved non-deleted moments.
- `cleanup`: `[uid, path]`, moment reference and seven-day earliest cleanup time. Jobs survive restarts, recheck cloud references and wait for local confirmation.
- `backups`: `[uid, snapshotId]`, timestamp and record/media content references.
- `backupObjects`: `[uid, sha256]`, immutable snapshot record JSON or media Blob; unchanged content is not copied into every snapshot.
- `meta`: per-account membership, backup cadence and cloud metadata cursor.

## Transactions and recovery

Media is committed before selection is made durable in the draft. Save validates referenced local media and commits the moment/outbox plus draft reset in one transaction. An abort keeps the draft. Local acknowledgement is separate from Firebase acknowledgement.

Sync first commits pending metadata through an online revision transaction, then uploads and acknowledges attachments individually. A retry recognises `lastOpId`; already confirmed media is skipped, and existing objects with the same hash/size can be reused if an upload finished before a metadata acknowledgement. A later local edit is not replaced by an earlier operation’s acknowledgement.

Pending edits are compared with the latest remote revision. The UI retains both versions on a mismatch. Keeping both creates a new record/attachment identity while retaining the original remote version. Removing a tag changes subsequent derived usage without counter adjustments. Account checks occur before operations and uploads are cancelled on account changes; requests already acknowledged by the server remain the original account’s operations.

Only metadata is paginated/synchronised eagerly. Media loads on demand when opening an entry and is cached in IndexedDB after retrieval. Recent UI rendering advances in batches of 30. The capture screen shows only three compact entries.
