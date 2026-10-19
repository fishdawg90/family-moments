import type { Attachment, LocalMoment, Moment, Tag } from './types';
import {
  acknowledge,
  accountRange,
  database,
  getMedia,
  listMoments,
  listTags,
  syncError,
} from './storage';
export interface CommitResult {
  ok: boolean;
  value: Moment | null;
}
export interface Transport {
  read(uid: string, id: string): Promise<Moment | null>;
  commit(uid: string, value: Moment, base: number, opId: string): Promise<CommitResult>;
  confirmMedia(uid: string, value: Moment, opId: string): Promise<CommitResult>;
  tag(uid: string, tag: Tag): Promise<void>;
  exists(uid: string, a: Attachment): Promise<boolean>;
  upload(uid: string, a: Attachment, blob: Blob, progress: (n: number) => void): Promise<void>;
  remove(uid: string, path: string): Promise<void>;
}
export async function sendMoment(
  sent: LocalMoment,
  t: Transport,
  stillActive: () => boolean,
  status: (s: string) => void,
) {
  const check = () => {
    if (!stillActive()) throw new Error('Account changed. Waiting for the original account.');
  };
  try {
    check();
    const result = await t.commit(sent.uid, sent.value, sent.baseRevision, sent.opId);
    check();
    if (!result.ok || !result.value) {
      await syncError(
        sent,
        'Both parents edited this moment. Review the two versions.',
        result.value || undefined,
      );
      return;
    }
    let remote = result.value;
    // A tombstone is acknowledged before cleanup. Media stays locally recoverable.
    if (!remote.deletedAt) {
      const attachments = remote.attachments.map((a) => ({ ...a }));
      for (let index = 0; index < attachments.length; index++) {
        const a = attachments[index];
        if (a.remote) continue;
        check();
        const local = await getMedia(sent.uid, a.hash);
        status(`Uploading ${index + 1} of ${attachments.length} attachments`);
        if (local)
          await t.upload(sent.uid, a, local.blob, (n) =>
            status(`Uploading ${index + 1} of ${attachments.length} · ${Math.round(n * 100)}%`),
          );
        else if (!(await t.exists(sent.uid, a)))
          throw new Error(
            `Waiting for ${a.name} from the phone that captured it or a media backup.`,
          );
        check();
        a.remote = true;
        // Confirm each completed object in Firestore so partial progress survives restarts.
        const confirmed = await t.confirmMedia(sent.uid, { ...remote, attachments }, sent.opId);
        check();
        if (!confirmed.ok || !confirmed.value) {
          await syncError(
            sent,
            'This moment changed while media was uploading. Review both versions.',
            confirmed.value || undefined,
          );
          return;
        }
        remote = confirmed.value;
      }
    }
    check();
    await acknowledge(sent, remote);
  } catch (e) {
    await syncError(
      sent,
      e instanceof Error ? e.message : 'Upload interrupted. Your local copy is safe.',
    );
  }
}
let running = false;
export async function syncAccount(
  uid: string,
  t: Transport,
  active: () => boolean,
  status: (s: string) => void,
) {
  const work = async () => {
    if (running || !active()) return;
    running = true;
    try {
      for (const row of await listTags(uid))
        if (row.pending && active()) {
          await t.tag(uid, row.value);
          if (!active()) return;
          await (await database()).put('tags', { ...row, pending: false });
        }
      for (const row of await listMoments(uid))
        if (row.status === 'pending' && active()) await sendMoment(row, t, active, status);
      const db = await database();
      for (const job of await db.getAll('cleanup', accountRange(uid))) {
        if (!active() || job.notBefore > Date.now()) continue;
        const remote = await t.read(uid, job.momentId);
        if (!active()) return;
        // Never delete an object still referenced by a live remote revision.
        if (remote && !remote.deletedAt && remote.attachments.some((a) => a.path === job.path))
          continue;
        const local = (await listMoments(uid)).find((m) => m.id === job.momentId);
        if (local?.status !== 'synced') continue;
        await t.remove(uid, job.path);
        await db.delete('cleanup', [uid, job.path]);
      }
    } finally {
      running = false;
    }
  };
  if (typeof navigator !== 'undefined' && navigator.locks)
    await navigator.locks.request(`family-moments-sync-${uid}`, { ifAvailable: true }, (lock) =>
      lock ? work() : Promise.resolve(),
    );
  else await work();
}
