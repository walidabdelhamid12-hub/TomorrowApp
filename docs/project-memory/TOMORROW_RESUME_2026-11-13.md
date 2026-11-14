# TomorrowApp — TOMORROW RESUME — 2026-11-13

## Resume instruction
When user says **"Tomorrow Resume"** or **"افتح Tomorrow Resume"**, start here, then reconcile with actual current branch, git status, and latest commits. This is a handover snapshot, not proof of later work. Read docs/project-memory/MASTER_ROADMAP.md, CURRENT_STATE.md, DAILY_HANDOVER.md, ACCOUNTING_DECISIONS.md, WORK_RULES.md, FUTURE_MODULES_AND_ZAKAT.md. Some older files contain superseded status; prefer the verified 2026-11-13 checkpoint below.

## Project and last verified checkpoint
- Repository: `walidabdelhamid12-hub/TomorrowApp`
- Local Windows project: `D:\Mobile Apps\TomorrowApp`
- Working branch: `codex/finance-8-6-expenses-redesign` (never merge to main without approval).
- Last **user-confirmed local code checkpoint and push**: `bcc6b72` — `feat(documents): add isolated local file vault foundation`.
- User's output showed `COMMIT EXIT: 0`, `PUSH EXIT: 0`, branch updated `d47157c..bcc6b72`, and no tracked changes afterward.
- Many unrelated untracked backup, script, report and Documents files remain on local disk; DO NOT delete, reset, clean, stage or assume these are pushed. Git's tracked working tree was clean.
- If this handover is committed separately on GitHub, the remote branch may be **ahead of local bcc6b72**. Verify and safely fast-forward before the next code task; preserve untracked files. Do not assume local/remote parity.

## Phase 9: Documents and smart receipts — progress
- 9.2B-1F: module-scoped Documents mutation queue serializes create(), createIfHashAbsent(), update(), recoverUnindexed() across wrappers sharing one loaded JS module in one runtime. Does NOT guarantee cross-runtime/process/module safety. Checkpoint `d47157c`.
- **9.2C-1B-1 DONE, COMMITTED, PUSHED**: five new files only:
  1. `src/features/documents/vault/vaultTypes.ts`
  2. `src/features/documents/vault/vaultPaths.ts`
  3. `src/features/documents/vault/vaultFileSystem.ts`
  4. `src/features/documents/vault/localFileVault.ts`
  5. `tests/documents-vault-9-2c-1b-1.test.cjs`
- Foundation is isolated, uses fake filesystem port, staged file promotion and final SHA-256/size verification, no overwrite, failure-safe behavior and same-runtime serialization. **Not yet an Expo adapter or Android-tested native file vault; no repository integration, Finance posting, OCR or UI**.
- Verification on user's project: new Vault tests **13/13 PASS**, full Documents tests **72/72 PASS** (8 test files), TypeScript `npx tsc --noEmit` EXIT 0, scoped ESLint EXIT 0, staged diff check EXIT 0; five files / 284 inserted lines.
- PowerShell LF/CRLF warning during git add was benign; staging recovered and push succeeded.
- **NEXT TASK: 9.2C-1B-2 — Expo FileSystem adapter**, one narrowly scoped task, review real SDK 58 types and runtime assumptions, adapter + injected fake tests, then Android native verification before claiming persistent file storage. No automatic deletion of orphan/staging files; no file+metadata atomicity claim. Define approved file scope and test plan before implementation.
- Phase 9 remains in progress; capture/import integration, repository linking, OCR and other smart receipts capabilities are not finished.

