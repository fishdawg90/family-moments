import { zip, unzipSync, strToU8, strFromU8 } from 'fflate';
import { accountRange, database, getMedia, listMoments, listTags } from './storage';
import { hashBlob, makeTag, validateCapture } from './domain';
import { STORAGE_BUCKET } from './config';
import type { Attachment, BackupSnapshot, Draft, LocalMoment, LocalTag } from './types';

export async function weeklyBackup(
  uid: string,
  force = false,
  now = Date.now(),
): Promise<BackupSnapshot | undefined> {
  const db = await database(),
    last = (await db.get('meta', `backup-at:${uid}`)) as number | undefined;
  if (!force && last && now - last < 7 * 86400000) return;
  // Take one consistent readonly snapshot before hashing outside the transaction.
  const read = db.transaction(['moments', 'tags', 'drafts', 'media'], 'readonly');
  const [moments, tags, drafts, media] = await Promise.all([
    read.objectStore('moments').getAll(accountRange(uid)),
    read.objectStore('tags').getAll(accountRange(uid)),
    read.objectStore('drafts').getAll(accountRange(uid)),
    read.objectStore('media').getAll(accountRange(uid)),
  ]);
  await read.done;
  const records: Record<string, string> = {},
    objects: Array<{ hash: string; blob: Blob }> = [];
  for (const [kind, rows] of [
    ['moment', moments],
    ['tag', tags],
    ['draft', drafts],
  ] as const)
    for (const row of rows) {
      const blob = new Blob([JSON.stringify(row)], { type: 'application/json' }),
        hash = await hashBlob(blob);
      records[`${kind}:${'id' in row ? row.id : row.profileId}`] = hash;
      objects.push({ hash, blob });
    }
  const snapshot: BackupSnapshot = {
    uid,
    id: crypto.randomUUID(),
    at: new Date(now).toISOString(),
    records,
    media: media.map((m) => m.hash),
  };
  const tx = db.transaction(['backups', 'backupObjects', 'meta'], 'readwrite');
  for (const item of [...objects, ...media])
    if (!(await tx.objectStore('backupObjects').get([uid, item.hash])))
      await tx.objectStore('backupObjects').put({ uid, hash: item.hash, blob: item.blob });
  await tx.objectStore('backups').put(snapshot);
  await tx.objectStore('meta').put(now, `backup-at:${uid}`);
  await tx.done;
  return snapshot;
}
export async function backupInfo(uid: string) {
  const db = await database();
  return {
    snapshots: await db.getAll('backups', accountRange(uid)),
    objects: await db.count('backupObjects', accountRange(uid)),
  };
}
export function downloadFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export async function exportJson(uid: string) {
  return new Blob(
    [
      JSON.stringify(
        {
          format: 'family-moments-json-v1',
          uid,
          projectId: 'la-spesa-5cc7a',
          household: 'home',
          bucket: STORAGE_BUCKET || null,
          at: new Date().toISOString(),
          moments: await listMoments(uid),
          tags: await listTags(uid),
          notice:
            'Metadata only. Media is NOT included. Retrieve attachments using authenticated Firebase SDK and their storage paths.',
        },
        null,
        2,
      ),
    ],
    { type: 'application/json' },
  );
}
export async function exportZip(
  uid: string,
  fetchMedia: (a: Attachment) => Promise<Blob>,
  progress: (s: string) => void,
) {
  const rows = await listMoments(uid),
    tags = await listTags(uid),
    db = await database(),
    drafts = await db.getAll('drafts', accountRange(uid));
  const all = [
    ...rows.flatMap((r) => r.value.attachments),
    ...drafts.flatMap((d) => d.attachments),
  ];
  const attachments = [...new Map(all.map((a) => [a.hash, a])).values()];
  if (attachments.reduce((sum, a) => sum + a.size, 0) > 250 * 1024 * 1024)
    throw new Error(
      'This collection exceeds the 250 MB browser ZIP limit. Use the documented desktop backup command for a complete export.',
    );
  const files: Record<string, Uint8Array> = {};
  for (let i = 0; i < attachments.length; i++) {
    const a = attachments[i];
    progress(`Collecting attachment ${i + 1} of ${attachments.length}`);
    const blob = (await getMedia(uid, a.hash))?.blob || (await fetchMedia(a));
    if ((await hashBlob(blob)) !== a.hash)
      throw new Error(`Integrity check failed for ${a.name}. Export stopped.`);
    files[`media/${a.hash}`] = new Uint8Array(await blob.arrayBuffer());
  }
  files['records.json'] = strToU8(
    JSON.stringify(
      {
        format: 'family-moments-zip-v1',
        uid,
        projectId: 'la-spesa-5cc7a',
        household: 'home',
        bucket: STORAGE_BUCKET || null,
        at: new Date().toISOString(),
        moments: rows,
        tags,
        drafts,
      },
      null,
      2,
    ),
  );
  progress('Packing complete backup…');
  const bytes = await new Promise<Uint8Array>((resolve, reject) =>
    zip(files, { level: 0 }, (e, b) => (e ? reject(e) : resolve(b))),
  );
  return new Blob([bytes as BlobPart], { type: 'application/zip' });
}
export async function exportSnapshot(uid: string, id: string) {
  const db = await database(),
    snapshot = await db.get('backups', [uid, id]);
  if (!snapshot) throw new Error('Backup was not found.');
  const moments: LocalMoment[] = [],
    tags: LocalTag[] = [],
    drafts: Draft[] = [],
    files: Record<string, Uint8Array> = {};
  for (const [key, hash] of Object.entries(snapshot.records)) {
    const object = await db.get('backupObjects', [uid, hash]);
    if (!object) throw new Error('Backup data is missing.');
    const parsed = JSON.parse(await object.blob.text());
    if (key.startsWith('moment:')) moments.push(parsed);
    else if (key.startsWith('tag:')) tags.push(parsed);
    else drafts.push(parsed);
  }
  let total = 0;
  for (const hash of snapshot.media) {
    const object = await db.get('backupObjects', [uid, hash]);
    if (!object) throw new Error('Backup media is missing.');
    total += object.blob.size;
    if (total > 250 * 1024 * 1024) throw new Error('This snapshot exceeds the browser ZIP limit.');
    files[`media/${hash}`] = new Uint8Array(await object.blob.arrayBuffer());
  }
  // A local snapshot can only contain media that had reached this phone.
  files['records.json'] = strToU8(
    JSON.stringify({
      format: 'family-moments-zip-v1',
      uid,
      at: snapshot.at,
      moments,
      tags,
      drafts,
      localSnapshot: true,
    }),
  );
  const bytes = await new Promise<Uint8Array>((resolve, reject) =>
    zip(files, { level: 0 }, (e, b) => (e ? reject(e) : resolve(b))),
  );
  return new Blob([bytes as BlobPart], { type: 'application/zip' });
}
export async function importZip(uid: string, file: File) {
  if (file.size > 250 * 1024 * 1024) throw new Error('Restore files must be under 250 MB.');
  let total = 0;
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()), {
    filter: (entry) => {
      total += entry.originalSize;
      if (total > 300 * 1024 * 1024) throw new Error('The expanded backup is too large.');
      return entry.name === 'records.json' || /^media\/[a-f0-9]{64}$/.test(entry.name);
    },
  });
  if (!files['records.json']) throw new Error('This is not a Family Moments backup.');
  const data = JSON.parse(strFromU8(files['records.json'])) as {
    format: string;
    uid: string;
    moments: LocalMoment[];
    tags: LocalTag[];
    drafts: Draft[];
  };
  if (
    data.format !== 'family-moments-zip-v1' ||
    data.uid !== uid ||
    !Array.isArray(data.moments) ||
    !Array.isArray(data.tags) ||
    !Array.isArray(data.drafts)
  )
    throw new Error('Use a backup exported by this signed-in account.');
  const media = [];
  for (const [path, bytes] of Object.entries(files))
    if (path.startsWith('media/')) {
      const hash = path.slice(6),
        blob = new Blob([bytes as BlobPart]);
      if ((await hashBlob(blob)) !== hash) throw new Error('Backup integrity check failed.');
      media.push({ uid, hash, blob });
    }
  // Reject foreign paths/owners and malformed records before opening the write transaction.
  for (const row of data.moments) {
    if (
      row.uid !== uid ||
      !row.id ||
      row.id !== row.value?.id ||
      row.value.schemaVersion !== 1 ||
      !Number.isInteger(row.baseRevision) ||
      !Array.isArray(row.value.attachments) ||
      !['pending', 'synced', 'conflict'].includes(row.status) ||
      typeof row.value.text !== 'string' ||
      !Array.isArray(row.value.tagIds) ||
      row.value.tagIds.some((t) => typeof t !== 'string') ||
      !/^[a-z][a-z0-9-]{0,39}$/.test(row.value.profileId)
    )
      throw new Error('Invalid moment in backup.');
    validateCapture(row.value.text, row.value.attachments.length, row.value.eventAt);
    for (const a of row.value.attachments)
      if (
        a.path !== `moments/home/${row.value.profileId}/${row.id}/${a.id}` ||
        !/^[a-f0-9-]{36}$/.test(a.id) ||
        !/^[a-f0-9]{64}$/.test(a.hash) ||
        typeof a.name !== 'string' ||
        typeof a.mime !== 'string' ||
        typeof a.remote !== 'boolean' ||
        !Number.isInteger(a.size) ||
        a.size < 1 ||
        a.size > 100 * 1024 * 1024 ||
        !['image', 'video', 'audio', 'document'].includes(a.kind)
      )
        throw new Error('Invalid attachment in backup.');
  }
  for (const row of data.tags)
    if (
      row.uid !== uid ||
      !row.value?.canonical ||
      row.id !== row.value.id ||
      makeTag(row.value.label).id !== row.id ||
      makeTag(row.value.label).canonical !== row.value.canonical
    )
      throw new Error('Invalid tag in backup.');
  for (const row of data.drafts)
    if (row.uid !== uid || typeof row.text !== 'string' || !Array.isArray(row.attachments))
      throw new Error('Invalid draft in backup.');
  const db = await database(),
    tx = db.transaction(['moments', 'tags', 'drafts', 'media'], 'readwrite');
  let count = 0;
  for (const row of data.moments)
    if (!(await tx.objectStore('moments').get([uid, row.id]))) {
      await tx.objectStore('moments').put(row);
      count++;
    }
  for (const row of data.tags)
    if (!(await tx.objectStore('tags').get([uid, row.id])))
      await tx.objectStore('tags').put({ ...row, pending: true });
  for (const row of data.drafts)
    if (!(await tx.objectStore('drafts').get([uid, row.profileId])))
      await tx.objectStore('drafts').put(row);
  for (const row of media)
    if (!(await tx.objectStore('media').get([uid, row.hash])))
      await tx.objectStore('media').put(row);
  await tx.done;
  return count;
}
