# TomorrowApp ΓÇö TOMORROW RESUME ΓÇö 2026-11-13

## Resume instruction
When user says **"Tomorrow Resume"** or **"╪º┘ü╪¬╪¡ Tomorrow Resume"**, start here, then reconcile with actual current branch, git status, and latest commits. This is a handover snapshot, not proof of later work. Read docs/project-memory/MASTER_ROADMAP.md, CURRENT_STATE.md, DAILY_HANDOVER.md, ACCOUNTING_DECISIONS.md, WORK_RULES.md, FUTURE_MODULES_AND_ZAKAT.md. Some older files contain superseded status; prefer the verified 2026-11-13 checkpoint below.

## Project and last verified checkpoint
- Repository: `walidabdelhamid12-hub/TomorrowApp`
- Local Windows project: `D:\Mobile Apps\TomorrowApp`
- Working branch: `codex/finance-8-6-expenses-redesign` (never merge to main without approval).
- Last **user-confirmed local code checkpoint and push**: `bcc6b72` ΓÇö `feat(documents): add isolated local file vault foundation`.
- User's output showed `COMMIT EXIT: 0`, `PUSH EXIT: 0`, branch updated `d47157c..bcc6b72`, and no tracked changes afterward.
- Many unrelated untracked backup, script, report and Documents files remain on local disk; DO NOT delete, reset, clean, stage or assume these are pushed. Git's tracked working tree was clean.
- If this handover is committed separately on GitHub, the remote branch may be **ahead of local bcc6b72**. Verify and safely fast-forward before the next code task; preserve untracked files. Do not assume local/remote parity.

## Phase 9: Documents and smart receipts ΓÇö progress
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
- **NEXT TASK: 9.2C-1B-2 ΓÇö Expo FileSystem adapter**, one narrowly scoped task, review real SDK 58 types and runtime assumptions, adapter + injected fake tests, then Android native verification before claiming persistent file storage. No automatic deletion of orphan/staging files; no file+metadata atomicity claim. Define approved file scope and test plan before implementation.
- Phase 9 remains in progress; capture/import integration, repository linking, OCR and other smart receipts capabilities are not finished.

## Approved Finance home design ΓÇö 2026-11-13
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
- Do not renumber or discard the canonical Finance 12-phase roadmap. Earlier phases 1ΓÇô7 are substantially implemented but not blanket-finalized.
- Keep `postingAllowed=false`; dormant V3 journal; no live posting/replay/repair/adoption or unintended Finance mutation. No merge to main.

## Workflow
- One task at a time; inspect current repository and tests, explicit file scope, no automatic ESLint fixes, no destructive git cleanup.
- Codex is optional; assistant can provide code/ZIP + guarded PowerShell installer. Reserve Codex for large review/changes when available.
- Every PowerShell helper must collect output and end with `Set-Clipboard` so user can paste results with Ctrl+V.
- User requested that today's decisions and resume context be saved; don't claim local files or image were updated without actual evidence.
- On return, first verify branch/HEAD and GitHub/local synchronization (especially if this handover created a new GitHub commit), then plan 9.2C-1B-2. No further implementation was authorized by this handover alone.

## 2026-11-13 ΓÇö Latest checkpoint and approved design addendum (supersedes older status above)
- **Verified GitHub branch HEAD:** `76e249cee96ede3175e1bb6cc37ecda328ce0b41` (`76e249c`), message: `test(documents): checkpoint Android import integration pending device verification`. Earlier `bcc6b72` status is historical, NOT the current remote HEAD.
- The Android import integration test harness is committed at `src/app/vault-test.tsx`. Commit inspection confirms a dedicated test AsyncStorage namespace (`tomorrow:vault-test:v1:`), real importer and local vault wiring, write-once evidence, production Documents namespace read-only comparisons, and a separate read-only persistence check after restart. **Committed test code is not evidence of Android execution.**
- **Android Import: PENDING on-device execution and evidence review. Android Persistence: PENDING restart/reopen and read-only verification.** No device PASS is claimed. Prior unit/TypeScript results from older checkpoints must not be presented as fresh results for `76e249c` without rerunning.
- Next work sequence: run Android Import on the actual Android device; preserve its run ID and PASS/FAIL evidence; fully close/reopen the app; run read-only Verify Persistence; record both outcomes separately. Do not erase test evidence or backups.