## Approved Finance home design — 2026-11-13
- User provided a portrait TomorrowApp Finance dashboard mockup and approved its revised layout.
- **Remove standalone Documents action button**. Row below eight tiles has exactly **two wide buttons: green "+ Add" and blue "Reports"**.
- **Documents becomes an option INSIDE the + Add menu**, alongside relevant creation actions (transactions, transfers, accounts, assets, debts, loans, installments). Final menu grouping and actual routing will be designed/implemented later.
- **Rates stays beside the date at top**, not as a third bottom action. Preserve navy TomorrowApp header, profile selector, Total Balance and Net Worth, eight tiles in 2 columns in exact order: Expenses/Income; Accounts/Assets; Installments/Loans; Debts/Transfers; Financial Planning with Trips/Events/Budget; bottom Finance/Spiritual/Health/Growth.
- Image is a **design mockup, not a working screen or evidence that values/features are live**. The newly generated revised image was shared in the 2026-11-13 conversation; it has **not been verified as copied into the repository root or docs/project-memory/assets**. The older asset `docs/project-memory/assets/TomorrowApp_Final_Dashboard.png` may show an outdated three-button layout and must not be silently treated as the new reference. Preserve both until the user explicitly replaces the old asset.
- UX follow-up suggestions, not current implementation: + Add grouped by function; Reports read-only entry point; Installments replace "Coming soon" only after feature integration; unimplemented Planning actions should not open empty screens; bell reserved for Phase 12.

## Agreed sequencing
1. **Finish Phase 9 first**, with scoped implementation and Android tests.
2. Return to **Phase 8** to reconcile and finish eight Finance Reports/Statements, PDF and Excel export, UI/device acceptance and remaining fixes. Do not assume Phase 8 is fully accepted.
3. Implement the approved Finance dashboard visual and + Add menu (including Documents), preserving Reports as separate button.
4. Then proceed to Phase 10 voice, Phase 11 backup/sync, Phase 12 smart reminders, subject to separate approval.
- Do not renumber or discard the canonical Finance 12-phase roadmap. Earlier phases 1–7 are substantially implemented but not blanket-finalized.
- Keep `postingAllowed=false`; dormant V3 journal; no live posting/replay/repair/adoption or unintended Finance mutation. No merge to main.

## Workflow
- One task at a time; inspect current repository and tests, explicit file scope, no automatic ESLint fixes, no destructive git cleanup.
- Codex is optional; assistant can provide code/ZIP + guarded PowerShell installer. Reserve Codex for large review/changes when available.
- Every PowerShell helper must collect output and end with `Set-Clipboard` so user can paste results with Ctrl+V.
- User requested that today's decisions and resume context be saved; don't claim local files or image were updated without actual evidence.
- On return, first verify branch/HEAD and GitHub/local synchronization (especially if this handover created a new GitHub commit), then plan 9.2C-1B-2. No further implementation was authorized by this handover alone.

## 2026-11-13 — Latest checkpoint and approved design addendum (supersedes older status above)
- **Verified GitHub branch HEAD:** `76e249cee96ede3175e1bb6cc37ecda328ce0b41` (`76e249c`), message: `test(documents): checkpoint Android import integration pending device verification`. Earlier `bcc6b72` status is historical, NOT the current remote HEAD.
- The Android import integration test harness is committed at `src/app/vault-test.tsx`. Commit inspection confirms a dedicated test AsyncStorage namespace (`tomorrow:vault-test:v1:`), real importer and local vault wiring, write-once evidence, production Documents namespace read-only comparisons, and a separate read-only persistence check after restart. **Committed test code is not evidence of Android execution.**
- **Android Import: PENDING on-device execution and evidence review. Android Persistence: PENDING restart/reopen and read-only verification.** No device PASS is claimed. Prior unit/TypeScript results from older checkpoints must not be presented as fresh results for `76e249c` without rerunning.
- Next work sequence: run Android Import on the actual Android device; preserve its run ID and PASS/FAIL evidence; fully close/reopen the app; run read-only Verify Persistence; record both outcomes separately. Do not erase test evidence or backups.

