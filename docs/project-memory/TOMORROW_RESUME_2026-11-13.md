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

## Native PDF Lab - Independent Test - 2026-11-14

- Android Native PDF Lab: independent English PDF extraction test passed.
- Test fixture: PDF_Geometry_Independent_Test.pdf.
- Extract Layout: 1 page, 586 positioned characters, 13 detected rows.
- Extraction JSON export succeeded.
- Original Payment_Plans.pdf test remains diagnostic only.
- Arabic PDF support is NOT approved yet.
- Next task: prepare our own Arabic PDF test files, including RTL, financial tables, mixed Arabic/English, Arabic and Western numerals, currencies, dates, and multiple pages.
- Verify extraction order, table geometry, row associations, and numeric accuracy before approval.
- Keep postingAllowed=false; no automatic financial posting.
- No production approval or merge to main.

## Session Update - 2026-11-15 - Reports and Assets

### Verified
- Phase 8 Reports and Assets regression: 526/526 PASS across 28 test files.
- TypeScript: PASS (exit 0).
- Unified Reports UI: 33/33 PASS.
- Updated obsolete Accounts and Assets test expectations while retaining historical-data safety checks.

### Implemented locally
- Assets Report: current holdings analysis using getAssetBalance.
- Separate Gold, Silver and Currencies presentation.
- Chart options: Donut, Vertical, Horizontal and Trend.
- Fixed-size asset and currency icons.
- Report export actions guarded against disabled callbacks.
- Removed obsolete Report Information expectations from UI tests.

### Safety and boundaries
- Historical balances and valuations must remain verified before being treated as historical facts.
- Unverified data must not be exported as verified.
- postingAllowed=false remains unchanged.
- No posting, replay, repair or adoption changes approved.
- No Commit, Push, Reset or Clean performed for this session.

### Pending before checkpoint
1. Android visual verification of Assets Report.
2. Check holdings, icons, chart modes, movement details and View Statement.
3. Review git diff and tracked/untracked files, including local backups.
4. Commit and push to the working branch only after explicit approval.
5. Do not merge into main without approval.

### Resume point
Continue with Android Assets Report verification.
Do not repeat the completed 526-test regression unless code changes require it.

---

## Phase 8 Final Handover - 2026-11-15

### Completion status
- Phase 8 financial reports and statements: implementation and user Android UI review completed.
- Eight reports reviewed: Income, Expenses, Accounts, Assets, Installments, Loans, Receivable, Payable.
- Reports and View Statements remain separate, linked workflows within Finance.
- No fifth main Finance tab added.

### Reports and statements
- Unified compact reporting layouts, date and relevant account/currency filters.
- Linked statements preserve supported report filters and exact date ranges.
- Charts and expandable details retained where supported.
- PDF and Excel/XLSX export workflows implemented with verified-data guards.
- Unverified, unsafe or incomplete financial evidence must fail closed.
- Currency amounts must remain separated unless an explicitly verified conversion applies.

### Final Installments adjustment
- Removed redundant Currency Analysis tiles from Installments Report.
- Retained the currency selector based on currencies present in saved contracts.
- Retained scheduled contract totals, due-in-period metrics, due dates and linked statement.
- Installments remain schedule-only; due dates never automatically deduct money.
- Updated the corresponding UI regression test.
- Android UI accepted by user.

### Final verification
- TypeScript: PASS, exit 0.
- Targeted report and statement tests: 41/41 PASS.
- Full Finance test suite: 2153/2153 PASS, zero failures.
- User confirmed Android report review completed.
- Local working branch: codex/finance-8-6-expenses-redesign.
- Pre-checkpoint HEAD: 24d71e5.
- Final Git commit/push verification pending.

### Financial safety
- postingAllowed=false.
- No authorization for automatic posting, replay, repair or adoption.
- No merge into main without explicit user approval.
- Phase 9 Documents and Native PDF Lab remain separate, not completed by Phase 8.

### Next resume point
- Review the exact Phase 8 changed/new file manifest.
- Exclude Phase 9 files, local backups, scripts and temporary artifacts.
- Stage approved files only.
- Commit and push to the current working branch.
- Verify local and remote commit hashes match.
- After checkpoint, resume remaining Phase 9 work separately.

<!-- TOMORROW_PHASE8_FINAL_CLEANUP_20261115 -->

## November 15, 2026 - Phase 8 Final Closure and Cleanup

### Project Status
- Project: TomorrowApp Finance.
- Working branch: codex/finance-8-6-expenses-redesign.
- Last confirmed GitHub checkpoint: a646813.
- Phase 8 Financial Reports and Analytics: functionally complete (100%).
- Overall Finance roadmap progress: approximately 75% +/- 5%. This is an estimate, not an automated measurement.

### Verified Quality Gates
- TypeScript: PASS (npx tsc --noEmit, exit 0).
- Finance tests: 2,153 passed, 0 failed.
- Finance test command: npm run test:finance.
- Tests passed after archiving the first 252 files.
- The final five backup files were subsequently archived with matching SHA-256 hashes.
- No additional TypeScript or Finance test run was reported after the final five-file archive.

### Phase 8 Cleanup
- One unused ReportCurrencyOverview.tsx component archived.
- 18 backup folders archived, containing 64 files.
- 187 individual backup files archived.
- Five final Phase 8 temporary files archived.
- Total archived: 257 files.
- All reported archive batches passed SHA-256 verification.
- Archive root: D:\TomorrowApp-Cleanup-Archive-20261115
- Archives:
  - phase8-backup-folders
  - individual-backups
  - phase8-final-five
  - src\features\finance\components\reporting\ReportCurrencyOverview.tsx
- No Git commit, push, reset, clean, or main-branch merge was performed during cleanup.

### Preserved Work
- package.json and package-lock.json remain locally modified for Phase 9 expo-crypto work.
- Five ScanDocumentButton backup files were deliberately retained.
- Phase 9 scripts, document import implementation, and document tests were retained.
- Last verified untracked count was 31 before the final five-file archive; expected remaining count is 26, not yet independently recounted.
- The remaining untracked files must not be deleted or committed without review.
- Financial posting safety remains restricted: postingAllowed=false.

### Next Session
1. Resume Phase 9 - Smart Documents and Receipts.
2. Review the existing Phase 9 implementation and resume instructions before changes.
3. Continue Android document import and persistence verification.
4. Preserve the finance safety boundary and existing Phase 9 work.
5. Do not merge into main without explicit approval.
6. Continue using one verified task at a time.

### Finance Roadmap
- Phases 1-7: substantial finance functionality implemented; remaining gaps must be assessed individually.
- Phase 8: closed.
- Phase 9: in progress.
- Phase 10: voice input pending.
- Phase 11: backup and synchronization pending.
- Phase 12: smart recording and financial notifications pending.


---
## 2026-11-19 ΓÇö Current i18n checkpoint and Phase 9/10 design decisions

### Latest user-confirmed i18n checkpoint (supersedes historical HEAD references above)
- Working branch: `codex/finance-8-6-expenses-redesign`.
- User-confirmed commit and successful push: `d047b31` ΓÇö `checkpoint(i18n): save Arabic English Finance UI progress`.
- Ten committed files: `src/app/(tabs)/_layout.tsx`, `src/app/_layout.tsx`, `src/app/finance/accounts.tsx`, `src/app/finance/reports.tsx`, `src/app/finance/settings.tsx`, `src/features/finance/components/AccountCard.tsx`, `AccountDetails.tsx`, `AccountsSection.tsx`, `AddAccountModal.tsx`, `src/localization/LanguageProvider.tsx`.
- TypeScript PASS reported for that checkpoint; Android Accounts/Reports UI review confirmed by user. This does not certify all screens or the full regression suite.
- Other local changes and backups remain on user's Windows machine and are **not necessarily pushed**. No merge to main.
- i18n policy: Arabic and English only; English default on first launch; user-selected language persisted; no System Default language choice. Appearance system setting is independent. Translate UI labels but preserve user-entered names, currency codes, financial values and logic; verify Arabic RTL on Android.
- Next immediate Finance task: finish transactions/transfers localization, then assets/debts/loans/installments, remaining reports and Android RTL tests. Obtain **current local source** before applying patches; do not replay old patches.

### Phase 9 ΓÇö Smart Documents, PDF, Excel: agreed hybrid evaluation architecture
- **Offline baseline 1:** Tesseract4Android with fast traineddata for Arabic/English OCR; the existing lab proof of Arabic paragraph extraction does **not** certify table accuracy.
- **Offline baseline 2:** table/row/cell structure detection, with OpenCV as a **candidate** to test alongside Tesseract; OpenCV itself is not a second text-recognition engine. If insufficient, evaluate a genuinely suitable offline table-specific solution rather than claiming one is already selected.
- **Native structured extraction:** use PDF text/geometry for text PDFs; read Excel/XLSX cell values, dates and numbers directly, not via OCR except image-based content.
- **Online candidate:** optional document analysis/recognition service to benchmark and potentially correct low-confidence offline results. Provider **not yet selected**; no production integration approved. Send sensitive documents only with informed user consent.
- Compare engines against real Arabic/English and mixed RTL tables, dates, currency amounts, Arabic/Western digits, multiple pages and ambiguous rows. Track field-level accuracy, missing/extra rows, speed, offline availability, app size, privacy and cost.
- Decision gate: remove online service if offline meets acceptance criteria; retain online as optional correction when it adds material value; if offline is insufficient, offer online fallback where consent/connectivity permit. **Do not silently replace conflicting amounts/dates**; show them for review.
- No automatic Finance posting. `postingAllowed=false`; extracted transactions require explicit human review/confirmation.
- Prior independent lab: `D:\TomorrowNativePdfLab-v3`; PDF geometry and initial OCR were tested, but Kotlin native build, full Arabic table extraction and production integration were not yet accepted. Continue from existing evidence rather than restarting the OCR selection.
- Optimize final installed app size; measure native library/model overhead before adopting a second offline engine.

### Phase 10 ΓÇö Voice input: approved lightweight hybrid plan (design only)
- Arabic and English speech input, including common Egyptian phrasing.
- Start with device/platform speech recognition where available; use offline recognition if supported, online recognition otherwise, with clear connectivity/privacy expectations. Do not promise offline support on every Android device.
- Avoid bundling large speech models initially. Parse recognized text locally into transaction type, amount, currency, account, category and date; present uncertain fields for correction.
- **No financial mutation or posting from voice alone.** User must review and explicitly confirm the transaction; prevent duplicate submissions.
- Implementation plan: 10.1 Android speech engine/device test; 10.2 bilingual parsing tests; 10.3 safe UI integration and on-device verification.
- Voice implementation has **not started**; estimated timelines are provisional and must not be treated as commitments.

### Scope, sequence and documentation discipline
- Current work focus: finish Finance localization and RTL validation; then resume Phase 9 PDF/Excel evaluation; then Phase 10 voice. Phases 11/12 remain pending.
- This addendum records **design decisions and historical user-reported checkpoints**, not new TypeScript/Android/OCR test passes.
- A documentation-only GitHub commit can leave the remote ahead of the user's local checkout. Before future local changes, compare local/remote HEAD and safely synchronize without overwriting local changes or untracked files.
- No automatic dependency changes, no destructive reset/clean, no merge to main, no Finance posting.


<!-- TOMORROW_PDF_SMART_COCKTAIL_PLAN_20261122 -->
## 2026-11-22 ΓÇö PDF Smart Cocktail plan and safe resume checkpoint

### Status and scope
- This is a user-agreed PLAN, not implemented or Android-accepted functionality. Do not claim the PDF table failures have been fixed.
- Independent lab: `D:\TomorrowNativePdfLab-v3`; main app: `D:\Mobile Apps\TomorrowApp`.
- The user reported a local update to this Resume on 2026-11-22 (SHA-256 `0DE42E217E158E369477EF363887FDB63A0B3B45C2489213B87F5CCDF3EED5E8`) with a separate backup. This GitHub addendum records the agreed plan; it is NOT proof that the entire local file is byte-identical to GitHub. Before local synchronization, compare files and preserve the local addendum and any unrelated local changes.
- Preserve frozen accepted Android Excel/XLSX implementation, especially D11.xlsx date rendering. Do not edit Excel extraction, formatting, or shared rendering for PDF changes without separate explicit review. Check frozen file hashes and Excel regression tests.
- `postingAllowed=false`: no automatic financial posting, loan/installment creation, replay or mutation. No merge to `main`.

