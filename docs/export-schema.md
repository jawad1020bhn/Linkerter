# Export schema

Current version: **`schemaVersion: "3.0"`**. JSON and CSV are two projections of the same record; the CSV flattens the JSON fields into columns and carries no additional data.

Schema 3 answers one question: what does a person reviewing the file need? Everything the extension uses internally for merging, retention, ordering and provenance stays in the extension and is no longer exported.

## Envelope

| Field | Meaning |
|---|---|
| `schemaVersion` | Export shape version. `"3.0"` removed internal bookkeeping from each post. |
| `exportedAt` | When the file was produced. |
| `scope` | Whether the file holds every detected post or only the selected category. |
| `selectedCategory` | `"all"` or the category the export was filtered to. |
| `fieldsIncluded` | The state of the five field toggles: `fullText`, `emails`, `jobTitles`, `postAge`, `postMetadata`. |
| `monitorRun` | The run that produced the records (id, timing, pacing, limits). |
| `extractionNotes` | DOM-compatibility warnings, if any. |
| `posts` | The projected records. |

## Each post

| Field | Type | Notes |
|---|---|---|
| `id` | string | Stable identity. The post URN when the card exposes one, otherwise a canonical permalink, otherwise a text hash. This is the deduplication key across runs. |
| `permalink` | string \| null | Always projected, even when the metadata toggle is off — an export whose posts cannot be opened is not usable. Derived from the post URN when no anchor canonicalizes. |
| `category` | enum | `open_role`, `recruiter_search`, `possible`, `job_seeker`, `hiring_discussion`, `closed`, `none`. |
| `confidence` | string | Verdict strength; `partial` means the text was not fully available. |
| `score` | number \| null | Hiring score behind the category. |
| `evidence` | string[] | What matched, with its offset in the text. **Kept deliberately**: it is the only explanation of the score, and without it a wrong verdict cannot be diagnosed. |
| `signals.email` | `"none"` \| `"partial"` \| `"full"` | Whether a usable application mailbox is present. |
| `signals.jobLink` | boolean | Whether the post links to a job board or careers page. |
| `author.name` | string \| null | The content author. For a shared post this is the original author, not the profile that reshared it. |
| `author.profileUrl` | string \| null | Canonical LinkedIn profile or company URL. |
| `extracted.emails` | string[] | Application mailboxes found in the post text. |
| `extracted.jobTitles` | string[] | Job-title candidates. |
| `extracted.hashtags` | string[] | Hashtags, without the leading `#`. |
| `extracted.links` | string[] | Canonicalized links found in the post. |
| `postAge.label` | string \| null | The age exactly as LinkedIn wrote it (`8 h`, `18 oct.`, `27 sept.`). |
| `postAge.publishedAt` | string \| null | ISO-8601 publish time. Taken from a `datetime` attribute when present, otherwise parsed from an absolute EN/FR/AR date label at 12:00 UTC. |
| `fullText` | string | Post text with card chrome removed: no accessibility label, actor name or headline, timestamp, follow/like/comment/permalink/translate labels, reaction counts or comment bodies. Only when the toggle is on. |

## Removed in schema 3

| Removed | Why | Where it still lives |
|---|---|---|
| `sourcePostId` | Duplicate of `id` now that `id` is the post URN. | Internal record. |
| `reviewLabel` | Local review state; null in every export observed. | Popup review controls. |
| `firstSeenAt`, `lastSeenAt`, `metricsCapturedAt` | Per-run bookkeeping. Run timing is in `exportedAt` and `monitorRun`. | Internal record; retention and ordering depend on it. |
| `historyStore`, `historyStores` | Provenance used to merge current-run and stored records. | Internal record. |
| `contentComplete`, `extractionStatus` | Two fields for one fact, and `confidence: "partial"` already reports it. | Internal record; text merging depends on it. |
| `metrics` (reactions, comments, reposts, views) | Counts are only trustworthy where LinkedIn exposes typed labels; `views` was null in every export observed. | Internal record and the popup result row. |
| `postAge.ageSecondsApprox`, `postAge.ageDaysApprox` | Derivable from `publishedAt`. | Internal record; the popup's "Posted …" and stale marker use them. |
| 12 of the 14 `signals` flags | Intermediate classifier state. `evidence` already lists what matched, with offsets. | Internal record. |
| `signals.emailLink`, `extracted.emails` overlap | `signals.email` is the one representation kept. | — |

Nothing was removed from the records the extension keeps: deduplication, retention, history merging, ordering and the popup result rows all still use the full internal shape. Only the downloaded file changed.

## Field toggles

| Toggle | Preference key | Controls |
|---|---|---|
| Full post text | `includeFullText` | `fullText` |
| Email addresses | `includeEmails` | `extracted.emails` |
| Job-title candidates | `includeJobTitles` | `extracted.jobTitles` |
| Post age | `includePostAge` | `postAge` |
| Author, links, hashtags | `includePostMetadata` | `author`, `extracted.hashtags`, `extracted.links` |

`permalink`, `id`, `category`, `confidence`, `score`, `evidence` and `signals` are always exported. A `includeMetrics: false` preference stored by schema 2 is honoured as `includePostAge: false`, so an existing choice is not silently reversed.
