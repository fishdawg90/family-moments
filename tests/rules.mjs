import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import { collection, doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getBytes, deleteObject } from 'firebase/storage';
const projectId = 'demo-family-moments';
const env = await initializeTestEnvironment({
  projectId,
  firestore: { host: '127.0.0.1', port: 8080, rules: await readFile('firestore.rules', 'utf8') },
  storage: { host: '127.0.0.1', port: 9199, rules: await readFile('storage.rules', 'utf8') },
});
let passed = 0;
async function test(name, fn) {
  await fn();
  passed++;
  console.log(`PASS ${name}`);
}
const alice = env.authenticatedContext('parent-a'),
  bob = env.authenticatedContext('parent-b'),
  outsider = env.authenticatedContext('outsider'),
  anon = env.unauthenticatedContext();
const moment = (id) => ({
  id,
  profileId: 'giulia',
  text: 'A private memory',
  tagIds: [],
  eventAt: '2026-10-19T10:00:00.000Z',
  createdAt: '2026-10-19T10:00:00.000Z',
  updatedAt: '2026-10-19T10:00:00.000Z',
  createdByUid: 'parent-a',
  updatedByUid: 'parent-a',
  revision: 1,
  attachments: [],
  deletedAt: null,
  schemaVersion: 1,
  lastOpId: randomUUID(),
});
try {
  await env.withSecurityRulesDisabled(async (c) => {
    for (const uid of ['parent-a', 'parent-b'])
      await setDoc(doc(c.firestore(), `households/home/members/${uid}`), { member: true });
  });
  for (const kind of ['list', 'pantry', 'purchases', 'catalogue', 'usageCycles'])
    await test(`existing shopping ${kind} create/read/update/delete`, async () => {
      const r = doc(alice.firestore(), `households/home/${kind}/test`);
      await assertSucceeds(setDoc(r, { name: 'Milk' }));
      await assertSucceeds(getDoc(doc(bob.firestore(), r.path)));
      await assertSucceeds(updateDoc(r, { name: 'Bread' }));
      await assertSucceeds(deleteDoc(r));
    });
  await test('calendar phrases remain valid and private', async () => {
    const path = 'households/home/appointmentPhrases/description__dentist',
      data = {
        kind: 'description',
        text: 'Dentist',
        normalised: 'dentist',
        useCount: 1,
        lastUsedAt: '2026-10-19T10:00:00Z',
      };
    await assertSucceeds(setDoc(doc(alice.firestore(), path), data));
    await assertSucceeds(updateDoc(doc(bob.firestore(), path), { useCount: 2 }));
    await assertSucceeds(getDoc(doc(bob.firestore(), path)));
    await assertFails(getDoc(doc(outsider.firestore(), path)));
    await assertFails(deleteDoc(doc(alice.firestore(), path)));
  });
  await test('calendar history create/read stays authorised, immutable', async () => {
    const path = 'households/home/appointmentHistory/test',
      r = doc(alice.firestore(), path);
    await assertSucceeds(
      setDoc(r, {
        descriptionPhrases: ['Dentist'],
        locationPhrases: ['Woking'],
        eventDates: ['2026-10-19'],
        submittedAt: '2026-10-19T10:00:00Z',
        createdBy: 'parent-a',
      }),
    );
    await assertSucceeds(getDoc(doc(bob.firestore(), path)));
    await assertFails(updateDoc(r, { createdBy: 'parent-b' }));
    await assertFails(deleteDoc(r));
  });
  await test('membership self lookup only and no self enrollment', async () => {
    await assertSucceeds(getDoc(doc(alice.firestore(), 'households/home/members/parent-a')));
    await assertFails(getDoc(doc(alice.firestore(), 'households/home/members/parent-b')));
    await assertFails(setDoc(doc(outsider.firestore(), 'households/home/members/outsider'), {}));
    await assertFails(getDocs(collection(alice.firestore(), 'households/home/members')));
  });
  const id = randomUUID(),
    path = `households/home/moments/${id}`,
    r = doc(alice.firestore(), path),
    value = moment(id);
  await test('member moment create/read and collection query', async () => {
    await assertSucceeds(setDoc(r, value));
    await assertSucceeds(getDoc(doc(bob.firestore(), path)));
    await assertSucceeds(getDocs(collection(bob.firestore(), 'households/home/moments')));
  });
  await test('outsider and anonymous reads/writes denied for all three apps', async () => {
    for (const ctx of [outsider, anon])
      for (const kind of [
        'moments',
        'momentTags',
        'list',
        'appointmentPhrases',
        'appointmentHistory',
      ]) {
        await assertFails(getDoc(doc(ctx.firestore(), `households/home/${kind}/${id}`)));
        await assertFails(setDoc(doc(ctx.firestore(), `households/home/${kind}/${id}`), value));
      }
  });
  await test('author spoofing, missing fields, invalid profiles and empty moments denied', async () => {
    for (const patch of [
      { createdByUid: 'parent-b' },
      { updatedByUid: 'parent-b' },
      { profileId: '../private' },
      { text: '' },
      { revision: 20 },
      { extra: 'bad' },
      { schemaVersion: 2 },
    ]) {
      const next = randomUUID();
      await assertFails(
        setDoc(doc(alice.firestore(), `households/home/moments/${next}`), {
          ...moment(next),
          ...patch,
        }),
      );
    }
    const next = randomUUID();
    await assertFails(
      setDoc(doc(alice.firestore(), `households/home/moments/${next}`), { id: next }),
    );
  });
  await test('both parents can edit using new revision, stale and spoofed edits denied', async () => {
    await assertSucceeds(
      updateDoc(doc(bob.firestore(), path), {
        text: 'A correction',
        revision: 2,
        updatedByUid: 'parent-b',
        lastOpId: randomUUID(),
      }),
    );
    await assertFails(
      updateDoc(r, {
        text: 'stale',
        revision: 2,
        updatedByUid: 'parent-a',
        lastOpId: randomUUID(),
      }),
    );
    await assertFails(
      updateDoc(r, {
        text: 'spoof',
        revision: 3,
        createdByUid: 'parent-b',
        updatedByUid: 'parent-a',
        lastOpId: randomUUID(),
      }),
    );
    await assertFails(deleteDoc(r));
  });
  await test('tag create/deduplicate identity and immutability', async () => {
    const path = 'households/home/momentTags/first%20word',
      r = doc(alice.firestore(), path);
    await assertSucceeds(
      setDoc(r, { id: 'first%20word', label: 'First Word', canonical: 'first word' }),
    );
    await assertSucceeds(getDoc(doc(bob.firestore(), path)));
    await assertFails(
      setDoc(doc(alice.firestore(), 'households/home/momentTags/wrong'), {
        id: 'other',
        label: 'Bad',
        canonical: 'bad',
      }),
    );
    await assertFails(updateDoc(r, { label: 'overwrite' }));
  });
  await test('maximum attachment metadata and invalid object paths', async () => {
    const id = randomUUID(),
      value = moment(id);
    value.attachments = Array.from({ length: 6 }, () => {
      const aid = randomUUID();
      return {
        id: aid,
        kind: 'image',
        name: 'photo.jpg',
        mime: 'image/jpeg',
        size: 100,
        hash: 'a'.repeat(64),
        path: `moments/home/giulia/${id}/${aid}`,
        remote: false,
      };
    });
    const r = doc(alice.firestore(), `households/home/moments/${id}`);
    await assertSucceeds(setDoc(r, value));
    await assertSucceeds(updateDoc(r, { revision: 2, lastOpId: randomUUID(), text: 'changed' }));
    const next = randomUUID();
    await assertFails(
      setDoc(doc(alice.firestore(), `households/home/moments/${next}`), {
        ...moment(next),
        attachments: [{ ...value.attachments[0], path: 'unrelated/object' }],
      }),
    );
  });
  const objectPath = `moments/home/giulia/${id}/${randomUUID()}`,
    object = ref(alice.storage(), objectPath),
    metadata = {
      contentType: 'application/pdf',
      customMetadata: { sha256: 'a'.repeat(64), uploadedByUid: 'parent-a' },
    };
  await test('authenticated media upload, read, and idempotent same-hash retry', async () => {
    await assertSucceeds(uploadBytes(object, new Uint8Array([1, 2, 3]), metadata));
    await assertSucceeds(getBytes(ref(bob.storage(), objectPath)));
    await assertSucceeds(uploadBytes(object, new Uint8Array([1, 2, 3]), metadata));
  });
  await test('Storage uses actual Firestore membership', async () => {
    for (const ctx of [anon, outsider]) {
      await assertFails(getBytes(ref(ctx.storage(), objectPath)));
      await assertFails(
        uploadBytes(
          ref(ctx.storage(), `moments/home/nina/${randomUUID()}/${randomUUID()}`),
          new Uint8Array([1]),
          metadata,
        ),
      );
      await assertFails(deleteObject(ref(ctx.storage(), objectPath)));
    }
  });
  await test('Storage denies arbitrary paths, executable MIME, missing hash and replacement bytes identity', async () => {
    for (const path of [
      'public/x.pdf',
      `moments/another/giulia/${id}/${randomUUID()}`,
      `moments/home/invalid_profile/${id}/${randomUUID()}`,
      `moments/home/giulia/bad-id/${randomUUID()}`,
    ])
      await assertFails(uploadBytes(ref(alice.storage(), path), new Uint8Array([1]), metadata));
    await assertFails(
      uploadBytes(
        ref(alice.storage(), `moments/home/me/${randomUUID()}/${randomUUID()}`),
        new Uint8Array([1]),
        { ...metadata, contentType: 'text/html' },
      ),
    );
    await assertFails(
      uploadBytes(
        ref(alice.storage(), `moments/home/me/${randomUUID()}/${randomUUID()}`),
        new Uint8Array([1]),
        { contentType: 'application/pdf' },
      ),
    );
    await assertFails(
      uploadBytes(object, new Uint8Array([1, 2, 3]), {
        ...metadata,
        customMetadata: { sha256: 'b'.repeat(64), uploadedByUid: 'parent-a' },
      }),
    );
  });
  await test('Storage enforces real 15 MB image and 100 MB video limits', async () => {
    const path = () => `moments/home/me/${randomUUID()}/${randomUUID()}`;
    await assertSucceeds(
      uploadBytes(ref(alice.storage(), path()), new Uint8Array(15 * 1024 * 1024), {
        ...metadata,
        contentType: 'image/jpeg',
      }),
    );
    await assertFails(
      uploadBytes(ref(alice.storage(), path()), new Uint8Array(15 * 1024 * 1024 + 1), {
        ...metadata,
        contentType: 'image/jpeg',
      }),
    );
    await assertFails(
      uploadBytes(ref(alice.storage(), path()), new Uint8Array(100 * 1024 * 1024 + 1), {
        ...metadata,
        contentType: 'video/mp4',
      }),
    );
  });
  await test('member can remove media, default-deny remains intact', async () => {
    await assertSucceeds(deleteObject(object));
    await assertFails(setDoc(doc(alice.firestore(), 'unrelated/data'), { open: true }));
    await assertFails(setDoc(doc(alice.firestore(), 'households/elsewhere/moments/x'), value));
  });
  console.log(`\n${passed} security regression scenarios passed.`);
} finally {
  await env.cleanup();
}
