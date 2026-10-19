# Backup and recovery

## What happens automatically

Each authorised account gets a local snapshot on its first opening and then when opening/foregrounding the app after at least seven days. There is also a **Create local snapshot now** button. The snapshot is a consistent IndexedDB read of moments, tags, drafts and locally held media.

Snapshots reference immutable SHA-256 content objects. Unchanged records and attachment bytes are stored once across weekly snapshots. A changed record receives a new content hash, while earlier snapshots retain their original reference. Deletion state and pending operations are included. No use-count or increment-only backup cursor is involved.

These backups live in separate IndexedDB stores in the **same browser**. They protect earlier versions from accidental edits, but cannot protect against clearing site data, losing a phone, browser eviction or a failed device. Persistent browser storage is requested; a browser can refuse it. The backup date is visible in Settings. A closed PWA cannot run a reliable weekly job.

## Keep an independent copy

Use **Download media backup (.zip)** in Settings. Online export first retrieves all cloud record pages and merges them without replacing pending local edits. It then includes the current account’s local pending records, tags and drafts plus all referenced attachment bytes, retrieving private cloud files using the authenticated SDK where necessary. Every file is hash-checked. Export fails clearly if media is unavailable; it does not label a partial package complete.

Offline export includes only records already cached on that phone. A local recovery-snapshot ZIP includes its local files and references to cloud files that were not present on that phone. Neither is automatically a complete household backup. The metadata-only JSON export is explicitly **not a media backup**.

Browser ZIPs are limited to 250 MB to avoid excessive memory pressure, particularly on Android. Keep a ZIP on a computer or an independently backed-up folder, rather than solely in the same phone’s Downloads directory. The files are private and unencrypted, so use a protected folder/device or an encrypted archive if sharing the device.

## Larger cloud collections

The desktop command avoids the browser ZIP memory limit:

```sh
node scripts/backup.mjs ACTUAL_BUCKET_NAME C:/path/to/private-family-backup
```

It prompts for an existing household account and a hidden password, verifies membership, pages through all cloud records and retrieves media using the authenticated Firebase SDK. It does not need a service-account key, grant public access or create bearer download URLs.

The script loads the ignored `.env.local` file, or accepts `FIREBASE_API_KEY` / `VITE_FIREBASE_API_KEY` from its process environment. It has no literal web key in its tracked source. Configure the key locally before running it; do not paste it into a committed script or a shell command saved in history.

Media is stored by SHA-256 under `media/`. Existing bytes are hash-checked and reused on subsequent runs, so weekly runs do not duplicate the media. Each run stores its JSON manifest in `snapshots/` and updates `latest.json`. Interrupted downloads can be retried by rerunning the command. Missing files are listed in the manifest and yield exit code 2. Deleted moments’ media may already have been cleaned up; their structured records remain in the manifest. This command exports the cloud copy, so export unsynchronised captures separately from each phone.

This command has been syntax-checked, but **has not been run against the live project**. Its live authentication/download path still needs owner verification after bucket setup.

## Recover from an app ZIP

1. Sign in to the account that exported the ZIP. Account IDs must match.
2. Open Settings → **Restore a backup ZIP**. The app first creates a local recovery snapshot.
3. It verifies attachment hashes and account/path ownership and inserts only missing records and bytes. Existing local moments are kept, so repeated imports do not duplicate them.
4. Inspect Recent Moments and resume pending operations. Conflicts are reviewed explicitly. Refresh the app to load any restored draft.

Restore is deliberately conservative: it does not overwrite newer local/cloud versions wholesale. Saved snapshot versions remain available as downloads. Importing a ZIP restores local data; it does not constitute an administrative restore of an erased Firestore database. For a cloud disaster, preserve the archive and use the owner recovery procedure below rather than repeatedly retrying stale revisions.

## Cloud disaster recovery

For independent project-level protection, the owner should enable a suitable Firestore scheduled backup/PITR policy and a Cloud Storage recovery policy (soft delete/versioning or a separate backup bucket), considering ongoing charges. Check current support and retention options in the project consoles before enabling them. These are not provisioned by this implementation and no managed backups are claimed to exist.

Restore Firestore with its supported owner/admin import or restore tools, restore the corresponding bucket objects with their original paths, then reopen the phones and verify the recovered records and hashes. The desktop JSON manifests retain record IDs, revisions, authors, dates, tags, media hashes and paths needed for a controlled restore. An administrator should test recovery in an isolated project before replacing live data. Keep metadata and media backups from a consistent period together.

No automatic server scheduler has been added. The first-release strategy is local weekly version snapshots, cloud synchronisation and explicit independent exports. Unattended independent backups and a dedicated large-archive restore tool are high-priority follow-ups in `FUTURE.md`.
