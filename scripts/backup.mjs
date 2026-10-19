// Authenticated, resumable desktop export. No admin key and no public download URLs.
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import {
  getFirestore,
  getDoc,
  doc,
  collection,
  getDocs,
  query,
  orderBy,
  limit,
  startAfter,
} from 'firebase/firestore';
import { getStorage, getBytes, ref } from 'firebase/storage';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
const bucket = process.argv[2],
  out = process.argv[3];
if (!bucket || !out) {
  console.error('Usage: node scripts/backup.mjs ACTUAL_BUCKET_NAME BACKUP_DIRECTORY');
  process.exit(1);
}
const output = resolve(out);
await mkdir(resolve(output, 'media'), { recursive: true });
await mkdir(resolve(output, 'snapshots'), { recursive: true });
const input = createInterface({ input: process.stdin, output: process.stdout });
const email = await input.question('Existing household email: ');
input.close();
async function hiddenPassword() {
  if (!process.stdin.isTTY)
    throw new Error('Use an interactive terminal so your password can stay hidden.');
  process.stdout.write('Password (hidden): ');
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = '';
    const cleanup = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.off('data', onData);
      process.stdout.write('\n');
    };
    const onData = (chunk) => {
      for (const char of chunk.toString()) {
        if (char === '\u0003') {
          cleanup();
          reject(new Error('Cancelled.'));
          return;
        }
        if (char === '\r' || char === '\n') {
          cleanup();
          resolve(value);
          return;
        }
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else if (char >= ' ') value += char;
      }
    };
    process.stdin.on('data', onData);
  });
}
const app = initializeApp({
  apiKey: 'REMOVED_FIREBASE_WEB_API_KEY',
  authDomain: 'la-spesa-5cc7a.firebaseapp.com',
  projectId: 'la-spesa-5cc7a',
  appId: '1:767696505467:web:82873e463a2f93782bb0de',
});
const auth = getAuth(app),
  db = getFirestore(app),
  storage = getStorage(app, `gs://${bucket.replace(/^gs:\/\//, '')}`);
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
try {
  const login = await signInWithEmailAndPassword(auth, email, await hiddenPassword());
  if (!(await getDoc(doc(db, `households/home/members/${login.user.uid}`))).exists())
    throw new Error('This account is not a household member.');
  const moments = [];
  let cursor;
  do {
    const page = await getDocs(
      query(
        collection(db, 'households/home/moments'),
        orderBy('eventAt', 'desc'),
        ...(cursor ? [startAfter(cursor)] : []),
        limit(100),
      ),
    );
    moments.push(...page.docs.map((d) => d.data()));
    cursor = page.size === 100 ? page.docs.at(-1) : undefined;
  } while (cursor);
  const tags = (await getDocs(collection(db, 'households/home/momentTags'))).docs.map((d) =>
    d.data(),
  );
  const attachments = [
    ...new Map(
      moments
        .filter((m) => !m.deletedAt)
        .flatMap((m) => m.attachments)
        .map((a) => [a.hash, a]),
    ).values(),
  ];
  const missing = [];
  for (let i = 0; i < attachments.length; i++) {
    const a = attachments[i];
    if (
      !/^[a-f0-9]{64}$/.test(a.hash) ||
      !/^moments\/home\/[a-z][a-z0-9-]*\/[a-f0-9-]{36}\/[a-f0-9-]{36}$/.test(a.path)
    )
      throw new Error('Invalid remote attachment reference.');
    const destination = resolve(output, 'media', a.hash);
    try {
      if (sha(await readFile(destination)) === a.hash) {
        console.log(`${i + 1}/${attachments.length} already backed up`);
        continue;
      }
    } catch {}
    try {
      const bytes = Buffer.from(await getBytes(ref(storage, a.path), a.size + 1));
      if (sha(bytes) !== a.hash) throw new Error('SHA-256 integrity check failed');
      await writeFile(destination + '.partial', bytes);
      await rename(destination + '.partial', destination);
      console.log(`${i + 1}/${attachments.length} downloaded`);
    } catch (e) {
      missing.push({ id: a.id, path: a.path, error: e.message });
      console.error(`Missing ${a.name}: ${e.message}`);
    }
  }
  const snapshot = {
    format: 'family-moments-desktop-v1',
    uid: login.user.uid,
    bucket,
    at: new Date().toISOString(),
    moments,
    tags,
    missing,
    notice:
      'Cloud records and non-deleted cloud media only. Export pending local records from each phone separately.',
  };
  const bytes = Buffer.from(JSON.stringify(snapshot, null, 2)),
    id = sha(bytes);
  await writeFile(resolve(output, 'snapshots', `${id}.json`), bytes);
  await writeFile(resolve(output, 'latest.json'), bytes);
  console.log(
    `Saved ${moments.length} records and ${attachments.length - missing.length}/${attachments.length} unique referenced files to ${output}.`,
  );
  if (missing.length) process.exitCode = 2;
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await signOut(auth);
}