### Two complementary PDF paths
1. **Primary offline-first PDF path:** positioned glyphs/text, coordinates and vector lines; reconstruct grid, rows, columns and multiline notes; retain immutable raw values, provenance and all unplaced text. Diagnose clipping and trust-policy issues first. Use deterministic, labelled, reversible suggestions for Arabic RTL/reversal, font-encoded years, dates and amounts; never silently invent or overwrite values. Editable column roles/cells, original-versus-suggested display and explicit user approval.
2. **Optional fallback / benchmark: PDF to Excel (XLSX):** test conversion outside the app first (offline if feasible, online only after explicit user consent to upload a document). Feed converted XLSX to the already-accepted Excel reader and compare cell-by-cell with the primary path and ground truth. Successful XLSX parsing does NOT prove the conversion was accurate. Keep this option in the roadmap; defer production integration until evidence shows benefit, and avoid unnecessary APK size.
- OCR is a conditional region-specific fallback for unreadable text, not a guaranteed first-release dependency; defer integration until core geometry/grid/review passes. Do not upload private financial PDFs to online services without consent; use synthetic examples for external benchmarking.

### Execution sequence and gates
1. Safety baseline: preserve backups, current lab files, accepted Payment_Plans reference, frozen Excel hashes/tests, baseline APK size and device timing. Do a small **diagnostics-only Android run** before changing clipping behavior; observed candidate-line loss does not by itself prove its root cause.
2. Agree exact ground-truth rows/columns/years/dates/amounts/notes for `D11.pdf` before measuring accuracy; retain `Payment_Plans.pdf` reference output and regression fixtures for clipped/unclipped files.
3. Fix PDF-only extraction/grid/trust-policy bypass: no unverified Arabic candidate may masquerade as a verified cell; preserve every source fragment in a cell or an unplaced list, including multiline notes. Keep raw text/coordinates and evidence.
4. Add reversible, traceable correction suggestions and a review UI: editable cells/column mapping, labelled Arabic correction suggestion (not an automatic rewrite toggle), original and candidate visible, explicit approval. Ambiguous encoded years and incomplete dates must remain flagged, never guessed.
5. Run both PDFs on a real Android device; verify reference output remains identical, D11 agrees with ground truth or flags each uncertain value, zero silently wrong year/date/amount values, no lost text, Excel unchanged, `postingAllowed=false` verified by test. Record APK size, memory and timing against pre-agreed thresholds.
6. Only after core success: benchmark PDFΓåÆExcel offline/online alternatives; consider one layout-only template slot (exact fingerprint or manual mapping, storing no document content/amounts). Defer Loan/Installment suggestions and broader template system until separately approved. Remove redundant components only after measured comparisons.

### Estimate and risk
- Independent reviewer estimates were 24ΓÇô36 and 30ΓÇô45 working hours. Plan conservatively for **30ΓÇô45 hours** for the core if native work remains contained; **50+ hours** possible if native/OCR issues arise. These are judgement estimates, not measurements; PDFΓåÆExcel production integration may require extra time.
- Principal risks: Android PDFBox clipping/geometry variability, Arabic/RTL/font encoding, silent plausible but incorrect numeric/date values, Excel regressions and APK/memory growth.
- One narrow task and one device gate at a time; no claim of complete PDF extraction, OCR accuracy or app integration without device evidence. Preserve the earlier paused/failed PDF checkpoint as historical evidence.

<!-- LOCAL_PDF_LAB_CHECKPOINTS_20261119_20261122 -->

## PDF-LAB-CP01 — 2026-11-19

### Scope
Independent native PDF/OCR lab:
D:\TomorrowNativePdfLab-v3

Production TomorrowApp remains separate.
No automatic financial posting.

### Verified achievements
- Android ARM64 APK version 0.2.1, versionCode 2.
- Native PDFBox text/geometry extraction successfully
  demonstrated on Huawei P30 Lite.
- Payment_Plans.pdf processed using native-pdf path.
- Reference document identity verified in device results.
- Approximately 0.9 seconds for one-page native extraction.
- Important dates, amounts and totals preserved.
- Mobile table review UI implemented and device-tested.
- Technical diagnostics can be hidden.
- TypeScript PASS.
- 36 tests PASS, 0 FAIL.
- ARM64 release build PASS.

### Known limitations
- Arabic RTL reconstruction and split fragments.
- Some unresolved or mixed table cells.
- Row and column associations need further validation.
- Wide table is inconvenient on mobile.
- Numeric/date candidate lists clutter normal results.
- Financial values still require human review.

### Proposed next phase
1. Compact mobile cards for each reconstructed row.
2. Move candidate lists into technical diagnostics.
3. Improve Arabic reconstruction without changing raw evidence.
4. Improve geometric cell association with regression tests.
5. Compare with independent Gemini technical feedback.
6. Preserve offline support and minimize APK size.

### Checkpoint status
Reference name: PDF-LAB-CP01
Status: PARTIAL / NOT YET VERIFIED AS RESTORABLE.

Initial checkpoint copy saved src and tests, then failed
while copying generated Gradle build artifacts under modules.

Checkpoint must be rebuilt excluding generated build folders,
then validated with a SHA-256 manifest and preserved APK.

Do not treat CP01 as a complete rollback point yet.

### Rules
- Keep native PDF extraction as the current working baseline.
- Do not silently correct uncertain financial values.
- No automatic financial posting.
- Do not modify production Finance.
- No merge to main without approval.
- No new APK until the next change passes verification.

## PDF Lab Checkpoint — 2026-11-20

### Project and backup
- Independent lab: D:\TomorrowNativePdfLab-v3
- Local backup: D:\TomorrowPdfLab-Backups\Checkpoint-20261120-062355
- Local backup completed successfully.
- Debug APK backup SHA-256 verified:
  CE1D1990C7DB49D92F79ED7A67728F8948067E7F4CB1E89E8D7B83D9DED80C90
- PDF Lab is not currently a Git repository at its project path.
- GitHub backup NOT completed. A separate repository must be identified or created.
- Do not assume the lab is part of the TomorrowApp Git repository.

### Technical checkpoint
- Android debug build succeeded.
- Native PDF reading and SHA-256 fingerprinting were tested.
- Payment_Plans.pdf: PDFBox extracted 744 glyphs; 34 reconstructed rows, with remaining review issues.
- PDF_Geometry_Independent_Test.pdf: 13 rows detected, but cell assignment remains incomplete.
- JPG Arabic/English table: offline OCR succeeded, with 74 words and a 100-cell candidate grid; Arabic, dates and cell assignment need improvement.
- V1/V2/V3 reconstruction prototypes passed synthetic tests but have not been validated against all three real examples.

### Confirmed decisions
- Offline-only OCR and table processing.
- No paid or cloud OCR services, including benchmarking.
- Prioritize Arabic/English, RTL/LTR, dates, amounts and table geometry.
- Compare V1/V2/V3 against real diagnostics before replacing or integrating algorithms.
- Preserve original extraction evidence and fail closed on uncertain financial data.
- No automatic financial posting; postingAllowed=false.
- Keep final Android app size as small as practical without sacrificing functionality.
- Avoid unnecessary rebuilds, repeated tests and USB/ADB usage.

### Next session
1. Establish a separate GitHub repository for the PDF Lab and verify the push.
2. Read-only review of V1/V2/V3 against the three real test outputs.
3. Identify missing words, row/column alignment and date/amount assignment errors.
4. Implement only evidence-supported corrections.
5. Run focused tests, then Android verification when necessary.
6. Keep TomorrowApp main branch and production Finance untouched.

### Desktop and Downloads cleanup
- Audit Tomorrow-related files first.
- Protect project source, backups, test PDFs, diagnostics, patches, APKs and handover files.
- Never permanently delete automatically.
- Review a proposed cleanup manifest before moving anything.

## 2026-11-20 — Safe cleanup completed (append-only update)

**Status:** CLOSED, based on successful PowerShell run reports. No permanent deletion.

- Duplicate files: 4 archived; restore manifest `D:\Tomorrow-Cleanup-Archive\Archive-20261120-062947\Restore-Manifest.csv`.
- Identical folders: 2 archived; restore manifest `D:\Tomorrow-Cleanup-Archive\FolderArchive-20261120-063917\Restore-Manifest.csv`.
- Desktop Backup folders: 16 archived; precheck confirmed exact approvals and original SHA-256 hashes; 2 verified copies + quarantined originals. Restore manifest `D:\Tomorrow-Cleanup-Archive\FolderArchive16-20261120-064222-266\Restore-Manifest.csv`.
- Remaining review folders: 12 archived (2 Desktop + 10 Downloads); exact precheck passed; 2 verified copies + quarantined originals. Restore manifest `D:\Tomorrow-Cleanup-Archive\FolderArchive12-20261120-064419-565\Restore-Manifest.csv`.
- **Totals:** 30 folders and 4 duplicate files archived. Six protected folders excluded; main TomorrowApp checkout and native PDF lab outside cleanup scope.
- Precheck errors resolved before successful runs: backup candidate count 18 vs 16; empty-folder metadata handling in final batch.
- Do not rerun cleanup or delete the archives. The archived folders may contain unique historical project versions.
- **Next:** resume offline PDF table extraction diagnostics. Compare V1/V2/V3 with real JSON, quantify row/column and unassigned-word errors, then improve Arabic/English RTL/LTR dates/amounts with fail-closed rules. No online/cloud/paid OCR. `postingAllowed=false`.
- This update is prepared for append to `docs/project-memory/TOMORROW_RESUME_2026-11-13.md`; it has **not** been written to the local Windows checkout or pushed to GitHub by this chat.

<!-- TOMORROW_PDF_STOP_CHECKPOINT_2026_11_22 -->
## 2026-11-22 â€” Native PDF Lab STOP / handover
- User explicitly paused Native PDF Lab after repeated unsuccessful fixes; move to another TomorrowApp phase. Do not resume without request.
- Lab: `D:\TomorrowNativePdfLab-v3` (no Git). Freeze accepted Excel (including D11.xlsx date display) and protect prior PDF reference baselines.
- Huawei diagnostic D11.pdf: 808 chars, 0 vector lines, 103 post-clip quarantined, no verified cells. Payment_Plans.pdf: 744 chars, 6 lines, 49 quarantined, no verified cells.
- Dates/amounts exist as candidates, but Year/Description/Due Date/Amount cell mapping remains unresolved; Arabic RTL reversed/mixed. Coordinate-only is not proof of table cell membership.
- APK SHA256 `F1EC0EE55F63E9730039718C2948BE9E1213F3DAEE1542ADE9341C7490FA8A41`; APK v2 signature verified, installed Huawei signer comparison unavailable. Functional extraction NOT accepted.
- No automatic financial posting (`postingAllowed=false`), no PDF APK/build/retest without explicit reopening. See lab `docs/project-memory/TOMORROW_PDF_STOP_CHECKPOINT_2026-11-22.md`.
<!-- /TOMORROW_PDF_STOP_CHECKPOINT_2026_11_22 -->
<!-- PDF_SMART_COCKTAIL_PLAN_2026_11_22 -->
## Phase 9 â€” PDF Smart Cocktail plan (agreed discussion, 2026-11-22; NOT implemented)

### Goal and user workflow
- Offline-first Android PDF upload -> automatic evidence-preserving extraction -> suggested table -> editable review -> explicit user approval. No automatic financial posting (`postingAllowed=false`).
- Preserve immutable raw glyph/text values, bounding boxes, source/provenance, and an always-visible list of unplaced text. Never silently drop notes or fabricate numbers/years.
- Suggest (do not silently rewrite) Arabic RTL corrections, Year, Date (day/month/year), Amount, Description, Notes/Remarks, and potential Loan/Installment associations. The user can change column roles, edit cells, inspect original versus candidate, and approve. Arabic correction must be reversible and never reverse digits/dates.
- Reusable layout templates are a later enhancement: layout/fingerprint only, no financial document contents; manual fallback if layout mismatch.

### Two paths retained
- A PRIMARY: direct PDF geometry/text extraction, clip-safe grid reconstruction, regional OCR fallback only when necessary, contextual deterministic suggestions, review UI.
- B OPTIONAL FALLBACK/BENCHMARK: test PDF -> XLSX conversion offline and, with explicit consent and privacy review, online. Compare against direct extraction on the same PDFs. The conversion path is NOT approved as a production dependency yet; only integrate if tests demonstrate a real benefit. The frozen Excel/XLSX implementation must remain untouched; converter-generated XLSX is not assumed accurate.

