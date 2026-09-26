# Smart Monthly Fee Automation — Implementation Blueprint

Status: PLANNED ONLY — no production schema/data/behavior changes made by this document.
Prepared: 2026-09-26

## Goal
Add a per-student editable Monthly Fee, automatically create monthly dues for active students, keep Receive Fee Payment as the collection path, and retain Generate Fee Payment for advance/manual multi-month charges.

## Confirmed current foundation
- qa_students currently has no monthly_fee column.
- qa_fee_charges already stores a per-month amount snapshot.
- UNIQUE(student_id, billing_month) already prevents duplicate monthly charges.
- qa_fee_payments already links payments to a charge and generates receipt_no server-side.
- qa_fee_payment_sync recalculates charge status after payment insert/update/delete.
- Existing payment insert also triggers the fee voucher workflow.
- Existing RLS permissions include students.manage, fees.manage/view and payments.manage/view.
- Current Fees UI is payment-first tabs: Receive Fee Payment | Generate Fee Payment.

## Business rules
1. Monthly Fee is stored on each student and is editable by authorized admin.
2. Only status=active students participate in automatic generation.
3. Automatic generation starts from the next eligible billing month; it must never backfill historical months silently.
4. Each generated qa_fee_charges row snapshots the fee amount at generation time. Later Monthly Fee edits do not rewrite old charges.
5. Exactly one charge per student per billing month.
6. Inactive/graduated/suspended/withdrawn students get no new automatic charges; existing dues remain.
7. A charge is a receivable/due, not income.
8. Income/cash recognition happens only when a qa_fee_payments row is actually created.
9. Partial payments remain supported.
10. Generate Fee Payment remains available for manual/advance generation and supports selecting multiple future months.
11. Multi-month generation creates one independent charge per month, not one combined charge, so receipts, dues and history remain month-specific.
12. Existing charge for a selected month is skipped/reported, never duplicated.
13. Advance workflow: generate future month charge(s) first, then collect payment against those charges.
14. Existing receipts, voucher automation and permissions must remain intact.

## Proposed schema migration
Add to public.qa_students:
- monthly_fee numeric(12,2) NOT NULL DEFAULT 0
- CHECK monthly_fee >= 0

Optional audit metadata only if needed after review:
- monthly_fee_updated_at timestamptz
Do not add unless required.

No destructive changes to qa_fee_charges or qa_fee_payments.

## Automatic generator
Create an idempotent server-side function, conceptually:
qa_generate_monthly_fees(target_month date)

Behavior:
- normalize target_month to first day of month
- select active students with monthly_fee > 0
- respect admission_date (do not generate before student admission)
- insert charge with expected_amount=monthly_fee, discount=0, previous_due=0, current_payable=monthly_fee
- ON CONFLICT(student_id,billing_month) DO NOTHING
- return counts: eligible, created, skipped, zero_fee
- SECURITY DEFINER with locked search_path and explicit authorization for manual invocation

Scheduling:
- Prefer Supabase-native scheduled execution if available/approved.
- Run once monthly, suggested first day of month in school timezone.
- Function is idempotent, so retry is safe.
- Before enabling schedule, test manual invocation in controlled mode.

Important date rule:
New student entry should not unexpectedly create the current month's bill. Automatic schedule creates the next normal month. If current month needs billing, admin uses Generate Fee Payment.

## Student UI
New Student form:
- add Monthly Fee (৳), numeric >= 0
- place with basic student information
- save it with student creation

Student Profile:
- show Monthly Fee
- editable only in existing students.manage edit mode
- editing monthly fee affects future generated charges only
- helper text: previous/generated bills will not change

Student list:
- no new visible column initially, to keep list compact
- can be added later through Columns if requested

## Fees UI
Keep existing tabs in current order:
1. Receive Fee Payment (default)
2. Generate Fee Payment

### Receive Fee Payment
Recommended improvement:
- Student selector first
- show that student's open/partial dues by month
- support selecting one or multiple dues
- show selected total
- preserve payment method/date/reference/notes
- payment processing must remain transactionally safe
- if multiple charges are paid in one action, decide receipt model before implementation:
  Preferred: one collection action with allocations per charge and a coherent receipt. If this requires schema expansion, phase it separately.
  Safe Phase-1 fallback: keep one charge per payment exactly as today.

