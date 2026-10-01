# Four-step implementation — 1 October 2026

## Scope

- Keep the existing New Student button and creation workflow.
- Move login language controls into the top-right of the card; compact mobile header language to ব / E.
- Remove overview quick actions, simplify member labels, and show one current school balance alongside dues/payables. Daily and monthly income/expense remain.
- Align desktop/tablet list search and filters; preserve mobile controls. Student/teacher/helper cards use existing portraits, loaded only when visible and cached; groups have no portrait.
- Show Enrollment beside Students/Groups, with the existing view/manage permissions and enrollment page.
- Open existing ID card functionality inside the same Settings detail/back flow. Remove the separate Settings language panel. Load ID card content only when opened.
- Compact mobile portal header icons and profile identity layout.
- Replace the advance month boxes with a compact multiple-selection picker.
- Add admission, sports, exam, books/materials, ID card, event, and named custom fees with independent amounts, review, dues, payments, and receipt labels.

## Data and billing

Applied migrations: `20261001084635_fee_categories_and_active_student_guard.sql` and `20261001084848_keep_fee_guard_within_existing_read_permissions.sql`.

Existing charge/payment records are preserved. Existing charges default to monthly. The monthly uniqueness rule remains per student/month; other categories can coexist in that month. Both existing automatic generators use the monthly partial index and still generate only monthly fees for active students. The scheduler uses the school timezone, Asia/Dhaka.

A database insert/reassignment trigger rejects inactive students. Existing old dues can still receive payments after a student becomes inactive. The frontend also rechecks status immediately before review; the database covers status changes during review. Generated batches have unique request UUIDs retained during uncertain retries in session storage. Monthly duplicates and repeated request UUIDs are rejected server-side.

Student fee totals now read the complete ledger, deduct payments by charge, and include additional fee categories. The dashboard retains its initial monthly previous-due calculation when other categories exist. Receipts identify the paid fee category; custom names remain record values.

No paid service, new scheduled job, or new upload workflow was added.

## Validation

- All JavaScript syntax checks and `git diff --check` passed.
- Browser fixtures exercised 18 routes at 320, 390, 820, and 1440 px, including real Hind Siliguri fonts: 72 route states, no uncaught JavaScript errors or root horizontal overflow.
- 17 interaction checks passed: other-fee totals/batch/review/cancel, multiple months, stale inactive selection, historical inactive dues payment, login language positioning, overview changes, portrait placeholders and actual image decoding, group navigation, ID card Settings/back/language/frame sizing, portal icons, desktop filter heights/width/alignment, monthly/admission receipt labels, and permissions.
- Transactional database assertions passed for inactive insert rejection, same-month multiple categories, monthly uniqueness, sums, historical dues payments, scheduler compatibility, authenticated insert and generator permissions, request UUID uniqueness, and anonymous write denial. All test fixtures were rolled back; a final query found zero test students/charges remaining.
- Current production data contained no inactive student charges at inspection time. The previously reported occurrence could not be reconstructed from current status alone. No historical charges were deleted or rewritten.
- Security advisors found existing notices for two intentional permission-checked SECURITY DEFINER RPCs and disabled leaked-password protection. No new exposed privileged RPC was introduced.

Browser flows use synthetic records; they do not create real payments or enrollments. Publication is verified separately through the Pages deployment workflow.

## Recovery

Previous code is retained at `backup/four-step-20261001` (commit `6645f03`). The schema extension remains compatible with previous monthly-only inserts. Do not revert the schema by deleting additional fee records; their payments may reference them. Both migration definitions are kept in the repository.
