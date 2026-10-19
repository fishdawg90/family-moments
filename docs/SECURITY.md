# Shared security rules maintenance

All three applications use `la-spesa-5cc7a`. Publishing Firestore rules replaces the whole active ruleset. This repository’s `firestore.rules` preserves the old shopping/calendar clauses and adds explicit household-private `moments` and `momentTags` clauses.

Reference source snapshots inspected before implementation:

- [Our Basket source](https://github.com/fishdawg90/shop-list/tree/3818024561b27b3b9e48f945a48134d86041fc4c), including every requested `phone-site` file and `firestore.rules`.
- [Our Basket phone deployment](https://github.com/fishdawg90/shop-list-phone/tree/71029207f3b8d08e81b55c6bb81b492da34baa21); this is the built static phone site.
- [Our Days](https://github.com/fishdawg90/our-days/tree/be4dd440e248c5d8aeee06b27bb8625deced6f08), including every requested source, worker, Vite, workflow and rules file.

## Coordinated ownership

Before the first rules deployment, compare the actual console rules with the preserved source. Retain any newer live permissions after review. Make Family Moments the documented canonical combined rules source, then copy the same complete combined file into `shop-list/firestore.rules` and `our-days/firestore.rules`, each with a short comment pointing to the canonical repository. Add the same regression suite or a CI checksum check in those repositories. No older app may deploy its former rules after this change.

Existing remote repositories were not modified. This coordination remains an owner/access-dependent step; source inspection alone cannot prove which rules are currently live. Pages CI intentionally does not deploy Firebase rules, and `firebase.json` deliberately does not replace existing Firestore indexes.

## Enforcement

- Firestore membership is checked at `households/home/members/{request.auth.uid}`. Only the existing account’s own membership document is readable; clients cannot create memberships.
- New memories validate schema, actor, stable identity, bounded text/tag/attachment counts and attachment paths. Creation requires the signed-in actor. Edits preserve original author/profile/creation time and advance revision, or acknowledge attachment progress for the same operation. Hard deletion is denied.
- Metadata validation is deliberately bounded; authoritative per-format byte-size and MIME enforcement is in Storage rules. Six-file maximum lists are tested for creation and update within Firestore’s 1,000-expression limit.
- Storage uses `firestore.exists` for membership in the default database. Paths stay under `moments/home/{profile}/{moment}/{attachment}` with generated UUIDs. Upload size, MIME and SHA-256 metadata are checked. Existing objects cannot be replaced with a different hash/size/MIME. Members can retrieve and delete private objects; the app additionally checks current document references before scheduled cleanup.
- Objects are private. The app stores paths, not public/bearer download URLs, and uses authenticated `getBlob`. The owner must apply bucket CORS for the GitHub Pages origin.
- Cached membership permits a previously authorised account’s offline access. Revocation cannot be learned while offline. On reconnection the app checks the server and rules still block unauthorised cloud access.
- IndexedDB separation is an application privacy boundary, not device encryption. An unlocked shared browser/developer-tools session can access its local data; sign-out does not erase irreplaceable pending files. No claim of encrypted-at-rest browser backups is made.
- Public Firebase web config is intentionally reused. There are no private keys or service accounts in frontend code. The development fixture and emulator wiring are gated to development builds on localhost and are absent from production behaviour.

The automated rules suite checks both existing applications, household membership, two parents, unauthenticated/outsider access, invalid records/paths, stale edits, private Storage access, immutable-file identity, and actual oversized upload rejection. It runs only on the `demo-family-moments` emulators.
