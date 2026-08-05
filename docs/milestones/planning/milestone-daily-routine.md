# Milestone Daily Routine

This is the repeatable procedure for every single day/milestone. Follow it in order.

---

## START OF DAY (Before Coding)

- [ ] Open `C:\BSCS\SP\SP2\AI briefing document.txt`
- [ ] Update the **TODAY'S GOAL** section with the current milestone number and goal (copy from the week brief)
- [ ] Check `docs/milestones/week{N}-daily-brief.md` for today's deliverables
- [ ] Check `../reports/README.md` to confirm what is already complete
- [ ] Confirm both dev servers start clean:
  - `cd server && npm run dev` → check port 4000
  - `cd client && npm run dev` → check port 5173

---

## DURING DEVELOPMENT

- [ ] Follow naming conventions in `../../architecture/PROJECT-ORGANIZATION.md`
- [ ] Update `../../../server/docs/swagger.json` as you add/modify API endpoints (don't leave it until the end)
- [ ] Keep Tailwind v4 CSS-first — use `@theme` and utility classes, no `tailwind.config.js` overrides
- [ ] All file uploads through `../../../server/utils/cloudinary.js`
- [ ] All emails through Resend (`RESEND_API_KEY`, verified `RESEND_FROM_EMAIL` / domain)

---

## END OF MILESTONE (Sync & Seal)

Run the full Sync & Seal from `../../development/milestone-sync-seal.md`. Quick checklist:

- [ ] **Test script** created at `tests/milestone-{N}-{kebab-case}.js`
- [ ] Test script runs and all scenarios pass (or failures are noted with reason)
- [ ] **Completion report** created at `reports/MILESTONE-{N}-COMPLETION-REPORT.md`
- [ ] `../../tests/milestone_tests/README.md` updated with new test entry
- [ ] `../reports/README.md` updated with new report entry
- [ ] `../../architecture/PROJECT-ORGANIZATION.md` updated if directory structure changed
- [ ] Root `../../../package.json` has new `test:milestone-{N}` script
- [ ] `../../../server/docs/swagger.json` updated if API changed
- [ ] `docs/milestones/week{N}-daily-brief.md` — mark milestone as ✅ Complete

---

## AFTER MILESTONE (Commit)

- [ ] Stage all changes
- [ ] Commit using this format:
  ```
  feat(milestone-{N}): complete {milestone-name}

  - Add Milestone {N} completion report and verification test
  - Document {key-feature-1}, {key-feature-2}
  - Update project documentation and test scripts

  All {N} milestones now documented and verified.
  ```
- [ ] Push to `main`

---

## DOC DRIFT QUICK CHECK

If docs feel out of sync with the actual codebase, run this mental check:

| Doc | Stale signal |
|-----|-------------|
| `../../architecture/PROJECT-ORGANIZATION.md` | Lists files that don't exist, or missing new files |
| `../reports/README.md` | Missing the latest milestone entry |
| `../../../server/docs/swagger.json` | Missing endpoints that exist in `../../../server/routes` |
| `AI briefing document.txt` | TODAY'S GOAL still shows a completed milestone |
| `docs/milestones/week{N}-daily-brief.md` | Status column not updated |

If any of the above are stale, fix them before starting new milestone work.
