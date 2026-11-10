# TomorrowApp — Work Rules and Resume Protocol
Updated: 2026-11-11

## TOMORROW-RESUME
This phrase is a request to resume from the project's **actual repository documentation and last accepted checkpoint**, not a secret, a command executable on the user's PC, or automatic access to local uncommitted work.
Read all five docs/project-memory files from the working branch. Confirm repository/branch/HEAD; compare documentation with newer commits and user-provided local status. Report what is verified, reported, planned and pending. Do not treat an old handover as newer than Git history.

## Execution rules
- One clearly scoped task at a time; inspect existing code and tests before editing.
- Define target, authorized files, accounting invariants, tests, rollback/checkpoint plan before implementation.
- No broad refactors, automatic ESLint fixes, destructive Git commands, or edits to unrelated untracked backups.
- No UI redesign without approval. Preserve existing storage and backward compatibility.
- No merge to main, commit, push, force push, posting activation or ledger mutation without explicit approval for that action.
- postingAllowed=false and V3 dormant by default. Reports remain read-only; safe payment recovery/authorization is a separate gated project.
- Verify TypeScript, relevant tests, full Finance suite where appropriate, and Android behavior when UI/persistence changes.
- Distinguish Codex-reported tests from assistant-verified tests; never fabricate test results.
- Use supported currency precision and historical accounting policies from ACCOUNTING_DECISIONS.md.
- On Windows, every PowerShell helper script must collect output and **end with Set-Clipboard** for Ctrl+V reporting.
- Update CURRENT_STATE and DAILY_HANDOVER after approved checkpoints, keeping MASTER_ROADMAP and ACCOUNTING_DECISIONS stable unless the user approves changes.
- Keep Finance's 12 phases separate from Health, Spiritual, English/Growth and app-wide release work.