### Implementation order and gates
1. Read-only baseline and backups; capture current file hashes, Excel regression baseline, APK size/device memory/performance. One small Android diagnostics run to verify clip-capture and trust-policy bypass hypotheses before changing code.
2. PDF-only clip-safe extraction/grid fix, preserving every raw span, row, coordinate, multiline note and unplaced text; protect the known-good geometry reference.
3. Layered, idempotent suggestions for Arabic, encoded years, dates, amounts and descriptions. OCR output is an unverified alternative; do not guess missing years or values.
4. Editable review UI with manual column role selection, original-versus-suggested display, reversible Arabic correction and explicit approval. Keep `postingAllowed=false` enforced and tested.
5. Android validation on Payment_Plans.pdf and D11.pdf against agreed ground truth (define D11 expected values before testing). Then benchmark optional PDF->XLSX fallback in isolation; never upload real financial documents online without explicit consent.
6. Only after the core passes: consider one layout template, Loan/Installment suggestions, further OCR integration, and pruning redundant components to minimize APK size.

### Acceptance / safety
- Both real PDFs pass on Android, not only unit tests. Every date/year/amount is either correct against ground truth or clearly flagged; zero silent wrong values.
- Raw text is never lost; unplaced and multiline notes remain reviewable. Corrections are traceable and reversible. No guessed or silently auto-approved values.
- Existing Excel/XLSX reader, including accepted D11.xlsx Android date display, remains STRICTLY FROZEN: unchanged file hashes and passing regressions. No edits to shared Excel renderer.
- `postingAllowed=false` and no automatic financial posting; explicit review approval does not itself post transactions.
- Record APK size, device timing and memory versus baseline; choose practical thresholds before release approval.
- No merge, commit, push, clean, reset, build or code changes are authorized by this planning note.

### Effort estimate (not measured)
- Initial proposal 18-28 hours; external reviews estimated 24-36 and 30-45 hours. Planning range: approximately 30-45 working hours, possibly 50+ with native/OCR complications; optional PDF->XLSX conversion may add time.
- Build incrementally and test each layer, even though the final UX is one integrated 'cocktail'.

### Status
- PLAN RECORDED ONLY; implementation, Android acceptance, and PDF->XLSX fallback are NOT complete. Preserve the previous 2026-11-22 PDF STOP checkpoint and frozen Excel baseline.

## PERMANENT COMMUNICATION PREFERENCE
- Never address the user with the Arabic title "يا ريس".
- This preference applies to all future TomorrowApp sessions and conversations.
- Use direct, respectful Egyptian Arabic without unwanted titles.

<!-- TOMORROW_PHASE123_PAUSE_2026_11_23_START -->

## Finance Phase 1-3 Pause Checkpoint — 2026-11-23

Status: NO-GO. Phases 1, 2 and 3 are paused until Codex weekly quota renews (approximately 7% remaining).

Last audited branch: codex/finance-8-6-expenses-redesign
Last audited HEAD: d047b316c7838d7bfb4d58b1f099df2f27a1aca7
Source snapshot: Tomorrow-Phase1-3-FAST-20261123-002300.zip (319 files)
Snapshot SHA256: 65DF3CA319F75B593A388529B43B036F3FE6B670865FFA9EDAD66AD7686D9716

Last audit: TypeScript PASS; Finance 2114 PASS, 65 FAIL out of 2179; ESLint 17 errors and 17 warnings. Worktree had 122 modified/untracked entries. Reverify before resuming.

Outstanding: acknowledged persistence; fail-closed hydration preserving persisted evidence; currency precision; duplicate submission and idempotency; opening balance dates; date/currency validation; refund accounting; full regression and Android restart tests.

Existing consolidated patches are REVIEW ONLY and must not be applied as final fixes.

Restrictions: postingAllowed=false; no automatic financial posting or replay; frozen Excel/XLSX, PDF Lab and unrelated Documents must remain unchanged. No reset, clean, merge, or code commit/push without approval. Preserve unrelated local changes.

Resume with Codex after quota renewal. Verify current checkout, implement remaining fixes, run tests, and close phases only after successful validation.

<!-- TOMORROW_PHASE123_PAUSE_2026_11_23_END -->

<!-- TOMORROW_PDF_CHECKPOINT_2026_11_23 -->
## 2026-11-23 — PDF Smart Cocktail review / STOP checkpoint
- User requested STOP and local + Tomorrow Resume save; no further implementation.
- Gemini and Claude reviewed PDF table extraction. No device-specific root cause conclusively confirmed.
- Huawei baseline remains Payment_Plans.pdf 744 chars / 6 vector lines / 49 quarantined / 0 verified cells; D11.pdf 808 chars / 0 lines / 103 quarantined / no verified cells.
- Claude code observations: RawTableLines.kt clipping recovery can quarantine fractional lines; rawPdfTable.ts requires a verified closed grid and returns unresolved otherwise; quarantined lines are not promoted to TS table borders.
- Existing pdfLayoutRows.ts and pdfCoordinateReview.ts already contain candidate logic; first task on resume is to inspect their integration, not create a new engine or duplicate logic.
- Next approved sequence: existing positional row candidate integration; column/field evidence; Arabic RTL; conservative clipping audit; Huawei comparison; approved OCR workflow.
- PDF-only; Excel/XLSX and Finance frozen; no new engine/library without approval; postingAllowed=false, needsReview=true, scored=false; no unverified success claims.
- Lab detailed checkpoint: `D:\TomorrowNativePdfLab-v3\docs\project-memory\TOMORROW_PDF_CHECKPOINT_2026-11-23.md`.
<!-- /TOMORROW_PDF_CHECKPOINT_2026_11_23 -->
<!-- PHASE45_FUNCTIONAL_CLOSURE_2026-11-23 -->
## Finance Phase 4 / Phase 5 â€” Functional closure checkpoint (2026-11-23)

**Status:** Phase 4 Transfers and Phase 5 Currencies / Exchange Rates are functionally complete within the agreed tested scope, following user-reported Android PASS 4/4. This is not a claim that the entire Finance test suite passes.

- Phase 4: hydration guard applied to `src/features/finance/store/useLedgerStore.ts`; SHA-256 `180402219730111A74C202D0A04297CA66F7BC112B8A1DD89F987E51AC26BBE4` is the BEFORE-change baseline, not the current patched-file hash. Local commit `55a28c3` records the guard change.
- Phase 5: hydration guard applied to `src/features/finance/store/useCurrencyStore.ts`; verified SHA-256 `CDD5F0632DB9AE9B4192873763DBC2963386AA9A0011A2FF2A3439871092F1C3`.
- TypeScript: PASS (exit 0). Targeted pre-Android Finance regression test files: 6/6 PASS. Read-only pre-Android check failures: 0.
- User-reported Android PASS 4/4: transfer Edit/Cancel preserves state; manual Rates save; Refresh preserves unsaved draft; app restart preserves transfers/balances/saved rates.
- Earlier full Finance suite: 100 test files, 87 PASS, 13 FAIL. Failures remain separately tracked and must not be reclassified as passing or ignored. Reported categories include language-hook test harness, literal-source assertions, asset movement UI, and XLSX/report tests; exact causes require independent investigation.
- Phase 1–3: remain OPEN until deferred Codex audit. No automatic financial posting (`postingAllowed=false`).
- PDF/Excel: unchanged and out of scope. No Git commit, push, or merge is authorized by this checkpoint.
- Next: proceed to next approved roadmap task; do not repeat Android testing absent new evidence or changed behavior.
<!-- END_PHASE45_FUNCTIONAL_CLOSURE_2026-11-23 -->

<!-- TOMORROW_FINANCE_PHASE45_GIT_CHECKPOINT_2026_11_23 -->
## 2026-11-23 — Finance Phase 4/5 local Git verification and synchronization hold
- Phase 4 Transfers local commit: `55a28c3` (`fix(finance): guard transfer mutations before hydration`); committed file only `src/features/finance/store/useLedgerStore.ts`.
- Phase 5 Currencies/Exchange Rates local commit: `b0abdf1` (`fix(finance): guard currency mutations before hydration`); committed file only `src/features/finance/store/useCurrencyStore.ts`.
- Phase 1–3 pause local commit: `0bd9572` (`docs: save Phase 1-3 pause checkpoint`). Phases 1–3 remain open pending Codex audit.
- Local branch `codex/finance-8-6-expenses-redesign`, HEAD `55a28c3`; Git index clean at read-only audit. Tracking status: ahead 3, behind 3 versus `origin/codex/finance-8-6-expenses-redesign`.
- Remote-only commits at audit: `25ad1e6`, `865f4b8`, `e0d2209` (PDF/OCR/voice documentation). Common ancestor: `d047b316c7838d7bfb4d58b1f099df2f27a1aca7`.
- The only overlapping committed path and the only overlap with modified worktree: `docs/project-memory/TOMORROW_RESUME_2026-11-13.md`. Other worktree changes and untracked files must be preserved.
- Three Resume versions were backed up locally in Downloads and supplied for a read-only consolidation. This document is a proposed merged artifact, NOT applied to the Windows checkout.
- Do not run pull, merge, rebase, reset, clean, force push, or overwrite the original Resume without explicit review and approval. No push has been performed for these local commits.
- Scope acceptance remains Phase 4/5 targeted functional PASS, not a claim of full Finance regression PASS. `postingAllowed=false`; frozen Excel/XLSX and independent PDF Lab remain untouched.
<!-- /TOMORROW_FINANCE_PHASE45_GIT_CHECKPOINT_2026_11_23 -->

<!-- PHASE9_RESUME_AGREEMENT_2026_11_23 -->
## Phase 9 resume agreement — 2026-11-23 (diagnostics only)

- User explicitly requested resuming Phase 9 (smart documents / PDF / OCR) after the 2026-11-22 pause. This reopens planning and read-only diagnostic review only; it does **not** authorize modifying PDF code, building an APK, running Android tests, or removing the STOP checkpoint.
- First task: inspect the existing Native PDF Lab source and diagnostic outputs for D11.pdf and Payment_Plans.pdf; compare V1/V2/V3 table reconstruction against actual evidence. Do not restart implementation from scratch or rerun accepted tests without a reason.
- Last documented Huawei diagnostics: D11.pdf 808 characters, 0 verified cells; Payment_Plans.pdf 744 characters, 0 verified cells. These figures are prior checkpoint evidence, not newly retested results. Prioritize lost/quarantined text, Arabic RTL, geometry/column association, dates, years, amounts, notes and uncertain cells.
- Preserve original raw fragments and coordinates, surface unplaced text, and keep ambiguous values explicitly unverified. No fabricated dates/amounts or silent correction; user reviews editable proposed results and explicitly approves before any subsequent financial action. Keep postingAllowed=false and no automatic financial posting.
- Accepted Excel/XLSX behavior is strictly frozen, including D11.xlsx Android date display. Do not modify Excel reader, shared Excel renderer, or its tests for PDF changes. Protect existing PDF references and backups.
- Offline-first approach remains the baseline. Optional online/PDF-to-XLSX comparisons are not authorized for private files and require separate explicit consent; retain the 2026-11-20 offline-only decision as a constraint until the user resolves any conflict.
- Before implementation: obtain the current independent lab source and diagnostic ZIP (excluding build/node_modules/APK artifacts), verify baseline and scope, report a narrowly defined PDF-only change, and seek explicit approval. No production Finance changes, Git merge, reset, clean, or unapproved commit/push.
- Finance Phases 1–3 remain paused NO-GO. This documentation update does not imply they passed.
<!-- /PHASE9_RESUME_AGREEMENT_2026_11_23 -->

<!-- PDF_COCKTAIL_D3E2_2026_11_24 -->

## PDF Smart Cocktail — D3-E2 checkpoint (2026-11-24)

Project: D:\TomorrowNativePdfLab-v3
Status: Android visual improvement confirmed; RTL correction not final.

### Verified progress
- D3-C native PDF vector geometry recovered the Payment_Plans.pdf table.
- Latest diagnostic: 55 raw table lines.
- Reconstructed table: 34 rows, 5 columns, 123 cells.
- D3-E1: original and proposed Arabic display implemented; conditional source verification.
- D3-E2: Arabic reconstruction regression tests 43/43 PASS.
- Android screenshots confirm substantial Arabic readability improvement.
- Some Arabic letters, mixed punctuation, parentheses, and headings remain incorrect.
- Huawei is the current test device only; the implementation targets supported Android devices generally.
- No claim of cross-device acceptance or final RTL correctness.

