import { openDB, type DBSchema } from 'idb';
import type {
  Attachment,
  BackupObject,
  BackupSnapshot,
  Cleanup,
  Draft,
  LocalMoment,
  LocalTag,
  Media,
  Moment,
  Tag,
} from './types';
import { hashBlob, validateCapture } from './domain';

interface Schema extends DBSchema {
  moments: { key: [string, string]; value: LocalMoment };
  tags: { key: [string, string]; value: LocalTag };
  drafts: { key: [string, string]; value: Draft };
  media: { key: [string, string]; value: Media };
  cleanup: { key: [string, string]; value: Cleanup };
  meta: { key: string; value: unknown };
  backups: { key: [string, string]; value: BackupSnapshot };
  backupObjects: { key: [string, string]; value: BackupObject };
}
export const database = () =>
  openDB<Schema>('family-moments', 1, {
    upgrade(db) {
      for (const name of ['moments', 'tags', 'media', 'backups', 'backupObjects'] as const)
        db.createObjectStore(name, {
          keyPath: ['uid', name === 'media' || name === 'backupObjects' ? 'hash' : 'id'],
        });
      db.createObjectStore('drafts', { keyPath: ['uid', 'profileId'] });
      db.createObjectStore('cleanup', { keyPath: ['uid', 'path'] });
      db.createObjectStore('meta');
    },
  });
export const accountRange = (uid: string) => IDBKeyRange.bound([uid, ''], [uid, '\uffff']);
export async function listMoments(uid: string) {
  const db = await database();
  return db.getAll('moments', accountRange(uid));
}
export async function listTags(uid: string) {
  const db = await database();
  return db.getAll('tags', accountRange(uid));
}
export async function getMoment(uid: string, id: string) {
  return (await database()).get('moments', [uid, id]);
}
export async function getMedia(uid: string, hash: string) {
  return (await database()).get('media', [uid, hash]);
}
export async function rememberMedia(uid: string, blob: Blob) {
  const hash = await hashBlob(blob);
  await (await database()).put('media', { uid, hash, blob });
  return hash;
}
export async function putDraft(draft: Draft) {
  await (await database()).put('drafts', draft);
}
export async function getDraft(uid: string, profile: string) {
  return (await database()).get('drafts', [uid, profile]);
}
export const emptyDraft = (uid: string, profileId: string): Draft => ({
  uid,
  profileId,
  text: '',
  tagIds: [],
  eventAt: new Date().toISOString(),
  attachments: [],
  editingId: null,
});
export async function putTag(uid: string, value: Tag, pending = true) {
  await (await database()).put('tags', { uid, id: value.id, value, pending });
}
export async function meta<T>(key: string): Promise<T | undefined> {
  return (await database()).get('meta', key) as Promise<T | undefined>;
}
export async function setMeta(key: string, value: unknown) {
  await (await database()).put('meta', value, key);
}

