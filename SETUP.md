# Owner setup — remaining steps

The local application and tests are prepared. No live Firebase rules, billing settings or existing app deployments were changed. There is no verified live Family Moments deployment yet.

The owner has now created the GitHub repository and confirmed the existing bucket as `gs://la-spesa-5cc7a.firebasestorage.app`. This public bucket name is configured as the app default, so a GitHub Actions bucket variable is optional. Live rules, CORS and two-phone operation still need verification.

## 1. Create the GitHub repository

Open [Create fishdawg90/family-moments](https://github.com/new?owner=fishdawg90&name=family-moments&description=Private%20offline-first%20family%20memories).

Create an empty repository named **family-moments**. Do not add a README, licence or `.gitignore`; these files are already prepared locally. A public repository works with GitHub Pages on GitHub Free. The app source and Firebase public web configuration would be public; family records and attachments remain private behind Firebase rules. A private repository requires an eligible GitHub plan for Pages.

After creation, the local files can be pushed. The work directory is `C:\Users\rossm\OneDrive\Documents\ChatGPT\Moments`. No credentials belong in Git. The `reference/`, `tools/jre/`, `node_modules/`, local environment file and test logs are ignored.

The GitHub connector identifies the account as `fishdawg90`, but no repository-creation capability is exposed. The available browser is signed out of GitHub. Creating the empty repository is the first owner action needed; Codex can then attempt the push and finish the remaining non-billing setup with whatever access is available.

## 2. Check Firebase Storage and billing

Open [Storage in the existing project](https://console.firebase.google.com/project/la-spesa-5cc7a/storage).

- If a bucket is already shown, copy its exact name. Do not create another bucket.
- If Storage has not been provisioned, use **Get started**, upgrade the existing project to **Blaze** if asked, and create its default bucket. Pick a suitable region deliberately; the location is difficult to change afterwards. Use private/production access rules.
- Do not create another Firebase project, web app, account system or household membership collection.

Bucket names may end in `.appspot.com` or `.firebasestorage.app`. This app deliberately makes no assumption about which exists. The source apps do not declare a bucket, and live bucket/billing status could not be inspected with the available access.

[Firebase’s current Storage billing requirements](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024) require Blaze. Eligible no-cost allowances can still apply, but storage, operations and download traffic can incur charges. The Storage rules also read membership documents from Firestore, which can incur reads.

Create a budget with email alerts in [Google Cloud Billing budgets](https://console.cloud.google.com/billing/budgets?project=la-spesa-5cc7a), for example notifications at 50%, 90% and 100% of an amount you choose. A budget alert **does not cap spending**. Review [Firebase Storage usage](https://console.firebase.google.com/project/la-spesa-5cc7a/storage/usage) and [Cloud Storage buckets](https://console.cloud.google.com/storage/browser?project=la-spesa-5cc7a) for stored bytes and downloads; use Billing reports for actual charges.

## 3. Configure the verified bucket and Pages

Once the repository exists:

1. The verified bucket is already configured in source. Optionally override it using `FIREBASE_STORAGE_BUCKET` in [repository Actions variables](https://github.com/fishdawg90/family-moments/settings/variables/actions), without `gs://`.
2. In [Pages settings](https://github.com/fishdawg90/family-moments/settings/pages), choose **GitHub Actions** as the build/deployment source.
3. Push the prepared source to `main` and inspect [Actions](https://github.com/fishdawg90/family-moments/actions). The workflow checks types, unit tests, security rules, actual SDK emulator interactions, production build and browser/PWA behaviour before deploying.

Changing the variable requires another workflow run/build. The bucket name is public configuration, not a credential. No Firebase service-account key, GitHub secret containing a private key, or frontend password is needed.

## 4. Publish rules safely, preserving the older apps

Before publishing, open [Firestore Rules](https://console.firebase.google.com/project/la-spesa-5cc7a/firestore/rules) and save the currently active rules locally. Compare them with this repository’s combined `firestore.rules`. This file preserves the shopping and calendar rules from the inspected repositories, but the live console may contain newer changes.

Publish the **complete combined file**. Never replace it with a memories-only snippet. Publish `storage.rules` separately under Storage → Rules. If Storage already contains unrelated permissions, preserve those and merge the moments stanza rather than replacing an existing working policy.

Storage’s first use of cross-service `firestore.exists` may prompt the owner to enable the Firebase Storage service agent’s access to Firestore. Review and accept the specific cross-service integration prompt. Do not make the bucket public or grant access to all signed-in accounts.

If using Firebase CLI instead of the consoles:

```sh
pnpm exec firebase login
# After comparing active rules and reviewing the intended replacement:
pnpm exec firebase deploy --project la-spesa-5cc7a --only firestore:rules,storage
```

This is intentionally absent from automatic deployment. It is a security-sensitive change to a project shared by three apps. See [docs/SECURITY.md](docs/SECURITY.md) to update both older repositories’ copies and avoid a later rules regression. No new Firestore composite indexes are required; the config does not deploy or replace existing indexes.

## 5. Apply CORS for authenticated browser downloads

Use [Google Cloud Shell](https://console.cloud.google.com/home/dashboard?project=la-spesa-5cc7a) (terminal icon at the top). Upload this repository’s `cors.json`, then run with the actual bucket name:

```sh
gcloud storage buckets describe gs://ACTUAL_BUCKET_NAME --format="json(cors_config)"
gcloud storage buckets update gs://ACTUAL_BUCKET_NAME --cors-file=cors.json
```

Save the existing CORS policy first. If it serves other apps, merge the GitHub Pages origin/methods with it instead of discarding existing entries. CORS does not grant access; authenticated Firebase Storage rules still govern downloads. The supplied origin is exactly `https://fishdawg90.github.io`, with no path or trailing slash.

## 6. Install and verify both phones

After a green deployment, open each URL in Android Chrome:

- [Giulia’s Moments](https://fishdawg90.github.io/family-moments/giulia/)
- [Nina’s Moments](https://fishdawg90.github.io/family-moments/nina/)
- [My Moments](https://fishdawg90.github.io/family-moments/me/)

Sign in with each parent’s existing account if Chrome has not reused its saved Firebase session. Confirm one text moment and one attachment reach the other phone. Then use Chrome’s menu → **Add to Home screen** on each profile URL. If Chrome offers a shortcut instead of a separate installed app, accept the profile-specific shortcut and check its launch URL.

Distinct manifest IDs are implemented according to [Chrome’s PWA identity guidance](https://developer.chrome.com/docs/capabilities/pwa-manifest-id). Device-specific installation behaviour still needs the [Android checklist](ANDROID-CHECKLIST.md), particularly camera, microphone, keyboard and airplane-mode reopening. In Settings → Backups, download a complete media ZIP and keep it outside the browser.