## Finance visual reference — latest user-selected image
- **Canonical current design reference:** `TomorrowApp_Finance_Design(8).png` (user-supplied image, 2026-11-13). The image is currently in the conversation/library; **its presence inside this Git repository has NOT been verified**. Do not silently substitute `TomorrowApp Finance Dashboard(4).png` or the older `docs/project-memory/assets/TomorrowApp_Final_Dashboard.png`. Keep old assets for history; do not delete backups.
- Reference shows dark navy TomorrowApp header, notifications/settings, financial profile selector, full date row with **blue circular Rates refresh arrows and green check status**, Total Balance with visibility eye/currency, Net Worth, two-column tiles (Expenses | Income; Accounts | Assets; Installments | Loans; Debts | Transfers), green Add and blue Reports buttons, Financial Planning (Trips, Events, Budget), and four bottom navigation items.
- Image values, labels and dates are mockup examples, not live balances, test outcomes, or requirements to hardcode.
- **Approved follow-up not yet drawn in the reference image:** add a centered **teal circular balance-scale ⚖️ control between Expenses (left) and Income (right)** without losing access to either tile. Tapping the scale opens an Income-vs-Expenses comparison report.
- **Comparison report reference requirements:** Total Income, Total Expenses, Net Difference, Spending Ratio; clear visual comparison and filters for period and account. Detailed layout and calculations must be checked against Phase 8 Reports/Statements design before implementation. No claim that this report or scale is already implemented.
- Rates icon/refresh behavior and its exact placement must be reconciled with the latest image before coding; a static mockup does not prove animation or rate-refresh behavior.
- Keep Documents inside the + Add menu (not a third standalone bottom button), Reports as a separate button, and the eight-tile layout described above.
- **No Finance code changes authorized in this documentation checkpoint.** Resume Phase 8 reports and dashboard implementation only after the Phase 9 Android verification sequence and separate approval.

## Documentation discipline and safety
- Treat GitHub project-memory as the durable source of truth; record every newly approved design/decision and verified test outcome at checkpoints. Keep historical statements distinguishable from current verified facts.
- Preserve unrelated files, backups, existing evidence and untracked files. Do not run destructive cleanup, change Finance posting, or merge to `main` without explicit user approval. Keep `postingAllowed=false`.
- Claude may handle scoped implementation, Codex is reserved for final/complex review, and ChatGPT Work is optional only when needed. Follow one-task-at-a-time workflow and use clipboard-ending PowerShell helpers.

## 2026-11-13 — Android on-device verification results (latest)
- **Android Import Integration: PASS**, confirmed by user-provided Expo Go Android screenshots. Run ID: `41c22797-bc00-421a-a9d5-37125ff5e1e0`. Test document ID: `vt-41c22797-bc00-421a-a9d5-37125ff5e1e0`. Expected file length **80 bytes**. Reported checks PASS: test/production namespace separation, no unfinished import, source creation and size, write-once start evidence, importer created record, vault stored object, SHA-256 and byte size/path matches, repository readback/listing, production Documents state unchanged, write-once result evidence. Terminal line: `RESULT: PASS (device run complete; persistence NOT yet verified across restart)` (true at time of initial import).
- **Android Persistence (read-only): PASS after full Expo Go close and reopen** on the same device, as confirmed by subsequent user screenshot. Output: `PASS: No pending-import state in test namespace`; `PASS: Repository lists 1 test document(s)`; `Runs found: 1`; `PASS: run 41c22797: file 80 bytes, SHA-256 f746ea719eb7..., readback, listing, isolation`; `RESULT: PASS - 1 run(s) verified after restart (0 warning(s))`; `Read-only: nothing was written or deleted.`
- These are **actual Android Expo Go device test results**, not merely committed test harnesses. Scope is isolated test importer/vault and persistence for one run; it is **not** proof of all production Documents flows, OCR, user-facing document picker, or cross-process guarantees.
- Dependency preflight: `expo-crypto@58.0.8` installed (`npm ls` exit 0); TypeScript `npx tsc --noEmit` exit 0. `npx expo install --check` exit 1, listing **15** recommended package version updates; no automatic updates authorized. Local `package.json` and `package-lock.json` contain intentional uncommitted `expo-crypto` addition; **preserve them**, do not reset/clean or claim committed.
- Next: assess remaining Phase 9 tasks and separately approve a narrow implementation/test scope. Preserve evidence, local modifications and backup files. No Finance posting changes, no merge to `main`.