## Finance visual reference ΓÇö latest user-selected image
- **Canonical current design reference:** `TomorrowApp_Finance_Design(8).png` (user-supplied image, 2026-11-13). The image is currently in the conversation/library; **its presence inside this Git repository has NOT been verified**. Do not silently substitute `TomorrowApp Finance Dashboard(4).png` or the older `docs/project-memory/assets/TomorrowApp_Final_Dashboard.png`. Keep old assets for history; do not delete backups.
- Reference shows dark navy TomorrowApp header, notifications/settings, financial profile selector, full date row with **blue circular Rates refresh arrows and green check status**, Total Balance with visibility eye/currency, Net Worth, two-column tiles (Expenses | Income; Accounts | Assets; Installments | Loans; Debts | Transfers), green Add and blue Reports buttons, Financial Planning (Trips, Events, Budget), and four bottom navigation items.
- Image values, labels and dates are mockup examples, not live balances, test outcomes, or requirements to hardcode.
- **Approved follow-up not yet drawn in the reference image:** add a centered **teal circular balance-scale ΓÜû∩╕Å control between Expenses (left) and Income (right)** without losing access to either tile. Tapping the scale opens an Income-vs-Expenses comparison report.
- **Comparison report reference requirements:** Total Income, Total Expenses, Net Difference, Spending Ratio; clear visual comparison and filters for period and account. Detailed layout and calculations must be checked against Phase 8 Reports/Statements design before implementation. No claim that this report or scale is already implemented.
- Rates icon/refresh behavior and its exact placement must be reconciled with the latest image before coding; a static mockup does not prove animation or rate-refresh behavior.
- Keep Documents inside the + Add menu (not a third standalone bottom button), Reports as a separate button, and the eight-tile layout described above.
- **No Finance code changes authorized in this documentation checkpoint.** Resume Phase 8 reports and dashboard implementation only after the Phase 9 Android verification sequence and separate approval.

## Documentation discipline and safety
- Treat GitHub project-memory as the durable source of truth; record every newly approved design/decision and verified test outcome at checkpoints. Keep historical statements distinguishable from current verified facts.
- Preserve unrelated files, backups, existing evidence and untracked files. Do not run destructive cleanup, change Finance posting, or merge to `main` without explicit user approval. Keep `postingAllowed=false`.
- Claude may handle scoped implementation, Codex is reserved for final/complex review, and ChatGPT Work is optional only when needed. Follow one-task-at-a-time workflow and use clipboard-ending PowerShell helpers.

## 2026-11-13 ΓÇö Android on-device verification results (latest)
- **Android Import Integration: PASS**, confirmed by user-provided Expo Go Android screenshots. Run ID: `41c22797-bc00-421a-a9d5-37125ff5e1e0`. Test document ID: `vt-41c22797-bc00-421a-a9d5-37125ff5e1e0`. Expected file length **80 bytes**. Reported checks PASS: test/production namespace separation, no unfinished import, source creation and size, write-once start evidence, importer created record, vault stored object, SHA-256 and byte size/path matches, repository readback/listing, production Documents state unchanged, write-once result evidence. Terminal line: `RESULT: PASS (device run complete; persistence NOT yet verified across restart)` (true at time of initial import).
- **Android Persistence (read-only): PASS after full Expo Go close and reopen** on the same device, as confirmed by subsequent user screenshot. Output: `PASS: No pending-import state in test namespace`; `PASS: Repository lists 1 test document(s)`; `Runs found: 1`; `PASS: run 41c22797: file 80 bytes, SHA-256 f746ea719eb7..., readback, listing, isolation`; `RESULT: PASS - 1 run(s) verified after restart (0 warning(s))`; `Read-only: nothing was written or deleted.`
- These are **actual Android Expo Go device test results**, not merely committed test harnesses. Scope is isolated test importer/vault and persistence for one run; it is **not** proof of all production Documents flows, OCR, user-facing document picker, or cross-process guarantees.
- Dependency preflight: `expo-crypto@58.0.8` installed (`npm ls` exit 0); TypeScript `npx tsc --noEmit` exit 0. `npx expo install --check` exit 1, listing **15** recommended package version updates; no automatic updates authorized. Local `package.json` and `package-lock.json` contain intentional uncommitted `expo-crypto` addition; **preserve them**, do not reset/clean or claim committed.
- Next: assess remaining Phase 9 tasks and separately approve a narrow implementation/test scope. Preserve evidence, local modifications and backup files. No Finance posting changes, no merge to `main`.


