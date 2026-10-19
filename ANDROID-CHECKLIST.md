# Real Android Chrome acceptance checklist

These tests require the two actual phones and deployed live configuration. Desktop Chromium results do not count as completion of this checklist.

- [ ] Open all three URLs directly and refresh each. Confirm its profile name and accent.
- [ ] Install/add each profile from its own URL. Launch Giulia, Nina, My Moments, then Giulia again. Confirm no shortcut takes on the last-used profile.
- [ ] After shell caching and an online sign-in, enable airplane mode, close Chrome/PWA, launch every shortcut and verify capture loads.
- [ ] Save text offline, force-close/reopen, and find the pending record and unfinished draft.
- [ ] Tap Photo → Take photo; cancel the camera and choose from gallery instead. Attach two gallery images; remove one; save photo-only; check orientation and clarity.
- [ ] Tap Video → Record video, then separately Video → Choose from gallery. Confirm the gallery opens without browsing Files and selected clips remain playable after reopening.
- [ ] Capture a 10–60 second video and play it locally. Try a file over 100 MB and verify a friendly rejection with the capture intact.
- [ ] Record microphone audio; stop, preview, discard; record again, attach, save offline and reopen. Deny microphone permission and verify the existing-audio fallback.
- [ ] Use Files to attach a PDF from Android’s file picker, save offline, reopen and download/open it. Test DOCX/TXT without executing document content. Confirm there is no separate Document button.
- [ ] With the keyboard open at 360–430 CSS px, type multiline text/emoji and confirm Photo, Video, Audio and Files stay fixed beneath the text box while tags/recent memories scroll. Reach Save without hidden controls or jumps. Test a large font setting.
- [ ] Use Android Back/swipe while typing: dismiss the keyboard/focus with the draft intact. Open Photo/Video choices, cancel the native camera/gallery picker, then swipe Back to close the choices. Expand an event date, a saved memory and its deletion confirmation: Back closes each current interaction before returning to capture or leaving the browser. Repeat typing/open/close several times to check there are no stale Back steps.
- [ ] Swipe Back during audio recording. Confirm the microphone stops and the recording preview remains available to attach and save.
- [ ] Verify an empty or tags-only capture cannot be saved. Save clears text only after local success; Undo moves accidental saves to Recently deleted.
- [ ] Use a retrospective event date, including around London clock changes; check the displayed date on the other phone.
- [ ] Turn internet back on. Confirm metadata and private files arrive on the other parent’s account; pending attachments remain identifiable until complete.
- [ ] Interrupt a video upload with airplane mode, close/reopen and retry. Confirm one moment/one object identity and eventual success.
- [ ] Edit one moment on both phones while one is offline. Check review of both texts, dates, tags and attachment counts; retain both versions.
- [ ] Sign out with pending data and read the warning. Sign in as the other account; verify the first account’s local pending capture does not appear or upload.
- [ ] Delete and restore a record. After the seven-day cleanup window, restore from a phone still holding its files and verify they upload again.
- [ ] Create two snapshots without changes; verify the local backup object count does not grow for unchanged content (automated test covers this too). Download a media ZIP, retain it elsewhere and test restore in a fresh browser profile using the same account.
- [ ] Try low device storage; verify errors retain the capture. Never clear site data to resolve a problem until unsynchronised media is exported.
- [ ] Confirm Our Basket and Our Days still sign in and work, including shopping list/pantry operations and calendar phrase/history learning.
- [ ] Review Firebase Billing and Storage usage after representative videos from both phones.