## 2026-11-13 — Native Android PDF picker acceptance (later checkpoint)
- User-confirmed on-device Expo Go Android **Native File Picker read-only probe: PASS**; this uses `File.pickFileAsync` instead of the older `expo-document-picker` cache URI path that failed with Android unreadable-file errors.
- User-confirmed on-device **Native PDF Picker (Import Test): PASS**. This imports a non-sensitive PDF into the existing local vault and isolated test repository; not the production Documents UI.
- User-provided Android screenshot after closing/reopening Expo Go shows **Verify Native PDF Persistence (read-only): PASS** for document ID `vt-native-df498044-d47e-4e65-ab3c-90acb8449489`, **221199 bytes**, SHA-256 verified, **1 native picker import**. The verifier checked file presence, size, digest, repository readback/listing and absence of a production record-key collision. It performed no writes or deletions.
- Latest user-confirmed local sync and checks: `424f834` fast-forward, TypeScript EXIT 0, scoped strict ESLint EXIT 0. Local `package.json` and `package-lock.json` remained modified and untouched. No merge to `main`.
- Acceptance scope: **Android native PDF test import and post-restart persistence only**. Do not claim production Documents UI, camera/gallery, image import, OCR, transaction posting, broader file types, iOS, backup/restore or Phase 9 complete.
- Next proposed scoped work: review and design Documents V1 production-facing entry/list/import/view flow; preserve user-approved Documents entry inside Finance **+ Add**, not as a third bottom button. Define UX and files before implementation. Continue with explicit user confirmation for consequential scope.

## 2026-11-14 — Native PDF Geometry Lab checkpoint

### Scope and isolation
- Separate Android lab: `D:\TomorrowNativePdfLab-v3`.
- Main app: `D:\Mobile Apps\TomorrowApp`.
- Native PDF extraction and diagnostic geometry mapping are review-only.
- No automatic financial posting, production integration, or merge to main is authorized.

### Verified lab checkpoint
- Kotlin/PDFBox extraction reference: 744 positioned glyphs, 115 callbacks, 36 layout rows, zero unclaimed glyphs.
- Diagnostic adapter uses shared row IDs, field bounds and 3-point tolerance.
- Strict validation and fail-closed review behavior.
- Sparse callback array validation fixed, including inherited numeric properties.
- Final reported tests: 211/211 PASS.
- TypeScript: PASS.
- All diagnostic associations remain `needsReview=true`.
- Adapter is not connected to a production app call site.
- No APK rebuild or new Android device test is claimed for this checkpoint.

### PDF reference totals
- 2026: EGP 895,000
- 2027: EGP 1,734,150
- 2028: EGP 1,528,980
- 2029: EGP 780,000
- 2030: EGP 584,700
- Grand total: EGP 5,522,830.

### Remaining verification
- Compare actual diagnostic adapter output field-by-field against the original PDF and extracted JSON.
- Review split/ambiguous text in rows 15, 21, 22 and 34.
- Inspect callback fragments 1, 2, 5, 7 and 114.
- Record field-level mismatches and review requirements.
- Decide GO/NO-GO for extraction accuracy separately from code/test acceptance.
- Existing code checkpoint: GO for review-only diagnostic implementation.
- Automatic financial posting: NO-GO.

### Current TomorrowApp checkpoint
- User-provided local Git HEAD on 2026-11-14: `3e67c65`.
- Branch: `codex/finance-8-6-expenses-redesign`.
- Local `package.json` and `package-lock.json` are modified.
- Numerous untracked scripts, backups and tests exist and must be preserved.
- Remote GitHub synchronization is not established by this local inspection.
- Earlier Android native PDF import and persistence PASS evidence remains valid within its tested scope.

### Resume rules
- Preserve all previous roadmap, design decisions, Android evidence and financial safety boundaries.
- Do not treat PDF reference totals as verified structured adapter output.
- Do not claim Phase 9 complete.
- Reserve Codex for essential implementation/review.
- No destructive Git cleanup, automatic dependency changes or merge to main.