### Safety and scope
- Preserve original extracted text and coordinates.
- Arabic corrections remain suggestions requiring review.
- needsReview=true; scored=false; postingAllowed=false.
- No automatic financial posting.
- D3-C geometry remains protected.
- Excel/XLSX including accepted D11.xlsx behavior is frozen.
- Finance and unrelated modules are frozen.
- No new engine or library without approval.

### Latest rotating local checkpoint
Path: C:\Users\Walid\Documents\Tomorrow-PDF-Checkpoints\Tomorrow-PDF-LATEST.zip
Files: 64
SHA256: 23A56937C2406F18A91DE4847DE57065DF175BE8889A3CC4BF724AACF71456DE
Result: CHECKPOINT SAVED (user-provided PowerShell report).
Scope: source/test snapshot, not a complete project or APK.
Policy: replace the single LATEST snapshot after verification; do not accumulate copies.
Older independent recovery checkpoints are not deleted by this update.

### Next task — D3-E3
- Investigate residual Arabic glyph ordering and punctuation using actual Android diagnostic evidence.
- Fix only the affected PDF RTL reconstruction/display paths.
- Preserve correct words, amounts, dates, years and table geometry.
- Add targeted regression tests for the remaining real cases.
- Run local checks, then verify display on Android using Expo LAN QR.
- Do not repeat accepted D3-C geometry work.
- Do not build an APK unless native changes require it.
- No Git commit, push, merge, reset or clean without approval.

<!-- END_PDF_COCKTAIL_D3E2_2026_11_24 -->


## 2026-11-24 - PDF Smart Cocktail D3-E4 R4 accepted checkpoint
- Huawei user acceptance: Payment Plan and Management Plan PASS; two additional PDFs approximately 60% successful (user estimate).
- D3-E4 closed for tested scope only; general PDF extraction remains incomplete.
- R4 Arabic spacing patch: four release files verified against delivered hashes.
- Next: continue Nov 22 PDF Smart Cocktail plan; evaluate additional PDFs, compare offline extraction methods and optional online comparison, retain best methods by accuracy, speed and size.
- Preserve R3 and accepted R4. Excel and Finance frozen for this work. postingAllowed=false. No automatic posting. No Git commit/push/merge in this save operation.


## PDF Smart Cocktail - consolidated roadmap 2026-11-24 (R4)
This supplements prior plans; do not discard earlier agreements. R4 accepted locally: Payment Plan and Management Plan PASS on Huawei; two other PDFs ~60% by user estimate. Four hashes and backup verified. Excel frozen; Finance untouched; postingAllowed=false. No automatic posting.
Remaining roadmap (all estimates provisional, not measured):
1. Direct PDF geometry/text extraction and Arabic RTL: investigate the two additional PDFs; preserve R4. 4-7h.
2. Tesseract Fast offline Arabic/English and specialized offline table/date engine: evaluate before adding dependencies. 6-10h.
3. Offline PDF-to-XLSX route, read with existing frozen Excel reader; preserve original PDF, compare accuracy. 4-6h.
4. Online benchmark with explicit permission before external document transfer; compare offline/online engines and retain only useful ones. 2-4h.
5. Intelligent candidate selection, confidence and provenance; never silently assign uncertain cells. 3-5h.
6. Editable column-role dropdowns above columns: year, date, amount, description, notes, ignore; preserve source headers. 2-3h.
7. Editable cells, Arabic correction, original comparison. 3-4h.
8. User-trained reusable column mappings/templates for similar documents; explicit review on reuse. 3-5h.
9. Review and explicit approval; no automatic financial posting. 2-3h.
10. Filter engines and minimize installed size without losing required offline features. 2-3h.
11. End-to-end tests, Android QR testing, integration into TomorrowApp only after approval. 4-6h.
Planning estimate: ~35% complete, ~65% remaining; 35-56 active hours, uncertain until engine feasibility and new PDF tests. R4 closure is not overall PDF completion. Next action: inspect two additional PDFs and compare routes, without reopening accepted R4 or Excel.


## TomorrowApp consolidated closure audit - 2026-11-24
Read-only Codex reports; no source changes or Git operations. postingAllowed=false. All closure decisions below are NO-GO unless explicitly stated.
Finance Phase 1: 290 PASS, 0 FAIL, 0 skipped; TypeScript PASS. Production acknowledged persistence missing at paymentOperationRuntime.ts:462; hydration validation/evidence preservation incomplete at useLedgerStore.ts:115 and useFinanceStore.ts:159. Fix once for phases 1-3. Android: restart, interrupted/failed saves, duplicate retry prevention.
Finance Phase 2: 75 PASS, 0 FAIL, 0 skipped. Account CRUD/types, derived balances, negative credit cards, transfer effects, details, archive and category management implemented. Opening date discarded at FinanceHomeScreen.tsx:610,848; supported currency/precision validation missing at useLedgerStore.ts:492; category archive/history incomplete at ledger.ts:47. Depends on Phase 1. Android: opening date save/restart, archive/history, Arabic/English, failed saves.
Finance Phase 3: 307 PASS, 0 FAIL, 0 skipped. Income/expense CRUD, ordered history, historical FX, account-currency balance authority, refund links and protected linked records implemented. Five unique blockers: refund precision useLedgerStore.ts:385 (1.234 OMR becomes 1.23); refund account/FX semantics useLedgerStore.ts:172 and AddTransactionModal.tsx:789 (separate original refunded value from actual bank credit); submission identity and synchronous lock AddTransactionModal.tsx:746 and useLedgerStore.ts:749; date validation useLedgerStore.ts:749 (reuse isValidISODate); history search/filter IncomeExpensesScreen.tsx:29. Reuse precision helpers, FX validators, ownership guards and classification utilities. Android: rapid double-submit, three-decimal full/partial refunds, differing bank credits, restart/interrupted saves, linked-record protection, Arabic/English filters. Do not activate dormant journal infrastructure without approval.
Phase 4/5: functionally accepted on Android; formal closure documentation/commit not established. Do not repeat accepted scenarios absent changed behavior.
Phase 9: 104 new PASS, 0 FAIL, 0 skipped across 11 files; historical vault 13/13, Documents 72/72, TS PASS. Repository, 9.2B-1D/E/F and 9.2C-1B-1/2/3 implemented; queue limited to one loaded JS runtime. Isolated Android importer/vault and native PDF picker restart PASS, not full production acceptance. Production recovery UI missing documents.tsx:180; pending-only metadata recovery incomplete documentRepository.ts:159; extraction engine injection missing pdfTextAdapter.ts:23 and documents.tsx:291 (null gate); PDF-only capture documents.tsx:166. Camera/gallery/QR, search, cleanup, editable review, broader share/export and backup/restore incomplete or not established. Reuse repository queue, pending evidence, vault, Expo adapter, importer, extraction adapter and review gate. Next: narrowly scoped evidence-preserving production recovery, then interruption/restart acceptance; current production import/duplicate/category/share/restart and permission failures also require Android acceptance. Financial drafts depend on Finance safety and explicit approval. Phase 9 ~33% provisional (4/12 audit groups), distinct from external PDF Smart Cocktail ~35%. External R4 and Excel accepted but not integrated. Preserve full prior PDF roadmap and checkpoints.
Total reported targeted results: 776 PASS, 0 FAIL (not necessarily unique). Finance time estimates withdrawn pending actual code sizing; Codex Phase 3 12-20h provisional only.
Execution split: ChatGPT manages plan/accounting/review; Work prepares bounded fixes/UI/tests when source access is available; Codex handles shared persistence/hydration, submission identity and sensitive refund accounting plus local integration tests; user performs Android acceptance. No simultaneous edits to same files. Finance closure order: shared Phase 1 fixes, Phase 2 three unique fixes, Phase 3 five unique fixes, targeted Android acceptance and documentation. Separate Documents/PDF track. No automatic ESLint fixes, no merge to main, no posting activation. Preserve Excel and accepted R4. Do not repeat completed work.


## Documents Phase 9 - evening checkpoint 2026-11-24 (P3 R9 / R10 pending)
Package 1 Recovery R1 Fix1: user reported 112/112 tests and TS PASS; Android normal import, duplicate, restart and open PASS. Dedicated interruption recovery still pending.
Package 2 Management R1: 123/123 and TS PASS; Android 5/5 PASS. Web import picker cancellation unresolved.
Package 3 Capture: R1 preview failure fixed in R2 (Android 4/4 PASS). R3 camera/gallery/QR and image editing: 133/133, TS PASS, Android 8/8. R4/R5 detailed UI feedback superseded initial acceptance. R6 image editor accepted by user on phone; preserve it. No R6 local test report established; compression preview before apply not established.
R7/R8 compact cards: R8 Android screenshots received; header, icons, duplicated external-open/share, PDF preview and smart-read issues identified. No R8 local test report established. R9 ZIP and PS1 exist; ZIP contains src/app/finance/documents.tsx, src/app/finance/add.tsx and manifest.json. R9 local application, full TS/tests and Android acceptance NOT confirmed. Do not treat R9 as final.
R10 Unified Document Commands: AGREED, NOT IMPLEMENTED OR PACKAGED. Next task: inspect actual R9/source baseline; deliver one combined ZIP and separate PowerShell script with hash checks, backup, rollback, tests and clipboard report. Same shared commands, icons, colors, order and controls for PDF/images; real type-specific handlers. Edit, Preview, Read, Open, Share, Delete, Details; common Zoom/Save/Cancel/Reset where applicable. No duplicate share pretending to open. Reuse existing PDF Smart Cocktail extraction and existing display capabilities where available; external Android viewer is acceptable for ordinary viewing. Do not add a redundant PDF reader. Verify actual integration boundary between independent PDF Lab and TomorrowApp; do not claim smart extraction is integrated before testing. Preserve R6 image editor. No dummy success or automatic financial posting. Keep Excel frozen, Finance Core untouched, postingAllowed=false. Minimize installed size. Android QR LAN default. No Git commit/push/merge without approval.
Package 4 PDF Smart Cocktail, Package 5 Smart Review, Package 6 Final Integration remain pending. Preserve previously saved R4 PDF roadmap and Finance audit; Phase 4/5 functional acceptance is not formal Git closure.
Resume next session from R10 implementation, not from repeated status replies or already accepted image-editor work. R10 has no ZIP/PS1 at this checkpoint.


## Documents Package 3 - FINAL ACCEPTANCE 2026-11-24

Final version: R10 Fix5.
Local Documents tests: PASS.
Full project TypeScript: PASS.
Android final acceptance: 5/5 PASS.

Accepted:
- Unified document commands.
- Image preview and accepted R6 image editor.
- External PDF/image Open and independent Share.
- Details and integrity verification.
- Search, filters, sorting and compact cards.
- Camera, Gallery and QR.
- Persistence and deletion.
- Bottom-up Documents modal.
- Single-line Tomorrow Finance Add header.
- Correct left-facing back arrow.
- Compact header and readable file limits.

Protected checkpoint:
Excel, Finance Core, image editor and accepted UI.
postingAllowed=false.

Outstanding:
Package 1 interrupted-import Android recovery test.
Internal PDF preview and smart extraction.

NEW RESUME POINT:
Package 4 - PDF Smart Cocktail.
Integrate accepted Native PDF Lab R4 capabilities.
Follow the approved 22 November roadmap.
No redundant engines or automatic financial posting.
No unapproved Git operations.


## Permanent AI Thinking Effort Policy

Approved: 2026-11-25

Applies to ChatGPT, Codex and ChatGPT Work
across all TomorrowApp modules and future phases.

Current working settings:
- ChatGPT: High for PDF Smart Cocktail.
- Codex: Medium for implementation.
- ChatGPT Work: Medium for implementation.

Standard operating policy:
- Low / Instant: simple commands, routine
  reports and straightforward follow-ups.
- Medium: normal implementation, UI changes,
  scripts and standard regression testing.
- High: complex debugging, Arabic/RTL,
  PDF geometry, OCR, financial accounting,
  persistence, recovery and integration audits.
- Extra High: exceptional high-risk reviews,
  when available and justified.

Mandatory notification:
The assistant must proactively notify the user
before a task requires a different thinking
effort setting.

Each notification must specify:
1. Which tool requires the change.
2. The recommended thinking effort.
3. The reason for the change.
4. When to return to the standard setting.

Use higher effort when justified, not permanently.
Return to Medium or Low for routine work.

Thinking effort does not replace actual tests,
evidence, safety gates or user approval.

