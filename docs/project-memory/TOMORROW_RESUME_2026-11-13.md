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
