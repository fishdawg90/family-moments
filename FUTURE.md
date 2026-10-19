# Follow-ups

## Data protection and operation

- Unattended independent backup scheduling outside a browser, with explicit billing approval, retention policy and recovery drills.
- Streaming/split mobile ZIP exports larger than 250 MB and a validated desktop-archive restore tool.
- A friendly version-restore comparison UI for weekly snapshots, retention/compaction controls and local-media capacity management.
- Verified physical Android acceptance of camera/microphone capture, permissions, shortcut identities, soft keyboard and airplane-mode cold start.
- A coordinated rules-maintenance PR in Our Basket/Our Days once repository write access is available.
- Full live two-phone verification after Firebase Storage provisioning, rules/CORS and deployment.
- Add format support when Android cameras produce HEIC/AVIF or less common audio variants; avoid browser transcoding of large video.
- Increasing the six-file limit would require a revised attachment metadata schema/rules strategy. The current cap is emulator-tested against Firestore’s expression limit for both create and edit.

## Product enhancements

- Month/year/all-time timelines, date/tag filters and full-text search.
- Keep voice clips available in every future memory view: show a microphone/count indicator on compact cards and authenticated, on-demand playback on the expanded memory. Use the existing `attachments.kind = 'audio'` schema for both voice-only and mixed-media moments, without requiring text or transcription. Additional viewing modes still need their layouts defined; the current review mode is Recent Moments.
- On this day, optional ages and milestone calculations.
- Child-specific memory books, photo/PDF albums and collages.
- Optional audio transcription and suggestions only with a separate, explicit privacy decision.
- Simple tag rename/merge management and profile administration.

No AI processing, public sharing, reminders, push notifications or rich text are enabled in this release.