Do not confuse thinking effort limits with
attachment upload limits.

Preserve all existing project safety policies.
postingAllowed=false.


## Package 4 R6 — consolidated PDF Smart Cocktail completion gate

Approved direction: 2026-11-25. One consolidated delivery for the deferred PDF fixes; internal implementation and verification checkpoints are allowed, but do not issue separate incomplete application packages. Planned version R6 / v0.3.0 (not released or Android approved).

Baseline: R5I / v0.2.11 applied in D:\P4 only; user-reported full project TypeScript and Documents tests PASS. Android: financial label suggestions appeared for reported lines, but not all headers/cells. R5H Lam-Alef fix confirmed by user. R5D recovered candidate rows confirmed by user. Existing accepted Excel, Finance, Documents capture and image editor remain protected. Main checkout is not the isolated test build.

Acceptance checklist (all items must be tracked; never infer completion from a version number):
- [ ] Preserve accepted R5I and prior rollback/evidence; confirm actual isolated baseline hashes before application.
- [ ] Recover original PDF names through Android provider metadata; if unavailable, permit explicit user-confirmed metadata-only rename (13189 -> Payment_Plans.pdf only when user confirms). Keep id, SHA-256, size, vault path, source, original bytes and duplicate handling unchanged; preserve display cleanup for primary: and .pdf. Verify after restart and reimport.
- [ ] Apply shared Arabic review across title, headers, all columns including first, bounded cells, free text, unplaced evidence, coordinate candidates and payment drafts; preserve raw glyphs and numeric values. Protect terms, including totals, amount, value, due date, statement/header, maintenance and deposit. Missing letters are hypotheses until corroborated. No per-document hardcoded corrections.
- [ ] Verify intact decimal and grouped/signed numeric tokens, dates, identifiers, ligatures and mixed RTL/LTR text; no whole-line reversal that damages correct words.
- [ ] Safely align additional candidate rows with bounded tables, keep uncertainty visible, do not fabricate cells or duplicate glyph evidence; preserve separate equal payments and signed amounts.
- [ ] Integrate PDF-only Tesseract offline OCR using verified Arabic/English model sources from the Lab; prefer fast models if validated; audit dependencies and licenses, model hashes, memory/time/page/pixel caps, rotation and mixed native/scanned PDFs. Do not copy Excel code or unnecessary engines/dependencies. Use OCR to corroborate missing letters and scanned text. Preserve engine evidence and offline-first behavior; no automatic external upload.
- [ ] Compare PDFBox, geometry and OCR outputs with shared provenance and conflict handling; compare against online benchmark only with separately approved inputs/service and without exposing private data automatically.
- [ ] Generalize payment review without a Payment_Plans-only identity gate for generic candidates. Explicit column mapping, full date/year evidence, original/signed amounts, totals not payments, no guessed dates, no duplicate collapse; keep existing exact profile result stable. No financial writes.
- [ ] Smart review: edit candidate cells, choose column roles (date, amount, year, description, notes), retain original evidence and edit history; persist reusable user-confirmed templates for similar layouts only after verification. Review-only, no posting.
- [ ] Verify representative Arabic, English, multi-page, independently laid out, mixed and scanned PDFs, including the four already tested; use copied diagnostic reports rather than screenshots where possible. Full project TypeScript, Documents tests and targeted regressions; native build and Android offline verification; benchmark APK size, speed and memory. No regression in accepted capture/UI/image editor/Excel or Finance.
- [ ] Final integration only after isolated review/approval, respecting Finance Phase 1 dependency and Phase 2/3 candidate freeze. No unapproved apply to active project, Git commit, push or merge. postingAllowed=false.

Working checkpoint (not installable): initial shared standalone label review and PDF name metadata/rename sources prepared in isolated host staging. Host unit tests 64/64 PASS; Huawei prior Payment_Plans evidence integration 5/5 PASS; strict TypeScript of pure extraction/name modules PASS; TS/TSX syntax transpilation PASS. Full project TS, native Kotlin build, complete OCR, generic payment classification, review-template persistence, all-device verification and final integration are NOT completed. R5I remains the last locally applied baseline. No APK/Git operations.

Thinking policy: ChatGPT High for current complex PDF work; Codex and Work Medium for normal implementation. Notify before switching or performing final high-risk review. One planned package, one coordinated apply/build after gates, not one untested giant patch.
 


<!-- TOMORROW_FINAL_CHECKPOINT_2026_11_25_R6_FIX1 -->
## 2026-11-25 — consolidated STOP / resume checkpoint (latest; overrides older status and cancelled online plans)

### PDF Smart Cocktail — R6 Fix1 v0.3.1, SOURCE VALIDATION PASS
- Isolated `D:\P4` only. Initial R6/v0.3.0 candidate failed full TypeScript TS2352 in PdfReviewPanel.tsx, rollback and protected hashes PASS. Fix1 corrected the type issue; user-confirmed local application of 32 files (11 existing, 21 additions), SHA256 PASS.
- Baseline full project TypeScript PASS, Documents 267/267 PASS. Fix1 full project TypeScript PASS, Documents 360/360 PASS, 0 fail, 0 skipped. Protected inventory 1427 files and prior R2 APK hashes PASS. No native build/install, Git operation or active project integration. Last successful log: `D:\Tomorrow-P4-Builds\R6-Fix1-20261125-051057-b0bc3b2c\verification.log`; preserve its backup and original failed-attempt evidence.
- Package: `Tomorrow-P4-R6-Fix1-v0.3.1-IsolatedValidation.zip`, SHA256 392df61b20d9aa13b5f03a41a45b35701b84dddb81c97dcaf856ccbf6b2af3d5. Includes cumulative R6 work and original plan/evidence. Do not reapply absent a confirmed defect.
- Authoritative PDF plan: original 22 Nov roadmap plus later decisions. OFFLINE ONLY; all historical online OCR/conversion/comparison provisions CANCELLED (cost/privacy), no paid API or external document transfer. PDFBox direct geometry, Tesseract Fast Arabic/English, local geometry, general Arabic/financial correction with original evidence preserved; all titles, headers, first/all columns, dates, amounts, years, descriptions, notes and candidate rows. Explicit review, editable roles/cells, filename metadata/rename, draft recovery, reusable templates, history and financial suggestions only. No silent correction or financial posting.
- OpenCV existing Lab geometry evaluated on host; useful deskew evidence, not integrated into APK. PDF-to-XLSX local benchmark retained for evaluation only; no production dependency or Excel change without approval. Keep original 22 Nov implementation gates and minimize app size. 1 MiB import cap remains unchanged; larger scans require approved design. Do not reopen frozen Excel/D11.xlsx or accepted Package 3/image editor without evidence.
- BUILD HOLD: last user-reported C free 367796224 bytes (~351 MiB); D free 97668214784 bytes (~91 GiB). Next: inspect/free safe C space (no indiscriminate deletion), check C/D before Gradle; native dependency/license/model provenance verification, one isolated Android build, QR LAN Android acceptance (Arabic/English/mixed/scanned PDFs, original names, correction, dates/amounts, saved templates/history, restart, offline, size/performance/memory). APK build/Android/release pending. Old APK is NOT R6. No integration into active project without approval.

### Finance Phase 1 — Codex identity-remediated NO-GO
- Last confirmed report: 365/365 targeted PASS, Full Finance 2264 PASS / 2 FAIL / 0 skipped; TypeScript PASS; scoped ESLint 0 errors, 8 existing warnings. Restart duplicate-payment regression enabled and now PASS. 63/65 original baseline failures resolved; remaining two relate to protected Documents/Excel; no waiver or change to protected source. Durable submission ID before mutation; retry returns committed result; explicit new operation permits identical independent payments; conflicting payloads or missing/corrupt receipts fail closed. Prior audited NO-GO evidence preserved.
- Local workspace `D:\TomorrowFinancePhase1`; latest verified delivery `TomorrowApp-Finance-Phase1-IDENTITY-REMEDIATED-NO-GO.zip`; `identity-delivery-NO-GO\REPORT.md`, `SHARED_SUBMISSION_CONTRACT.md`, `IDENTITY_PACKAGE_SHA256.txt`. Codex stopped at usage limit after receiving R4 reference paths; any newer unfinished work is NOT independently verified. Resume SAME Codex thread and SAME isolated workspace; inspect actual current state before changes, continue only unfinished work. No assumption of completed integration.
- Next: exact R4 caller compatibility, full-payload adapter mapping, review two named failures without modifying protected Documents/Excel or weakening tests, combined integration prerequisites and Android interruption/restart tests. Maintain NO-GO until acceptance. No apply/merge/commit/push.

### Finance Phase 2 and 3 — ChatGPT Work, frozen R4
- Phase 2 R4: 5/5 targeted, 2119 PASS / 65 FAIL full Finance, TS PASS. Phase 3 R4: 9/9 targeted, 2123 PASS / 65 FAIL full Finance, TS PASS. Historical R4 results, not rerun after Phase 1. Both exact ZIPs, original source snapshot and integration handover locally verified in `D:\TomorrowFinancePhase1\Frozen-R4-Reference-20261125-045216-8be12df7` (outer ZIP and four SHA256 checks PASS). Remain frozen/read-only; no R5 absent confirmed new defect. Work same conversation, use saved packages rather than regenerate. Wait for completed Phase 1 baseline and explicit integration approval. Preserve Phase 4/5 functional acceptance.

### General restart policy
- On next session read this latest checkpoint and actual files. Do not repeat completed work. Local saved files remain on disk; in-flight work is not guaranteed. Keep same Codex/Work chats, workspace and saved evidence. No automatic Git operations. No production application. Finance and PDF paths remain independent. Use Medium for routine implementation/integration; High for genuinely complex review, notify before changes. QR LAN default; USB only if necessary. `postingAllowed=false`; no automatic financial posting or replay.
<!-- /TOMORROW_FINAL_CHECKPOINT_2026_11_25_R6_FIX1 -->
Verified local backup: D:\Tomorrow-Project-Checkpoints\Final-20261125-20261125-051546-e3bb27c3



<!-- TOMORROW_PDF_R6_FIX5_2026_11_25_PREBUILD_HOLD -->
## 2026-11-25 — PDF Smart Cocktail R6 Fix5 v0.3.5 — SOURCE ACCEPTED, BUILD HOLD
Supersedes earlier PDF status only. Finance/Codex state is not re-audited or changed.
- Isolated D:\P4: Fix4 applied 17 files, 398/398 Documents PASS; Fix5 applied 2 files, 402/402 Documents PASS, zero failures/skips, full project TypeScript PASS, 39/39 final source pins PASS, 1464 protected files. User-confirmed local logs: D:\Tomorrow-P4-Builds\R6-Fix4-Prebuild-20261125-231556-6a2a972f\verification.log and D:\Tomorrow-P4-Builds\R6-Fix5-FinalSource-20261125-232655-666e5428\verification.log.
- No Fix6 absent a confirmed defect. No build, install, Git, merge, main project source edits or financial posting. New Regional OCR not yet built or accepted on Android. Offline only. Preserve native PDFBox, Tesseract Fast Arabic/English, original evidence and reviewed values; financial dictionary proposals, regional OCR, explicit full-date confirmation, blank protection, templates/history and retry/corrupt-template safeguards included. Existing 1 MiB import limit unchanged. OpenCV/PDF-to-XLSX deferred pending real scan evidence and size benefit; frozen Excel reader and Finance are outside scope.
- Prior R6 Fix1 debug APK 340225678 bytes, SHA256 a0d321ba049aa55851f1eac28257bb4e4953cc4652af418ff2ff01a0a2b74d53. Four ABIs; ARM64-only estimated 126915726 bytes (121.04 MiB), not measured. New debug build only after explicit approval; retain both language models and ARM64 library names. Release/R8/resource optimization separate, after device acceptance; no deletion of useful functionality.
- Build/cache/temp on D:\Tomorrow-Build-Cache, isolated project D:\P4, Downloads for delivery only. Preserve previous APK. Use Expo LAN dev client, no tunnel or USB unless technically required. Build draft is not executed/tested in Windows; restoration and APK checks pending actual execution. No repeated successful tests without cause. Next: explicit build approval, one ARM64 native debug build, device acceptance checklist, real size/performance, then separate release optimization. No automatic posting/replay. postingAllowed=false.
<!-- /TOMORROW_PDF_R6_FIX5_2026_11_25_PREBUILD_HOLD -->