## 2026-11-13 ΓÇö Native Android PDF picker acceptance (later checkpoint)
- User-confirmed on-device Expo Go Android **Native File Picker read-only probe: PASS**; this uses `File.pickFileAsync` instead of the older `expo-document-picker` cache URI path that failed with Android unreadable-file errors.
- User-confirmed on-device **Native PDF Picker (Import Test): PASS**. This imports a non-sensitive PDF into the existing local vault and isolated test repository; not the production Documents UI.
- User-provided Android screenshot after closing/reopening Expo Go shows **Verify Native PDF Persistence (read-only): PASS** for document ID `vt-native-df498044-d47e-4e65-ab3c-90acb8449489`, **221199 bytes**, SHA-256 verified, **1 native picker import**. The verifier checked file presence, size, digest, repository readback/listing and absence of a production record-key collision. It performed no writes or deletions.
- Latest user-confirmed local sync and checks: `424f834` fast-forward, TypeScript EXIT 0, scoped strict ESLint EXIT 0. Local `package.json` and `package-lock.json` remained modified and untouched. No merge to `main`.
- Acceptance scope: **Android native PDF test import and post-restart persistence only**. Do not claim production Documents UI, camera/gallery, image import, OCR, transaction posting, broader file types, iOS, backup/restore or Phase 9 complete.
- Next proposed scoped work: review and design Documents V1 production-facing entry/list/import/view flow; preserve user-approved Documents entry inside Finance **+ Add**, not as a third bottom button. Define UX and files before implementation. Continue with explicit user confirmation for consequential scope.

## 2026-11-14 ΓÇö Native PDF Geometry Lab checkpoint

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
## PDF-LAB-CP01 ΓÇö 2026-11-19

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

## PDF Lab Checkpoint ΓÇö 2026-11-20

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

## 2026-11-20 ΓÇö Safe cleanup completed (append-only update)

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
## 2026-11-22 ├óΓé¼ΓÇ¥ Native PDF Lab STOP / handover
- User explicitly paused Native PDF Lab after repeated unsuccessful fixes; move to another TomorrowApp phase. Do not resume without request.
- Lab: `D:\TomorrowNativePdfLab-v3` (no Git). Freeze accepted Excel (including D11.xlsx date display) and protect prior PDF reference baselines.
- Huawei diagnostic D11.pdf: 808 chars, 0 vector lines, 103 post-clip quarantined, no verified cells. Payment_Plans.pdf: 744 chars, 6 lines, 49 quarantined, no verified cells.
- Dates/amounts exist as candidates, but Year/Description/Due Date/Amount cell mapping remains unresolved; Arabic RTL reversed/mixed. Coordinate-only is not proof of table cell membership.
- APK SHA256 `F1EC0EE55F63E9730039718C2948BE9E1213F3DAEE1542ADE9341C7490FA8A41`; APK v2 signature verified, installed Huawei signer comparison unavailable. Functional extraction NOT accepted.
- No automatic financial posting (`postingAllowed=false`), no PDF APK/build/retest without explicit reopening. See lab `docs/project-memory/TOMORROW_PDF_STOP_CHECKPOINT_2026-11-22.md`.
<!-- /TOMORROW_PDF_STOP_CHECKPOINT_2026_11_22 -->
<!-- PDF_SMART_COCKTAIL_PLAN_2026_11_22 -->
## Phase 9 ├óΓé¼ΓÇ¥ PDF Smart Cocktail plan (agreed discussion, 2026-11-22; NOT implemented)

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

<!-- TOMORROW_PHASE123_PAUSE_2026_11_23_START -->

## Finance Phase 1-3 Pause Checkpoint ΓÇö 2026-11-23

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
