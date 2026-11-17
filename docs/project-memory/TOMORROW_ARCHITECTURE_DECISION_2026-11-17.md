# TomorrowApp — Evolving UI Architecture & Coming Up Concept

**Recorded:** 2026-11-17  
**Status:** AGREED CONCEPT / WORKING DESIGN — not approved for code implementation  
**Purpose:** Preserve design decisions for later review without interrupting current implementation phases.

## Clean landing screen

- The app opens to a **minimal, uncluttered landing screen**, not an automatically expanded Coming Up list.
- A distinctive **central tappable symbol** opens Coming Up **on demand**. Flower, star, and heart are visual candidates; the final icon has not been chosen.
- No automatic preview of Finance, Health, Life, or Growth records on the landing screen.
- The four independent destinations remain easy to open: **Tomorrow Life, Tomorrow Finance, Tomorrow Health, Tomorrow Growth**.
- The exact navigation arrangement and visual styling remain open for later discussion.

## Coming Up — on-demand cross-module view

- When the central symbol is tapped, Coming Up displays dated items from all four sections, with links to each item's original record.
- Time-range choices under consideration and agreed in principle: **Daily, Weekly, Monthly, 3 Months**. Exact date boundaries and default selection are not yet fixed.
- Potential sources: Finance obligations; Health appointments and scheduled treatments; Life vehicle maintenance/renewals, spiritual and personal reminders; Growth course deadlines and goals, when dates exist.
- Preserve a single source of truth: Coming Up references records owned by their respective modules; it does not duplicate or independently modify them.
- Optional future ideas (not yet approved): overdue section, source filters, action-needed grouping, notification dot, detailed notification behavior.

## Four sections

1. **Tomorrow Life:** existing Spiritual features, vehicles, personal life reminders and renewals.
2. **Tomorrow Finance:** existing financial records, reports, statements and planning; Finance remains the authoritative owner of financial data.
3. **Tomorrow Health:** health, fitness, nutrition, appointments and medication schedules.
4. **Tomorrow Growth:** expansion of the existing English area while preserving its content/data; possible additional languages, courses, skills/projects, books, goals, habits and notes.

## Guardrails

- `postingAllowed=false` remains unchanged; no automatic financial deductions or posting.
- No inferred medication doses or automatic prescription changes.
- Keep existing user data and navigation compatibility during any future migration.
- Do not renumber the established 12-phase roadmap, merge to main, or touch unrelated Phase 9/Finance work.
- This document records a **living concept**, not authorization to modify app code or routes.

## Working process

- Discuss ideas gradually over days. Record explicit agreements; distinguish proposals from approved concepts.
- Add, revise or remove design elements whenever the user requests.
- Resume the currently active implementation task separately. Before any implementation of this new architecture, review the latest source files and agree a scoped plan.
- The local Windows checkout and `docs/project-memory/TOMORROW_RESUME_2026-11-13.md` have **not** been modified by this document. Integrate this dated note there only when access and approval permit.
