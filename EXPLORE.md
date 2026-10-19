# Five ways to revisit a moment

Tap the compass button, **Explore moments**, in the header of any profile. Capture and Recent Moments remain available. Explore reads the same account-partitioned, profile-scoped IndexedDB records, including unsynchronised saves; it introduces no new Firebase collections, permissions or data processing.

| View           | Experience                                                                                                                                                     | Existing information used                                                                                                                               |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scrapbook      | A tactile wall of taped photographs, coloured notes and keepsakes. Open any scrap for the full record.                                                         | Text, event date, attachment categories, locally cached photographs, tags.                                                                              |
| Night Sky      | Each memory is a star; shared tags form connections. Filter by a tag to discover a constellation. Untagged memories remain visible in All stars.               | Actual shared tag IDs, text labels and voice markers. Positions are decorative, not inferred relationships.                                             |
| Story River    | Follow a trail from the oldest loaded event to the newest, pausing at dates and month markers.                                                                 | Event dates shown in Europe/London, original words, tags and voice indicators.                                                                          |
| Listening Room | A private record collection of voice memories, with selectable records and explicit playback. Other attachments are accessible by opening the complete memory. | Audio attachments, original text and event dates. No transcription, generated speech or autoplay. A text-only collection offers a quiet memory instead. |
| Lucky Dip      | Draw a folded memory and unfold it before opening the whole entry. No repeats until the loaded collection has been drawn and reshuffled.                       | Random selection of existing records; original event date, text, tags and attachment access.                                                            |

Opening a memory preserves the current page, constellation filter, selected record or lucky draw. Back returns to that view; another Back returns to the five choices, then to capture. Editing uses the existing durable draft and revision-conflict workflow. Voice playback pauses when its view is hidden.

## Trying a collection now

Enable **Try fictional sample memories** to explore twelve invented memories across six months, including text, illustrations, voice, video and document cards. Sample illustrations are placeholders. Sample audio is a locally generated chime explicitly labelled as a sample, not a family voice. Video/document samples are illustrative cards rather than pretend playable/downloadable files.

Samples are created in memory only: they never enter IndexedDB, sync queues, exports, backups or Firebase. They cannot be edited into real records. Switch the sample checkbox off to return to the real collection. Reloading starts with the normal capture screen and samples off.

## Larger collections and privacy

Explore initially includes up to 60 locally cached records. **Load older moments** includes further local records or requests another page of cloud metadata using the existing authenticated transport. Scrapbook and Night Sky display 24 items per page. Night Sky draws at most 120 connections per page to keep touch browsing legible. The exact loaded count is shown; Lucky Dip avoids repeats within that loaded set.

Photographs on scrapbook cards use local copies only. Uncached cloud photos show a placeholder; open the record to load its private attachments explicitly through the existing Firebase SDK. Only the selected Listening Room record loads media previews. No lifetime media download, external image service, analytics or AI interpretation is introduced.

Browser automation covers all five layouts at a narrow phone viewport, sample isolation, real-record editing, profile/deletion filtering, audio playback, Back navigation, no-repeat draws and a 72-record paginated collection. Physical Android keyboard, gestures and media playback remain on the Android checklist.