### Generate Fee Payment
Repurpose for advance/manual charge generation:
- Student
- Month(s) multi-select
- Monthly Fee auto-filled from student
- allow authorized override only if existing business need remains
- selected month count
- total preview
- generate button
- each selected month creates a separate qa_fee_charges row
- existing months displayed as Already generated and not duplicated
- future months allowed
- current month allowed for late enrollment/manual setup

Remove Previous Due from generation math for new workflow: old dues already exist as their own charge rows and must not be rolled into a new month's charge. This prevents double counting.
Discount can remain per generated charge only if business still needs it.

## Dues presentation
Add a compact Student Dues view, preferably within Fees or student profile:
- Total Due
- Open/Partial months
- Month, Payable, Paid, Remaining, Status
Do not restore the old global Fee Ledger table unless needed; dues should be contextual and actionable.

Student portal can later show own dues using existing RLS-compatible fee charge/payment access, but this is Phase 2 unless explicitly requested.

## Income/accounting rule
Do NOT create income when a charge is generated.
A charge increases receivable/due only.
Actual payment is the income event.

Existing qa_fee_payments triggers must be preserved:
- qa_fee_payment_sync
- qa_fee_payment_auto_voucher
Before adding any direct qa_finance_transactions integration, verify whether the existing voucher/accounting pipeline already represents fee income to avoid double-posting.

## Migration/backfill strategy
1. Add monthly_fee default 0; existing students remain safe.
2. Admin fills Monthly Fee for existing active students.
3. No historical charges auto-created.
4. Preview eligible students and amounts before first automatic run.
5. Enable monthly schedule only after preview validation.
6. First automated month starts after explicit owner approval.

## Security
- Preserve current RLS.
- monthly_fee updates inherit students.manage policy.
- automatic function must not be directly exploitable by normal authenticated users.
- scheduled execution uses trusted server/service context.
- no service key in frontend.
- manual bulk generator requires fees.manage.
- preserve unique constraint and database checks.

## Implementation phases
Phase 0 — backup/read-only verification
- capture schema/function/policy definitions relevant to Students/Fees/Payments
- confirm current deployment healthy

Phase 1 — schema + student monthly fee
- migration monthly_fee
- New Student field/save
- Student Profile view/edit
- regression test student create/edit

Phase 2 — manual multi-month Generate Fee Payment
- multi-month UI
- server-side/batched idempotent generation
- duplicate handling
- amount snapshot behavior
- regression test existing fee/payment/receipt flow

Phase 3 — automatic monthly generation
- idempotent generator function
- dry-run/preview query
- manual controlled run
- scheduler only after owner approval
- logging/result counts

Phase 4 — dues UX
- student-focused dues summary
- open/partial month display
- optional student portal dues view if approved

Phase 5 — payment UX enhancement
- student-first due selection
- only implement multi-due single checkout after receipt/allocation model is explicitly approved

Phase 6 — accounting verification
- verify payment → voucher/income reporting path
- ensure no duplicate income posting
- test partial payment and reversals/updates if supported

## Acceptance tests
- new active student can save monthly fee
- monthly fee edit does not mutate historical charges
- inactive student receives no auto charge
- zero-fee active student is skipped
- active student gets exactly one charge for target month
- rerunning generator creates zero duplicates
- admission date after target month prevents invalid charge
- multi-month manual generation creates one row/month
- existing month is safely skipped
- partial payment updates remaining/status correctly
- full payment changes charge to paid
- payment still generates receipt number
- existing voucher trigger still fires exactly once
- charge generation alone does not create income
- permissions/RLS unchanged for unauthorized users
- mobile layout remains usable

## Rollback strategy
- UI commits are independently revertible.
- Scheduler can be disabled without deleting charges.
- Generator is additive/idempotent.
- monthly_fee column should not be dropped during normal rollback; disabling UI/automation is safer.
- Never delete generated financial records as rollback. Correct/waive them through an auditable process if needed.

## Explicit approvals required during implementation
Stop and ask owner before:
1. applying production DB schema migration,
2. creating/enabling scheduled monthly job,
3. changing RLS/policies,
4. introducing a new multi-charge receipt/allocation schema,
5. altering existing voucher/income accounting behavior.

## Start command for next session
User can say: “Smart Monthly Fee plan শুরু করুন”
Then begin with Phase 0 verification and Phase 1 migration proposal. Do not skip approval gates.
