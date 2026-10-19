import { getApps, initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  connectAuthEmulator,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  collection,
  connectFirestoreEmulator,
  doc,
  getDocFromServer,
  getDocsFromServer,
  getFirestore,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  startAfter,
  Timestamp,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import {
  connectStorageEmulator,
  deleteObject,
  getBlob,
  getMetadata,
  getStorage,
  ref,
  uploadBytesResumable,
  type FirebaseStorage,
} from 'firebase/storage';
import { EMULATORS, FIREBASE_APP_NAME, FIREBASE_CONFIG, STORAGE_BUCKET } from './config';
import type { Attachment, Moment, Tag } from './types';
import type { Transport } from './sync';
const app =
  getApps().find((a) => a.name === FIREBASE_APP_NAME) ||
  initializeApp(
    {
      ...FIREBASE_CONFIG,
      ...(EMULATORS ? { projectId: 'demo-family-moments', authDomain: 'localhost' } : {}),
    },
    FIREBASE_APP_NAME,
  );
export const auth = getAuth(app),
  db = getFirestore(app);
if (EMULATORS) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}
export const authPersistence = setPersistence(auth, browserLocalPersistence);
export { onAuthStateChanged, signInWithEmailAndPassword, signOut };
export async function membership(uid: string) {
  return (await getDocFromServer(doc(db, 'households', 'home', 'members', uid))).exists();
}
const momentRef = (id: string) => doc(db, 'households', 'home', 'moments', id);
function decode(data: DocumentData): Moment {
  return { ...data, cloudUpdatedAt: data.cloudUpdatedAt?.toMillis?.() || 0 } as Moment;
}
let openedStorage: FirebaseStorage | undefined;
function storage() {
  const bucket = EMULATORS ? 'demo-family-moments.appspot.com' : STORAGE_BUCKET;
  if (!bucket)
    throw new Error(
      'Cloud attachments need the verified Firebase Storage bucket. Your files are safe on this phone.',
    );
  if (!openedStorage) {
    openedStorage = getStorage(app, `gs://${bucket}`);
    if (EMULATORS) connectStorageEmulator(openedStorage, '127.0.0.1', 9199);
  }
  return openedStorage;
}
function assertAccount(uid: string) {
  if (auth.currentUser?.uid !== uid) throw new Error('Account changed. Synchronisation paused.');
}
export const transport: Transport = {
  async read(uid, id) {
    assertAccount(uid);
    const s = await getDocFromServer(momentRef(id));
    return s.exists() ? decode(s.data()) : null;
  },
  async commit(uid, value, baseRevision, opId) {
    assertAccount(uid);
    return runTransaction(db, async (tx) => {
      assertAccount(uid);
      const ref = momentRef(value.id),
        s = await tx.get(ref),
        remote = s.exists() ? decode(s.data()) : null;
      if (remote?.lastOpId === opId) return { ok: true as const, value: remote };
      if ((remote?.revision || 0) !== baseRevision) return { ok: false as const, value: remote };
      const next = { ...value, revision: baseRevision + 1, lastOpId: opId };
      tx.set(ref, { ...next, cloudUpdatedAt: serverTimestamp() });
      return { ok: true as const, value: next };
    });
  },
  async confirmMedia(uid, value, opId) {
    assertAccount(uid);
    return runTransaction(db, async (tx) => {
      assertAccount(uid);
      const r = momentRef(value.id),
        s = await tx.get(r),
        remote = s.exists() ? decode(s.data()) : null;
      if (!remote || remote.lastOpId !== opId) return { ok: false as const, value: remote };
      const next = { ...remote, attachments: value.attachments };
      tx.update(r, { attachments: next.attachments, cloudUpdatedAt: serverTimestamp() });
      return { ok: true as const, value: next };
    });
  },
  async tag(uid, tag) {
    assertAccount(uid);
    const r = doc(db, 'households', 'home', 'momentTags', tag.id);
    await runTransaction(db, async (tx) => {
      assertAccount(uid);
      if (!(await tx.get(r)).exists()) tx.set(r, tag);
    });
  },
  async upload(uid, a, blob, progress) {
    assertAccount(uid);
    const object = ref(storage(), a.path);
    try {
      const m = await getMetadata(object);
      if (m.customMetadata?.sha256 === a.hash && m.size === a.size) return;
    } catch (e) {
      if ((e as { code?: string }).code !== 'storage/object-not-found') throw e;
    }
    await new Promise<void>((resolve, reject) => {
      const task = uploadBytesResumable(object, blob, {
        contentType: a.mime,
        customMetadata: { sha256: a.hash, uploadedByUid: uid },
        cacheControl: 'private,max-age=0',
      });
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        if (user?.uid !== uid) task.cancel();
      });
      task.on(
        'state_changed',
        (s) => progress(s.totalBytes ? s.bytesTransferred / s.totalBytes : 0),
        (e) => {
          unsubscribe();
          reject(e);
        },
        () => {
          unsubscribe();
          resolve();
        },
      );
    });
  },
  async exists(uid, a) {
    assertAccount(uid);
    try {
      const m = await getMetadata(ref(storage(), a.path));
      return m.customMetadata?.sha256 === a.hash && m.size === a.size;
    } catch (e) {
      if ((e as { code?: string }).code === 'storage/object-not-found') return false;
      throw e;
    }
  },
  async remove(uid, path) {
    assertAccount(uid);
    try {
      await deleteObject(ref(storage(), path));
    } catch (e) {
      if ((e as { code?: string }).code !== 'storage/object-not-found') throw e;
    }
  },
};
export async function download(uid: string, a: Attachment) {
  assertAccount(uid);
  return getBlob(ref(storage(), a.path), a.size + 1);
}
export async function fetchPage(uid: string, cursor?: QueryDocumentSnapshot, count = 50) {
  assertAccount(uid);
  const c = collection(db, 'households', 'home', 'moments');
  const s = await getDocsFromServer(
    query(c, orderBy('eventAt', 'desc'), ...(cursor ? [startAfter(cursor)] : []), limit(count)),
  );
  return {
    values: s.docs.map((d) => decode(d.data())),
    cursor: s.docs.at(-1),
    more: s.size === count,
  };
}
export async function fetchChanges(uid: string, since: number, cursor?: QueryDocumentSnapshot) {
  assertAccount(uid);
  const s = await getDocsFromServer(
    query(
      collection(db, 'households', 'home', 'moments'),
      where('cloudUpdatedAt', '>=', Timestamp.fromMillis(since)),
      orderBy('cloudUpdatedAt'),
      ...(cursor ? [startAfter(cursor)] : []),
      limit(100),
    ),
  );
  return {
    values: s.docs.map((d) => decode(d.data())),
    cursor: s.docs.at(-1),
    more: s.size === 100,
  };
}
export async function fetchTags(uid: string) {
  assertAccount(uid);
  return (await getDocsFromServer(collection(db, 'households', 'home', 'momentTags'))).docs.map(
    (d) => d.data() as Tag,
  );
}
