import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  acknowledge,
  asDraft,
  changeDeleted,
  database,
  emptyDraft,
  getDraft,
  getMoment,
  ingest,
  listMoments,
  putDraft,
  putTag,
  rememberMedia,
  resolveConflict,
  saveMoment,
} from '../src/storage';
import { backupInfo, exportZip, importZip, weeklyBackup } from '../src/backup';
import { makeTag } from '../src/domain';
import { sendMoment, syncAccount, type Transport } from '../src/sync';
import type { Attachment, Moment } from '../src/types';
const uid = 'parent-a';
beforeEach(async () => {
  const db = await database();
  for (const name of db.objectStoreNames) await db.clear(name);
});
async function capture(text = 'hello', attachments: Attachment[] = []) {
  return saveMoment({ ...emptyDraft(uid, 'giulia'), text, attachments });
}
async function attachment(name = 'photo.jpg', kind: Attachment['kind'] = 'image') {
  const blob = new Blob(['a private file'], {
      type: kind === 'document' ? 'application/pdf' : 'image/jpeg',
    }),
    hash = await rememberMedia(uid, blob);
  return {
    id: crypto.randomUUID(),
    hash,
    path: '',
    name,
    kind,
    mime: blob.type,
    size: blob.size,
    remote: false,
  };
}
function mockTransport() {
  const docs = new Map<string, Moment>(),
    objects = new Set<string>();
  const t: Transport = {
    read: vi.fn(async (_, id) => docs.get(id) || null),
    commit: vi.fn(async (_, value, base, op) => {
      const r = docs.get(value.id);
      if (r?.lastOpId === op) return { ok: true, value: structuredClone(r) };
      if ((r?.revision || 0) !== base) return { ok: false, value: r || null };
      const next = structuredClone({ ...value, revision: base + 1, lastOpId: op });
      docs.set(value.id, next);
      return { ok: true, value: structuredClone(next) };
    }),
    confirmMedia: vi.fn(async (_, value, op) => {
      if (docs.get(value.id)?.lastOpId !== op)
        return { ok: false, value: docs.get(value.id) || null };
      docs.set(value.id, structuredClone(value));
      return { ok: true, value: structuredClone(value) };
    }),
    tag: vi.fn(async () => {}),
    exists: vi.fn(async (_, a) => objects.has(a.path)),
    upload: vi.fn(async (_, a) => {
      objects.add(a.path);
    }),
    remove: vi.fn(async (_, p) => {
      objects.delete(p);
    }),
  };
  return { t, docs, objects };
}
describe('atomic IndexedDB capture', () => {
  it('persists text and resets the durable draft only after commit', async () => {
    const d = { ...emptyDraft(uid, 'giulia'), text: 'Butterfly 🦋' };
    await putDraft(d);
    const row = await saveMoment(d);
    expect((await getMoment(uid, row.id))?.value.text).toBe('Butterfly 🦋');
    expect((await getDraft(uid, 'giulia'))?.text).toBe('');
    expect((await listMoments('parent-b')).length).toBe(0);
  });
  it('persists photo-only, multiple media and PDF-only captures', async () => {
    const photo = await attachment(),
      pdf = await attachment('memory.pdf', 'document');
    expect((await capture('', [photo])).value.attachments).toHaveLength(1);
    expect((await capture('two', [photo, pdf])).value.attachments).toHaveLength(2);
    expect((await capture('', [pdf])).value.attachments[0].kind).toBe('document');
  });
  it('rejects a missing Blob and retains the editable draft', async () => {
    const a = await attachment(),
      db = await database();
    await db.clear('media');
    const d = { ...emptyDraft(uid, 'giulia'), text: 'keep me', attachments: [a] };
    await putDraft(d);
    await expect(saveMoment(d)).rejects.toThrow('attachment');
    expect((await getDraft(uid, 'giulia'))?.text).toBe('keep me');
    expect(await listMoments(uid)).toHaveLength(0);
  });
  it('edits retrospective dates and tag removal without duplicating records', async () => {
    const r = await capture(),
      tag = makeTag('First Word');
    const edit = asDraft(uid, r.value);
    edit.eventAt = '2020-01-01T00:00:00.000Z';
    edit.tagIds = [tag.id];
    const changed = await saveMoment(edit);
    expect(await listMoments(uid)).toHaveLength(1);
    expect(changed.value.eventAt).toBe(edit.eventAt);
    await saveMoment({ ...asDraft(uid, changed.value), tagIds: [] });
    expect((await getMoment(uid, r.id))?.value.tagIds).toEqual([]);
  });
  it('protects a newer local edit when an earlier operation is acknowledged', async () => {
    const first = await capture('first'),
      second = await saveMoment({ ...asDraft(uid, first.value), text: 'second' });
    await acknowledge(first, { ...first.value, revision: 1 });
    const row = await getMoment(uid, first.id);
    expect(row?.value.text).toBe('second');
    expect(row?.opId).toBe(second.opId);
    expect(row?.status).toBe('pending');
    expect(row?.baseRevision).toBe(1);
  });
  it('keeps pending local edits when cloud records arrive', async () => {
    const r = await capture('local');
    await ingest(uid, { ...r.value, text: 'cloud', revision: 1 });
    expect((await getMoment(uid, r.id))?.value.text).toBe('local');
  });
});
describe('interrupted and idempotent synchronisation', () => {
  it('retries partial media without creating duplicate events or uploads', async () => {
    const a = await attachment(),
      b = await attachment('two.jpg'),
      r = await capture('two', [a, b]),
      { t, docs, objects } = mockTransport();
    let fail = true;
    t.upload = vi.fn(async (_, file) => {
      if (file.id === b.id && fail) throw new Error('Network gone');
      objects.add(file.path);
    });
    await sendMoment(
      r,
      t,
      () => true,
      () => {},
    );
    expect(docs.size).toBe(1);
    expect(docs.get(r.id)?.attachments[0].remote).toBe(true);
    expect((await getMoment(uid, r.id))?.status).toBe('pending');
    fail = false;
    await sendMoment(
      (await getMoment(uid, r.id))!,
      t,
      () => true,
      () => {},
    );
    expect(objects.size).toBe(2);
    expect(docs.size).toBe(1);
    expect(docs.get(r.id)?.revision).toBe(1);
    expect((await getMoment(uid, r.id))?.status).toBe('synced');
    expect(
      (t.upload as ReturnType<typeof vi.fn>).mock.calls.filter((c) => c[1].id === a.id),
    ).toHaveLength(1);
  });
  it('recovers when upload succeeds and Firestore media acknowledgement fails', async () => {
    const a = await attachment(),
      r = await capture('', [a]),
      { t, docs, objects } = mockTransport(),
      confirm = t.confirmMedia;
    let fail = true;
    t.confirmMedia = vi.fn(async (...args: Parameters<Transport['confirmMedia']>) => {
      if (fail) throw new Error('write failed');
      return confirm(...args);
    });
    t.upload = vi.fn(async (_, a) => {
      objects.add(a.path);
    });
    await sendMoment(
      r,
      t,
      () => true,
      () => {},
    );
    fail = false;
    await sendMoment(
      (await getMoment(uid, r.id))!,
      t,
      () => true,
      () => {},
    );
    expect(objects.size).toBe(1);
    expect(docs.size).toBe(1);
    expect((await getMoment(uid, r.id))?.status).toBe('synced');
  });
  it('halts on account changes before any cloud write', async () => {
    const r = await capture(),
      { t } = mockTransport();
    await sendMoment(
      r,
      t,
      () => false,
      () => {},
    );
    expect(t.commit).not.toHaveBeenCalled();
    expect((await getMoment(uid, r.id))?.status).toBe('pending');
  });
  it('syncs offline-created tags and only the active account records', async () => {
    await putTag(uid, makeTag('New word'));
    await capture();
    await saveMoment({ ...emptyDraft('parent-b', 'nina'), text: 'other account' });
    const { t, docs } = mockTransport();
    await syncAccount(
      uid,
      t,
      () => true,
      () => {},
    );
    expect(t.tag).toHaveBeenCalledOnce();
    expect(docs.size).toBe(1);
    expect((await listMoments('parent-b'))[0].status).toBe('pending');
  });
  it('surfaces real revision conflicts and can retain both versions', async () => {
    const r = await capture('this phone'),
      { t, docs } = mockTransport();
    docs.set(r.id, { ...r.value, text: 'other parent', revision: 2, lastOpId: 'another' });
    await sendMoment(
      r,
      t,
      () => true,
      () => {},
    );
    expect((await getMoment(uid, r.id))?.status).toBe('conflict');
    await resolveConflict(uid, r.id, 'copy');
    const rows = await listMoments(uid);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.value.text).sort()).toEqual(['other parent', 'this phone']);
  });
  it('recovers deleted records and rechecks media rather than assuming old objects exist', async () => {
    const r = await capture('a', [await attachment()]),
      { t } = mockTransport();
    await sendMoment(
      r,
      t,
      () => true,
      () => {},
    );
    await changeDeleted(uid, r.id, true);
    await sendMoment(
      (await getMoment(uid, r.id))!,
      t,
      () => true,
      () => {},
    );
    await changeDeleted(uid, r.id, false);
    expect((await getMoment(uid, r.id))?.value.attachments[0].remote).toBe(false);
    await sendMoment(
      (await getMoment(uid, r.id))!,
      t,
      () => true,
      () => {},
    );
    expect((await getMoment(uid, r.id))?.value.deletedAt).toBe(null);
  });
});
describe('content-addressed weekly recovery and ZIP', () => {
  it('skips early runs, deduplicates unchanged content, retains changed versions', async () => {
    const r = await capture('first', [await attachment()]);
    await weeklyBackup(uid, false, 1000000000);
    const first = await backupInfo(uid);
    await weeklyBackup(uid, false, 1000000001);
    expect((await backupInfo(uid)).snapshots).toHaveLength(1);
    await weeklyBackup(uid, false, 1000000000 + 8 * 86400000);
    expect((await backupInfo(uid)).objects).toBe(first.objects);
    await saveMoment({ ...asDraft(uid, r.value), text: 'changed' });
    await weeklyBackup(uid, true);
    expect((await backupInfo(uid)).objects).toBeLessThanOrEqual(first.objects + 2);
    expect((await backupInfo('parent-b')).objects).toBe(0);
  });
  it('exports bytes and restores without duplicating existing records', async () => {
    await capture('remember', [await attachment('scan.pdf', 'document')]);
    const zip = await exportZip(
      uid,
      async () => {
        throw new Error('no network');
      },
      () => {},
    );
    const file = new File([zip], 'backup.zip');
    expect(await importZip(uid, file)).toBe(0);
    const db = await database();
    await db.clear('moments');
    await db.clear('media');
    expect(await importZip(uid, file)).toBe(1);
    expect((await listMoments(uid))[0].value.text).toBe('remember');
    await expect(importZip('parent-b', file)).rejects.toThrow('signed-in account');
  });
  it('does not claim complete media backup if a file is unavailable', async () => {
    const a = await attachment(),
      r = await capture('file', [a]),
      db = await database();
    await db.clear('media');
    await expect(
      exportZip(
        uid,
        async () => {
          throw new Error('File unavailable');
        },
        () => {},
      ),
    ).rejects.toThrow('File unavailable');
    expect((await getMoment(uid, r.id))?.value.attachments).toHaveLength(1);
  });
});