// One transaction covers moment, media existence checks, outbox state and draft reset.
// An aborted transaction leaves the original draft and queue intact.
export async function saveMoment(draft: Draft): Promise<LocalMoment> {
  validateCapture(draft.text, draft.attachments.length, draft.eventAt);
  if (draft.tagIds.length > 50) throw new Error('Choose up to 50 tags for one moment.');
  const db = await database();
  const tx = db.transaction(['moments', 'drafts', 'media', 'cleanup'], 'readwrite');
  try {
    const previous = draft.editingId
      ? await tx.objectStore('moments').get([draft.uid, draft.editingId])
      : undefined;
    if (previous?.status === 'conflict')
      throw new Error('Review the conflicting versions before editing this moment.');
    for (const a of draft.attachments)
      if (!a.remote && !(await tx.objectStore('media').get([draft.uid, a.hash])))
        throw new Error('An attachment is not saved locally yet. Please attach it again.');
    const now = new Date().toISOString(),
      id = previous?.id || crypto.randomUUID(),
      opId = crypto.randomUUID();
    const attachments = draft.attachments.map((a) => ({
      ...a,
      path: a.path || `moments/home/${draft.profileId}/${id}/${a.id}`,
    }));
    const value: Moment = {
      id,
      profileId: draft.profileId,
      text: draft.text.trim(),
      tagIds: [...new Set(draft.tagIds)],
      eventAt: draft.eventAt,
      createdAt: previous?.value.createdAt || now,
      updatedAt: now,
      createdByUid: previous?.value.createdByUid || draft.uid,
      updatedByUid: draft.uid,
      revision: previous?.value.revision || 0,
      attachments,
      deletedAt: null,
      schemaVersion: 1,
      lastOpId: opId,
    };
    const row: LocalMoment = {
      uid: draft.uid,
      id,
      value,
      opId,
      baseRevision: previous?.baseRevision ?? 0,
      status: 'pending',
      error: '',
      conflict: null,
    };
    for (const a of previous?.value.attachments || [])
      if (!attachments.some((b) => b.path === a.path))
        await tx
          .objectStore('cleanup')
          .put({
            uid: draft.uid,
            path: a.path,
            momentId: id,
            notBefore: Date.now() + 7 * 86400000,
          });
    await tx.objectStore('moments').put(row);
    await tx.objectStore('drafts').put(emptyDraft(draft.uid, draft.profileId));
    await tx.done;
    return row;
  } catch (e) {
    try {
      tx.abort();
    } catch {}
    await tx.done.catch(() => {});
    throw e;
  }
}
export async function changeDeleted(uid: string, id: string, deleted: boolean) {
  const db = await database(),
    tx = db.transaction(['moments', 'cleanup'], 'readwrite'),
    row = await tx.objectStore('moments').get([uid, id]);
  if (!row) throw new Error('Moment was not found on this phone.');
  if (row.status === 'conflict') throw new Error('Resolve the conflicting versions first.');
  row.opId = crypto.randomUUID();
  row.value = {
    ...row.value,
    deletedAt: deleted ? new Date().toISOString() : null,
    updatedAt: new Date().toISOString(),
    updatedByUid: uid,
    lastOpId: row.opId,
    attachments: row.value.attachments.map((a) => ({ ...a, remote: deleted ? a.remote : false })),
  };
  row.status = 'pending';
  row.error = '';
  await tx.objectStore('moments').put(row);
  for (const a of row.value.attachments) {
    if (deleted)
      await tx
        .objectStore('cleanup')
        .put({ uid, path: a.path, momentId: id, notBefore: Date.now() + 7 * 86400000 });
    else await tx.objectStore('cleanup').delete([uid, a.path]);
  }
  await tx.done;
}
// Preserve a newer local edit when an older in-flight operation is acknowledged.
export async function acknowledge(sent: LocalMoment, remote: Moment) {
  const db = await database(),
    tx = db.transaction('moments', 'readwrite'),
    store = tx.objectStore('moments'),
    current = await store.get([sent.uid, sent.id]);
  if (current) {
    if (current.opId === sent.opId)
      await store.put({
        ...current,
        value: remote,
        baseRevision: remote.revision,
        status: 'synced',
        error: '',
        conflict: null,
      });
    else if (current.baseRevision === sent.baseRevision)
      await store.put({
        ...current,
        baseRevision: remote.revision,
        value: {
          ...current.value,
          revision: remote.revision,
          attachments: current.value.attachments.map((a) => ({
            ...a,
            remote: remote.attachments.some((r) => r.id === a.id && r.remote) || a.remote,
          })),
        },
      });
  }
  await tx.done;
}
export async function syncError(sent: LocalMoment, error: string, remote?: Moment) {
  const db = await database(),
    tx = db.transaction('moments', 'readwrite'),
    store = tx.objectStore('moments'),
    current = await store.get([sent.uid, sent.id]);
  if (current)
    await store.put({
      ...current,
      error,
      ...(remote ? { status: 'conflict' as const, conflict: remote } : {}),
    });
  await tx.done;
}
export async function ingest(uid: string, remote: Moment) {
  const db = await database(),
    tx = db.transaction('moments', 'readwrite'),
    s = tx.objectStore('moments'),
    local = await s.get([uid, remote.id]);
  if (!local || (local.status === 'synced' && remote.revision >= local.baseRevision))
    await s.put({
      uid,
      id: remote.id,
      value: remote,
      baseRevision: remote.revision,
      opId: remote.lastOpId,
      status: 'synced',
      error: '',
      conflict: null,
    });
  await tx.done;
}
export async function resolveConflict(
  uid: string,
  id: string,
  choice: 'remote' | 'local' | 'copy',
) {
  const db = await database(),
    tx = db.transaction('moments', 'readwrite'),
    s = tx.objectStore('moments'),
    row = await s.get([uid, id]);
  if (!row?.conflict) throw new Error('No conflict to resolve.');
  const remote = row.conflict;
  if (choice === 'local') {
    row.baseRevision = remote.revision;
    row.value = {
      ...row.value,
      createdAt: remote.createdAt,
      createdByUid: remote.createdByUid,
      updatedByUid: uid,
      updatedAt: new Date().toISOString(),
      revision: remote.revision,
      lastOpId: crypto.randomUUID(),
    };
    row.opId = row.value.lastOpId;
    row.status = 'pending';
    row.conflict = null;
    row.error = '';
    await s.put(row);
  } else {
    if (choice === 'copy') {
      const copyId = crypto.randomUUID(),
        opId = crypto.randomUUID(),
        now = new Date().toISOString();
      const copied = row.value.attachments.map((a) => ({
        ...a,
        id: crypto.randomUUID(),
        path: '',
        remote: false,
      }));
      // A copy requires local media; the UI downloads missing media before this action.
      for (const a of copied) a.path = `moments/home/${row.value.profileId}/${copyId}/${a.id}`;
      await s.put({
        ...row,
        id: copyId,
        opId,
        baseRevision: 0,
        status: 'pending',
        error: '',
        conflict: null,
        value: {
          ...row.value,
          id: copyId,
          revision: 0,
          lastOpId: opId,
          createdAt: now,
          updatedAt: now,
          createdByUid: uid,
          updatedByUid: uid,
          attachments: copied,
        },
      });
    }
    await s.put({
      uid,
      id,
      value: remote,
      opId: remote.lastOpId,
      baseRevision: remote.revision,
      status: 'synced',
      error: '',
      conflict: null,
    });
  }
  await tx.done;
}
export function asDraft(uid: string, m: Moment): Draft {
  return {
    uid,
    profileId: m.profileId,
    text: m.text,
    tagIds: m.tagIds,
    eventAt: m.eventAt,
    attachments: m.attachments,
    editingId: m.id,
  };
}