<!-- TOMORROW_PDF_R6_FIX6_2026_11_25_PREBUILD_HOLD -->
## 2026-11-25 — PDF Smart Cocktail R6 Fix6 v0.3.6 — SOURCE ACCEPTED, BUILD HOLD
Supersedes earlier PDF status only. Scope PDF Smart Cocktail, no Finance/Codex/Excel work.
- Fix6 applied two files to isolated D:\P4; named-month complete dates and YEAR TOTAL classification fixed. User-reported Windows full TypeScript PASS, Documents 405/405 PASS, zero failed/skipped, 39/39 source pins PASS, 1464 protected files, previous APK unchanged. Local log: D:\Tomorrow-P4-Builds\R6-Fix6-DateTotalReview-20261125-234954-67940e44\verification.log. Fix4 398/398 and Fix5 402/402 evidence preserved.
- Fix5 checkpoint retained at D:\Tomorrow-Project-Checkpoints\PDF-R6-Fix5-Prebuild-20261125-233710-dd0de0e4. This Fix6 checkpoint includes revised pins, updated acceptance references and held ARM64 build draft. Build draft explicit-path APK rollback correction not executed on Windows. No new application source changes in this checkpoint.
- Prior APK SHA256 a0d321ba049aa55851f1eac28257bb4e4953cc4652af418ff2ff01a0a2b74d53; 340225678 bytes. ARM64-only estimate 126915726 bytes, not measured. Build on D, Expo LAN only; no USB/tunnel unless necessary. Build only upon explicit approval. Retain both OCR models and prior ARM64 libraries; Release optimization after Android functionality accepted.
- Android acceptance pending for regional OCR, financial dictionary, source conflicts, multi-page documents, explicit date completion, save/restart/templates, real scans, size/performance. OpenCV and PDF-to-XLSX deferred until benefit demonstrated; no new dependencies, no online OCR. Original evidence immutable, no guessed missing dates or amounts. No automatic posting, replay, active integration, Git, Finance or Excel changes. postingAllowed=false.
<!-- /TOMORROW_PDF_R6_FIX6_2026_11_25_PREBUILD_HOLD -->


<!-- TOMORROW_PHASE9_FIX13_FREEZE_20261126 -->
## 2026-11-26 — Phase 9 / PDF Smart Cocktail final development freeze
Decision: Phase 9 core development is finished for current scope; Fix13 v0.3.13 is the frozen review-only candidate, NOT production integration or blanket acceptance. No Fix14, new OCR engine, or additional PDF development cycle unless explicitly reopened. Keep frozen Excel/D11.xlsx, accepted Documents capture/image editor, Finance and independent PDF Lab protected. Offline only; all online OCR/conversion comparisons cancelled. postingAllowed=false.

### Verified scope and baseline
- Isolated D:\P4. User-reported source application: 15 files (9 existing, 6 new); TypeScript PASS; Documents 457/457 PASS, 0 failures/skips; 51/51 final source pins; protected inventory and prior APK hashes PASS. Backup D:\Tomorrow-P4-Builds\R6-Fix13-FinalPDF-Candidate-20261126-032435-826dcee9.
- ARM64 debug build PASS, no prebuild/clean. APK 128411218 bytes, SHA256 e0fc6fe55e313995878782251fa77f8e02d1f8fa2097ea8ce5c76644fb00b06f. 35/35 prior native libraries; ara/eng model hashes PASS; +15980 bytes vs Fix12; no new library. Build D:\Tomorrow-P4-Builds\R6-Fix13-ARM64-Native-20261126-032603-20854455. Preserve Fix12 rollback APK SHA256 d02d0a44a6e82a8069449c073d3ef6fa5212f523eec5170eae340c3146c3b348.
- Android four diagnostic reports: Payment Plans 104 initial agreements (14 empty), 1 exact retry, 12 identifier-spacing proposals, 2 mixed proposals, 4 restricted-token proposals = 123/123 potential agreement. D11 BUSINESS 130/138 (8 unresolved; multiline header recovered but not exact); agricultural expenses 41/60 (19 unresolved, mainly digits inside Arabic text); English installment table 50/50. Combined 344/371 potential agreements, NOT ground-truth accuracy. All review only.
- PDF-to-XLSX Payment Plans: 123/123 round-trip text matches, 0 different, 0 unplaced, 1 page. Actual workbook opened independently and in desktop Excel (34 rows, 5 columns, 12 merges). Five annual subtotals reconcile to 5,522,830; original PDF confirmed empty D19, preserve blank, no inferred amount. Amounts and dates are literal text, not typed numeric/date values. No bidi controls in amount/date cells in this sample; title has isolates. Report SHA c4cecdf983efc6a7bcee722f11390a84f59fd2ebf51e7269786206a80b760345 differs from uploaded workbook SHA ba845139132f1759678561b38404e6f81c20139bf2a59a96269af9db4543b926; same reported content does not establish byte identity. Frozen in-app Excel reader compatibility not verified for this export.

### Approved architecture and acceptance boundary
- Three external reviewer opinions agree: PDFBox primary native text/geometry; Tesseract Fast Arabic/English shared engine for Page OCR and Cell OCR, run selectively for missing/unusable/conflicting evidence. Keep raw engine provenance and user-confirmed edits. Display native evidence and flag all conflicting financial values and mixed digits for explicit review; no silent correction, auto-resolution, replay or posting. XLSX export/review only, not an independent fallback reader. No new engine; OpenCV not integrated; no online services. Keep both OCR languages. Production UX simplified: automatic engine selection, compact PDF/Excel/Edit tabs, direct review/save actions; move test-only controls to diagnostics.
- Before final integration/release: validate total-vs-payment classification independent of column, merged year/partial date linkage, missing amounts, mixed digit conflicts, bidi-safe numeric/date values, export source binding/hash discrepancy, actual frozen in-app reader compatibility if relevant, saved review/template/history and restart behavior, scanned/multipage/offline coverage and resource limits. Measure release APK/AAB and target-device memory; optimize size without sacrificing features. Do not claim those gates passed. UI formatting/width/title isolates deferred. No source patch required for this checkpoint.
- Documents Packages 2/3 user device acceptance previously reported (5/5, 4/4, 8/8); Excel D11 date display accepted/frozen; do not reopen without evidence. Phase 9 final integration and combined safety acceptance pending.

### Remaining roadmap / next work
- Phase 1 Finance foundation: last verified Nov 25 Codex checkpoint NO-GO, 365/365 targeted, 2264 PASS / 2 FAIL full Finance, TS PASS; 63/65 earlier failures resolved. Two remaining failures relate to protected Documents/Excel; inspect exact current state in D:\TomorrowFinancePhase1, same Codex thread. Exact R4 caller compatibility, full payload adapter, restart/interruption and persistence verification required. No changes to protected code to silence failures. Newer results unknown until inspected.
- Phase 2 and 3: frozen isolated R4 remediation candidates; Phase 2 targeted 5/5, full historical 2119 PASS / 65 FAIL; Phase 3 targeted 9/9, full historical 2123 PASS / 65 FAIL. Both TS PASS. These are historical and not a combined post-Phase1 result. Use saved packages and handover, do not regenerate R5. Integrate only after verified Phase 1 and explicit approval.
- Phases 4/5: functionally accepted Nov 23, preserve during integration; formal closure pending combined baseline.
- Phases 6/7: substantial Installments and precision/calculator functionality implemented; recommend next read-only closure audits (can run independent of pending Phase 1 if no writes); do not assume complete. Phase 6: schedule-only, CRUD, due dates, currency, hydration/restart, duplicates, linked-payment rules. Phase 7: decimal precision, 0/2/3 decimals, rounding, Arabic/Persian digits, calculator expressions, cross-currency accounting. Check canonical scope before changes. Final acceptance depends on integrated foundation.
- Phase 8: historical functional closure 2153/2153 Finance tests and user Android reports review, preserve; retest impacted paths only as needed after integration.
- Phase 9: development freeze as above, separate integration gate. Phase 10 voice input; Phase 11 backup/sync; Phase 12 smart recording and financial notifications pending. Keep original roadmap numbering. No automatic Git operations, no source modification in active checkout, no APK build in this save operation. High thinking for financial integrity/combined audit, Medium routine tests. LAN QR default.
<!-- /TOMORROW_PHASE9_FIX13_FREEZE_20261126 -->

Verified local evidence checkpoint: C:\Users\Walid\Documents\Tomorrow-Project-Checkpoints\Phase9-Fix13-Freeze-20261126-035955-831bbf1a

<!-- TOMORROW_PHASE67_R2_FREEZE_20261126 -->
## 2026-11-26 - Phase 6/7 R2 isolated development freeze
- Status: targeted validation PASS; frozen integration candidate, NOT production acceptance or final Phase 6/7 closure. Do not create R3 absent a confirmed new defect. Preserve Phase 9 Fix13 freeze.
- Scope: Phase 6 assets, debts, loans, cheques, installments and net worth; Phase 7 calculator and amount precision. R2 changes three source files (amountExpression.ts, amountPrecision.ts, exactAmountArithmetic.ts) and twelve test files. No store/persistence changes. Preserve the original baseline, manifest, unified patch and evidence; reconcile overlap with Phase 1/2/3 before applying any patch.
- Five original precision defects reproduced on Windows: exponent precision bypass, unsafe integer, unsafe arithmetic result, lost fractional amount, unsupported currency. R2 probe 13/13, calculator 45/45, targeted Phase 6/7 921/921, scoped TypeScript 6.0.3 PASS. Source/test inventories 396 baseline and 398 candidate. R1 retained as historical evidence.
- Full Finance comparison: baseline 2114 PASS / 65 FAIL / 2179 total (100 test files); R2 2127 PASS / 56 FAIL / 2183 total (101 files), zero skipped/cancelled/todo. Nine prior failures no longer fail; zero new failing titles; all 56 remaining titles and error/code fields match baseline. Breakdown: 46 useContext errors, 6 t-is-not-a-function errors, 3 assertion failures (Reports wiring, large XLSX, Documents UI), 1 null-reading-0 error. Do not waive failures or assume solely fixture issues. Frozen Documents/Excel source must not be changed without explicit approval. Shared failures must be reconciled with Phase 1/2/3 baseline; do not add improvement counts from independent baselines.
- Gate: exact Phase 1 baseline completion, R4 Phase 2/3 compatibility, R2 shared amount helper overlap, full project TypeScript, full Finance and relevant Documents regressions, Android functional/restart and persistence checks, user integration approval. No automatic apply, merge, commit, push, install, build, or live posting. postingAllowed=false.
- Next: resume Phase 1 in existing isolated Codex workspace, preserve frozen R4 Phase 2/3, R2 Phase 6/7 and Phase 9. Phase 4/5 functionally accepted; Phase 8 previously complete, shared regressions remain to be reconciled. Phases 10 voice, 11 backup/restore, 12 smart recording/local notifications are offline-only; minimize release size, no cloud dependency. High for financial safety/integration audits; Medium for routine implementation.
<!-- /TOMORROW_PHASE67_R2_FREEZE_20261126 -->
Verified local evidence checkpoint: C:\Users\Walid\Documents\Tomorrow-Project-Checkpoints\Phase67-R2-Freeze-20261126-041948-448d78fa

<!-- TOMORROW_PHASE45_R1_FREEZE_20261126 -->
## 2026-11-26 - Phase 4/5 SafeRates R1 isolated development checkpoint
- Preserve Phase 4/5 functional acceptance (Android 4/4 on 2026-11-23). R1 is a targeted integration candidate, not a production update. Freeze this candidate; no R2 absent a confirmed independent defect.
- Windows R1 verification: focused 32/32 PASS; transfer/rates/UI regressions 363/363 PASS; scoped pure-module TypeScript PASS; 401 src/test/review file inventory verified, frozen Phase67 R2 398 files unchanged; active src/tests unchanged. Full project TypeScript, full Finance, Android R1 and final integration not yet verified. Do not combine test counts across overlapping suites or waive previous failures.
- R1 modifies TransferModal and transferRateSuggestion plus two test files; confirmed saved market/manual/mixed provenance only, no unverified default rate for different currencies. Same-currency rate 1. Preserve edit/refresh draft protection. No per-currency timestamp exists, so saved market rate is NOT claimed current. Preserve offline saved/manual rates; previously accepted optional live refresh remains unchanged.
- review/transferAccountingPreview.ts is an isolated prototype, NOT wired to production. Proposed policy: actual received is authoritative, optional source-currency fee additional to transfer principal, exact minor-unit validation and no double deduction. Before implementation obtain explicit accounting policy approval (including fees deducted from principal or charged elsewhere, credit card payments, and reporting). Existing tests intentionally permit USD 0.513 stored/displayed 0.51 and three-decimal ledger rounding; do not rewrite legacy records or weaken tests. Coordinate currency-specific precision policy with Phase 1/2/3 and Phase67 R2, including atomic fee/transfer edits/deletes, durable retry/identity, balances/net worth and reports.
- Integration order: finish Phase 1, reconcile Phase 2/3 R4, Phase67 R2 and Phase45 R1 shared file/test overlaps, then implement approved transfer accounting policy against the verified shared baseline. Full project TypeScript, Finance/Documents regression, Android lifecycle and persistence, explicit integration approval. Preserve Phase 8 and Phase 9 Fix13 freeze. Phases 10/11/12 offline-only. No apply/build/install/Git/live posting. postingAllowed=false.
<!-- /TOMORROW_PHASE45_R1_FREEZE_20261126 -->
Verified local evidence checkpoint: C:\Users\Walid\Documents\Tomorrow-Project-Checkpoints\Phase45-R1-Freeze-20261126-042902-82421694

<!-- TOMORROW_FINANCE_V5_FREEZE_20261126 -->
## 2026-11-26 - Combined Finance V5 development freeze / acceptance pending
- Latest cumulative isolated Finance candidate for Phases 1-7, including R4/R2/R1 and the reconciled Phase 1 persistence/submission changes. V5 supersedes V1-V4 as the candidate for further acceptance, not as an active-project release. Freeze V5; no V6 absent a confirmed defect. Preserve all prior backups, not delete them.
- Windows verification (Node v26.12.1, TypeScript 6.0.3): 114 Finance test files, 2414/2414 PASS, zero failures/cancelled/skipped/todo; full TypeScript exit 0; scoped ESLint exit 0, zero errors and 11 warnings, no autofix. Frozen base 456/456 and payload 79/79 hashes PASS; candidate inventory and active src/tests/selected configs unchanged. Do not rerun successful tests without relevant changes. No claim of full checkout inventory or Android acceptance.
- Source evidence: Finance-Combined-V5-20261126-061331-b2142485. Package SHA256 9e22634a665eac561fbfce8ee2e208c2a128d597c99393e2bcee70d735f8d0f2; Windows evidence SHA256 dcd1875c7c8898ae5723198d6849207968ff9cfb5cbd19dee960fdbdc572d81e; frozen base SHA256 f22c91e5854bbdff342816f985d9ce82a103edc4a45977c213bf54b2c83ef1e9. Exact archives and inventory preserved by this checkpoint.
- Proposed V5 transfer policy implemented and regression-tested, explicit accounting acceptance pending: fee additional to principal in source currency; linked expense counted once; confirmed actual destination credit authoritative, quote retained. OMR 100.000 less 10.123 principal and 0.100 fee = 89.777; USD credit 26.32. Edit fee 0.050/credit 26.31 yields OMR 89.827/USD 26.31; delete restores OMR 100.000/USD 0. Preserve legacy transfers without rewriting. No unsupported fee modes implicitly approved. Native persistence/restart and partial-write recovery, including linked fee/transfer consistency, still require device acceptance.
- Codex separate Finance Acceptance R2 build: package com.tomorrowapp.financeacceptancer2, ARM64 only, 106519065 bytes (101.58 MiB), signature and SHA256 verified by Codex; APK D:\TomorrowFinancePhase1\A\artifacts\finance-r2-arm64.apk, checklist PHONE-CHECKLIST.md, LAN 8096. User reached Finance screen with 0 transactions. First synthetic USD 1000 account persistence test requested; results not yet supplied. 20/20 prior focused tests PASS. Obtain the complete remaining checklist from the same Codex thread and run once; do not rebuild or repeat tests without need. R2 acceptance is separate from V5 and does not establish V5 acceptance.
- Next: review/approve transfer accounting policy; complete the existing R2 phone checklist and preserve evidence; prepare separate V5 Android acceptance build with verified hashes, run actual storage/restart/retry and recovery, balance/report/transfer fee checks and relevant regressions, then independently review results and request explicit approval before active integration. High for accounting/persistence/final audit; Medium for routine build/tests. LAN QR only, no ADB unless separately justified. No automatic posting/replay/repair/adoption; postingAllowed=false. No active apply, Git operations or unrelated modifications.
- Phase 8 previously accepted; Phase 9 Fix13 freeze saved separately (integration pending); frozen Excel protected. Phases 10/11/12 remain offline-only planned work. Earlier Phase 4/5 R1 and Phase 6/7 R2 checkpoints remain preserved. Do not reopen PDF development or repeat closed work absent a new defect.
<!-- /TOMORROW_FINANCE_V5_FREEZE_20261126 -->
Verified local evidence checkpoint: C:\Users\Walid\Documents\Tomorrow-Project-Checkpoints\Finance-V5-Freeze-20261126-061745-bb5c8b8e


<!-- TOMORROW_PHASE10_OFFLINE_VOICE_STUDY_20261126 -->
## 2026-11-26 - Phase 10 offline voice input / proposed study (NOT implementation approval)

### Status and scope
- User supplied an offline Egyptian Arabic financial speech-to-text proposal for discussion next session. Retain it as a design study, not an engine adoption, installation, or implementation checkpoint.
- Finance V5 remains frozen: 2414/2414 Finance tests, full TypeScript and scoped ESLint PASS (11 warnings); accounting policy, separate R2/V5 Android acceptance and active integration remain pending. Phase 9 Fix13 and accepted Excel remain protected. No active Finance, PDF, Excel, Documents, or native lab source changes. No Git operations. `postingAllowed=false`; no automatic posting, replay, repair or adoption.
- Phase 10 requirements: local recognition of Egyptian Arabic, incidental English/code-switching, spoken numbers, decimal amounts and currencies (including EGP, OMR, USD), and everyday spending terms. Phase 11/12 offline-only decision unchanged. No cloud recognition, telemetry, paid APIs, audio upload or automatic cloud fallback. Initial download of a model only is allowed with explicit consent; also support local model-file import for fully offline provisioning. Normal manual financial entry remains available without voice.

### Candidate shortlist (research checked 2026-11-26; not device benchmark results)
- Primary evaluation: one multilingual Whisper runtime via whisper.rn/whisper.cpp. Test `ggml-base-q5_1.bin` (57 MiB, approx 59.7 MB) first, and `ggml-tiny-q5_1.bin` (31 MiB) on the same utterances. Select the smallest that meets actual device/financial field criteria. Do not use `.en` variants. `small-q5_1` (181 MiB) is a fallback experiment only if both initial models fail agreed accuracy gates. Do not ship multiple STT engines or automatically download all models. Q5 is a CPU baseline; experimental accelerator variants are not assumed to work on Huawei. Validate ARM64 and generic CPU fallback, ABI/library size and Expo SDK 58/RN 0.88.1 compatibility before adoption. Expo native prebuild/custom client required in isolated workspace only, not Expo Go. No use of unstable accelerated paths without evidence.
- sherpa-onnx is a runtime, not one fixed model. Moonshine Base AR quantized (2026-02-27 export) has encoder ~31.3 MB + decoder ~109 MB; legacy Arabic non-streaming model license is non-commercial. No verified Egyptian-English code-switch financial result; not a smaller or preferred candidate here. SenseVoice listed languages are Chinese, English, Japanese, Korean, Cantonese, not Arabic. Vosk Arabic MGB2 listed as 318M; Tunisian small 158M, neither established as a better Egyptian mixed-language solution. Android on-device SpeechRecognizer API 31+ is optional hardware/service/language dependent; no reliance on it or cloud fallback. No third engine justified now; revisit only if benchmark shows genuine unmet need. No claim about every possible model.
- Model source: https://huggingface.co/ggerganov/whisper.cpp ; https://huggingface.co/ggerganov/whisper.cpp/blob/main/ggml-base-q5_1.bin (published SHA256 422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898); https://huggingface.co/ggerganov/whisper.cpp/blob/main/ggml-tiny-q5_1.bin (published SHA256 818710568da3ca15689e31a743197b520007872ff9576237bda97bd1b469c3d7). These are publisher metadata, not hashes of locally downloaded models. Pin immutable revision, exact byte length and SHA256 before implementing downloads; record runtime/model license and dependency version. Model sizes are disk files only, not installed APK delta, RAM or proven accuracy.
- Runtime/API: https://github.com/mybigday/whisper.rn ; https://alphacephei.com/vosk/models ; https://k2-fsa.github.io/sherpa/onnx/sense-voice/ ; https://huggingface.co/csukuangfj2/sherpa-onnx-moonshine-base-ar-quantized-2026-02-27/tree/main ; https://github.com/moonshine-ai/moonshine/blob/main/docs/license.md ; https://developer.android.com/reference/android/speech/SpeechRecognizer .

### Proposed isolated architecture
1. Settings/Voice setup: opt-in model catalog, status (missing/downloading/verifying/ready/error), approximate size, free storage check including temporary copy, progress/cancel/retry, explicit local import or HTTPS model-only download. Store in private durable app documents storage (not cache). Download/import to temporary `.part`, verify exact bytes and pinned SHA256 using streaming/native file hashing (do not load model into JS memory); promote atomically in same directory. Revalidate on startup before inference or after model changes. Interrupted/mismatched files must never be marked ready. Delete/re-download only via explicit action after releasing model context. Exclude redistributable models and temporary audio from financial backups unless separately designed. No audio/network inference.
2. Push-to-record short single utterance: microphone permission, visible recording state, stop/cancel, bounded duration (proposed 5-15s initially; hard limit to be tested), handle audio interruptions and resource release. Capture/convert local audio to 16 kHz mono PCM WAV (validate recorder's actual output; changing file extension is not conversion). Prefer simple bounded record-then-transcribe over streaming V1. Check silence/clipping/noise using tested speech-quality gate; optional lightweight local VAD only if evidence justifies it. No guessed transcript on silence; no background recording.
3. Native adapter: local path only; initialize verified model on demand, release context on deletion/unmount; serialize inference, cancel stale sessions and suppress late results; use CPU initial baseline, measure RAM, cold/warm latency and thermal behavior. Transcribe (not translate) with language `ar` vs auto tested on same recordings, optional English selection. Evaluate short domain vocabulary prompt vs no prompt; use actual version-specific prompt option (do not assume `initial_prompt`/`initialPrompt` universally supported by batch API). Prompt includes Egyptian expense vocabulary and currency words, NOT arbitrary example numbers or default currency, to reduce hallucinated values. No network input paths. Preserve raw transcript and model/version provenance for review; never silently substitute values.
4. Pure TypeScript parser, separate from Finance: Arabic/Persian/Western digits; spoken Egyptian number expressions (e.g. ميتين وخمسين), fractions/decimal wording, thousands and currency subunits; mixed English, negation, corrections, multiple amounts, dates/account names and currencies. Use exact decimal strings/minor-unit validation; no floating arithmetic for money, no arbitrary rounding/truncation; currency aliases to supported codes only, no guess for ambiguous 'جنيه' outside established explicit context or missing currency. No auto-add/split multiple transactions in first version. Return candidate fields, text spans, warnings and ambiguous/unknown fields as null. Category mapping from approved local vocabulary and user categories via read-only adapter; no changes to Finance store. Local user-confirmed aliases optional later; never rewrite numbers using history.
5. Review UI: original transcript, editable transaction type/description/category/amount/currency/date/account; candidate labels clearly unverified; no automatic ledger write. Require explicit user review and manual save through existing approved Finance validation/persistence boundary after integration approval. First isolated prototype can only return a draft, not invoke save. Ambiguous number/currency, multiple values, missing account, silence/noise, permission failure, missing/corrupt model, insufficient storage or cancellation -> safe message, repeat recording or manual entry. Never infer success from transcription alone. Clear temporary audio by default after review/cancel unless explicitly retained; no sensitive logs or backups.

### Proposed code structure (illustrative, not compiled or implemented)
```
src/features/voice/
  model/manifest.ts
  model/modelRepository.ts
  audio/recorder.ts
  engine/whisperAdapter.ts
  parser/egyptianNumbers.ts
  parser/financialVoiceParser.ts
  domain/types.ts
  screens/VoiceSetupScreen.tsx
  screens/VoiceReviewScreen.tsx
  tests/  (or repo test convention)
```

```ts
// Proposed contracts, not installed code or verified API integration.
type VerifiedModel = { path: string; id: string; sha256: string };
type VoiceDraft = {
  rawText: string;
  amount: string | null;  // exact decimal string, never Number-based money
  currency: string | null;
  category: string | null;
  kind: 'expense' | 'income' | null;
  accountId: string | null;
  warnings: string[];
  modelId: string;
  needsReview: true;
  postingAllowed: false;
};
interface ModelRepository {
  getVerifiedLocalModel(): Promise<VerifiedModel | null>;
  prepareFromExplicitSource(source: string): Promise<VerifiedModel>;
}
interface LocalSpeechEngine {
  transcribe(model: VerifiedModel, localWav: string): Promise<string>;
  cancel(): Promise<void>;
}
// After verified local model + validated audio capture:
// initWhisper({ filePath: model.path, useGpu: false });
// const { stop, promise } = ctx.transcribe(localWav, { language: 'ar' });
// const { result } = await promise; // reject cancelled/stale/no-speech result
// await ctx.release();             // use finally; manage cancel/release race
// Return parseFinancialVoice(result) -> review-only VoiceDraft.
// No Finance store import or posting method in this module.
```

### Benchmark and decision gates before coding full feature
- New isolated workspace only; same target Huawei ARM64 phone and a standalone test build where possible. Record a single reusable labeled corpus (proposed 40-60 short synthetic phrases) with quiet/noisy/silent cases, Egyptian colloquial, mixed English, numbers including confusing pairs (15/50, 16/60, 100/1000, 250/2500), decimal/subunit EGP/OMR, missing or ambiguous currency, negative/correction, multiple amounts, unknown category. Example "صرفت ميتين وخمسين جنيه بنزين" -> candidate 250 EGP fuel, account not assumed. Keep training/prompt examples separate from held-out checks. Compare exact amount/currency/type matches, category suggestion rate, rejection/ambiguity rate, word error rate as secondary, latency p50/p95, peak RAM, APK/AAB delta and installed total including model; no invented benchmark. Proposed discussion target >=95% exact unambiguous amount/currency on representative held-out set, 100% manual review/no auto posting and no silent acceptance of ambiguity. Thresholds and sample size require user agreement, not a production accuracy claim.
- Test initial download offline, interrupted/low storage, hash mismatch, local import, delete/re-download, restart and airplane mode with Wi-Fi/mobile data off, model missing, permission denied, cancellation, repeated input/stale callbacks, silence/background noise, parser invalid numbers/currencies, manual review and exact decimal checks. Standalone Android build for true airplane-mode test; LAN dev client does not prove standalone offline behavior. Compare installed footprint with same non-voice build; no hard size cap or unsupported speed guarantee. Use smallest passing model, remove experimental models. Do not add alternative engine until confirmed problem and review.
- Next session: discuss this proposal and gate/thresholds first, choose pinned runtime/version/model and isolated workspace, then bounded prototype if explicitly approved. High thinking for model/architecture/financial parser review, Medium for routine implementation. Keep Codex and ChatGPT Work separate from ongoing R2/V5 Finance acceptance. Do not rerun successful prior Finance tests absent relevant changes; Phase 10 implementation has not started.
<!-- /TOMORROW_PHASE10_OFFLINE_VOICE_STUDY_20261126 -->
Local study checkpoint: C:\Users\Walid\Documents\Tomorrow-Project-Checkpoints\Phase10-Voice-Study-20261126-062548-bd6f0a4d


<!-- TOMORROW_FINANCE_V6_FREEZE_20261126 -->
## 2026-11-26 - Finance Combined V6 software-verification freeze
- V6 supersedes V5 as the isolated Finance acceptance candidate, not an active release. Preserve V5 and all earlier checkpoints. No V7 without a confirmed defect.
- Independent Codex static review found three R2 regressions in V5: contradictory new/unchanged submission states could discard/rebind inconsistent receipt evidence (P1); category archive hydration accepted malformed non-boolean values (P2); exhausted refund could not complete its retained receipt without a new operation (P2).
- V6 restores receipt contradiction protection, boolean-or-absent archive validation for accounts/categories, and explicit receipt-only completion without accounting replay or new identity. Four production files modified, one production component added, one regression test added. Existing tests and transfer fee/FX implementation preserved. Delivered targeted evidence: 88/88 PASS, including 15 new regression cases.
- Independently reviewed delivery ZIP SHA256 a73885510ea850004cccf26e28189cadaa7e1a80c2cf76c7db769e1374eb8aa1; 93/93 internal manifest member hashes verified; 81 cumulative payload entries against the original 456-file frozen base. V6 is cumulative: do not stack V5 over V6. No claim of full checkout inventory.
- Codex subsequent full verification reported 2429 PASS, 0 FAIL, 0 skipped; full TypeScript PASS; scoped ESLint 42 files, 0 errors, 11 warnings; five production delta files clean; all 81 payload entries verified. Separate local full report and evidence preserved with copy hashes by this checkpoint. These full-run results are Codex-reported, not an independent rerun by ChatGPT.
- Remaining gates: explicit transfer accounting policy acceptance (source fee additional to principal, linked expense counted once, actual destination credit authoritative, quoted FX retained, edit/delete reverse both, legacy unchanged); V6 Android acceptance including durable persistence/restart/retry, receipt-only full refund completion, fee/balance/report reconciliation; explicit active-integration approval. No automatic posting or replay.
- R2 phone acceptance remains a separate ongoing task: package com.tomorrowapp.financeacceptancer2, LAN 8096. Use existing numbered checklist and actual evidence; do not repeat documented PASS cases. No R2 phone PASS beyond launch is asserted by this addendum. R2 is not V6. Preserve its workspace, APK and LAN server. Prepare V6 build separately only when authorized; avoid redundant tests without evidence of compatibility.
- ChatGPT Work read-only roadmap review confirmed previously open accounting/Android/integration gates, saved market quote age unknown where individual timestamp unavailable, and Phase 9 Smart Review integration pending. Its full current local Resume was unavailable; no new broad closure claim. Treat unverified freshness as unknown. Preserve Phase 9 Fix13 and frozen Excel; complete agreed editable review flow at integration, no new PDF engine development.
- Phase 10 offline voice study remains saved, not implemented; compare viable engines without manufacturer restriction or predetermined winner; Phases 10-12 offline-only. Can assign independent next-phase study while phone testing, no overlapping edits. Preserve all Phase 9 and Finance acceptance gates.
- No active apply, test rerun, native build, install, Git commit/push/merge, or LAN changes by this checkpoint. postingAllowed=false.
<!-- /TOMORROW_FINANCE_V6_FREEZE_20261126 -->
Verified local V6 checkpoint: C:\Users\Walid\Documents\Tomorrow-Project-Checkpoints\Finance-V6-Freeze-20261126-192905-1e45f290
Full report SHA256: 1593bedaee228d1443dfc051c510c1edf978c35b4392bbb3ed460d4728970bd5


## Finance Phase 1 — Final Technical Closure (2026-11-27)
<!-- TOMORROW_FINANCE_PHASE1_CLOSURE_20261127 -->

**Status: CLOSED / GO — accepted isolated V7-UI-R6 Fix5 baseline. Controlled main-project integration remains PENDING.**

This dated closure supersedes historical Phase 1 pending/NO-GO statements in this Resume for the accepted isolated candidate only. The user accepted the Android functional and final visual review and authorized recording closure before any further collection or integration. Codex completed an independent read-only closure audit with no confirmed blockers; ChatGPT reviewed and accepted that conclusion. No implementation, merge, commit, push or integration is authorized by this documentation operation.

### Frozen reference
- Main project: `D:\Mobile Apps\TomorrowApp`; branch `codex/finance-8-6-expenses-redesign`.
- Accepted isolated source: `D:\TomorrowFinancePhase1\V7-UI-R6-Fix5-Verification-20261127-045356-681a8af4\source`.
- Android staging: `D:\U77029`; package `com.tomorrowapp.financeacceptancev7`; V7 LAN Metro 8097. Preserve R2 port 8096 and existing Android data.
- Preserve this baseline and the earlier remediation candidates, manifests, test evidence and audit report. Do not create a new revision without a confirmed defect.

### Verified acceptance evidence
- Finance regression: 2494/2494 PASS; zero failed, cancelled or skipped. TypeScript PASS. Scoped ESLint 0 errors, 4 warnings. No full regression rerun in the closure audit.
- Baseline SHA256 428/428 and candidate SHA256 16/16 PASS; post-test integrity PASS. Codex independently reported 413/413 unchanged baseline files and 283/283 staging production files matching the verified source.
- Android: earlier functional acceptance and final R6 visual acceptance PASS (user-attested; detailed device execution logs unavailable to Codex). The older software verification report predates this acceptance and its port-occupied NO-GO is historical, not the final closure decision.
- Independent audit: all eleven requirement groups PASS (Android user-attested). Phase 1 closure GO; controlled Finance-only integration readiness GO; no confirmed closure blockers.
- Original Codex report preserved verbatim as `Phase1-Codex-Closure-Audit-20261127.md` in the documentation checkpoint. SHA256: 12be446b25ecc264a0553648962d2022a4745409a46cf75516f869dd9b3dcae6.

### Original Phase 1 blocker resolution (per independent audit)
- Production acknowledgement and failure handling: acknowledged writes/readback before completion; failures block completion (`paymentOperationRuntime.ts:462`, `durableFinanceOperations.ts:182`, `acknowledgedFinanceHandler.ts:37`).
- Hydration: malformed/duplicate records and invalid evidence retained; writes blocked (`accountingHydration.ts:35,64`, `productionFinancePersistence.ts:126`).
- Durable submission identity, concurrency and restart retries: preserve explicit independent-operation selection; contradictory evidence fences (`financeSubmissionIdentity.ts:76,154`).
- Interrupted writes and cross-store recovery: partial/conflicting writes require manual review; no automatic accounting replay (`durableFinanceOperations.ts:106,201`).
- Accounting: actual account-currency amount remains authoritative; refund limits use original-currency precision; historical FX and linked ownership protected (`useLedgerStore.ts:178`, `debtPaymentFx.ts:11`, `paymentTransactionOwnership.ts:30`).
- V7/R6 retain Phase 1 protections and all 15 V6 regression cases; protected Documents/Excel assertions pass in the candidate. Preserve the newer protected source during later integration.

### Non-blocking limitations
- Four scoped lint warnings remain. Persistence guarantees cover native acknowledgement/readback and one loaded runtime, not hardware power-loss atomicity.
- Android sign-off is user-attested, not independently logged. No repeat acceptance cycle required for unchanged Fix5.

### Integration gate — separate, not started
- Controlled Finance-only integration is eligible for later explicit authorization. Reconcile cumulative Finance changes against the current main-project composition; neither copy the entire verification snapshot nor apply only the 16-file R6 delta.
- Preserve existing local changes, newer Documents source, PDF Smart Cocktail, frozen Excel, and the separate Phase 10 study. No Git operations or active application source changes during this closure save.
- After authorized integration, verify the resulting composition and perform only a short save -> restart -> receipt-retry smoke check unless a new defect requires targeted testing.
- Phase 2–11 closure, remaining cross-currency loan operations, unsupported automatic historical/API debt FX, regular installment schedule generation, Documents/OCR, voice, backup/sync and dormant posting activation are not declared closed here. Preserve earlier accepted scope and pending remediation requirements; do not reopen accepted work without evidence.
- Permanent date-entry integration requirement remains: calendar/date picker, consistent display, validated canonical YYYY-MM-DD storage for date-only values, including opening balance dates.
- Phase 10 V3 planning is separate; no voice implementation authorized here.
- Global safety: `postingAllowed=false`; no automatic financial posting or replay.

### Artifact fingerprints (SHA256 measured from attached archives)
- `Tomorrow-V7-UI-R6-Candidate-Fix5.zip`: `d3a296affb64cfa7fcd9acee58b076484db576c78bfd606e68dd06f6ba064554`.
- `Tomorrow-V7-UI-R6-Fix5-Evidence-20261127-045356-681a8af4.zip`: `0a135a12246cd1310daeb9e33edcd4fb436e909c2fd0f95f067b53d70f487ba6`.
- `Tomorrow-R5-Source-for-R6-20261127-035529.zip`: `885c460ce7973737c9bc237512cb3b31dd02320e5cdaa42f407490fd3b487a39`.

<!-- END_TOMORROW_FINANCE_PHASE1_CLOSURE_20261127 -->
