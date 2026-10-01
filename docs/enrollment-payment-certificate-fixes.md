# Enrollment, payment and document corrections — 2026-10-01

Enrollment now lives inside the Students workspace, sharing its authenticated client and loading once on demand. Students, Groups and Enrollment form the first tab row; Teachers and Helpers form the second. Staff uses the reverse grouping. Old enrollment URLs redirect to the embedded tab. The existing enrollment form is collapsible and the list stays visible.

Receive Payment supports multiple outstanding charges belonging to one selected student, including separate partial allocations. Confirmation shows all selected fees. An invoker RPC writes the batch atomically, returns existing rows on an identical retry, and produces a combined receipt view while preserving individual ledger receipts and automatic vouchers. A private guarded trigger locks each charge, validates student identity and rejects overpayment. The RPC runs under existing RLS. Anonymous execution is revoked. Previously created dues for inactive students remain payable.

The mobile management language switch sits outside the hidden header-actions container. ID-card output language is independent of site preference. Name/ID suggestions select a person; school contact details sit beside the logo, the role title sits above the portrait and the bottom provides an authority signature area.

Certificates are a lightweight Settings pane using existing profile data, editable draft text and browser Print/Save PDF. Common student certificates and teacher/helper experience, character, participation and appreciation certificates are available. It adds no paid service or certificate storage. A4 landscape is the initial print layout; final designs remain adjustable.

## Validation

- Browser fixture flows verified same-document enrollment switching and saving, tab grouping, mobile language visibility, independent ID-card locale, suggestions, certificate preview and Settings back navigation.
- Same-student multi-fee selection, partial allocations, grouped receipt link and old inactive-student dues were checked with fixture data.
- Main affected routes passed horizontal-overflow and JavaScript checks at 320, 390, 820 and 1440 pixels.
- SQL tests ran inside rolled-back transactions: exact totals, partial/paid states, idempotent retry, failed batch atomic rollback, wrong-student rejection, inactive historical payments and anonymous denial. The suite also passed as the authenticated role under RLS after removing an inaccessible private-schema call from the invoker RPC.
- The production migration is recorded as `20261001105257_batch_fee_payments`. Its public RPC is SECURITY INVOKER, not executable by anon, and executable by authenticated. Security advisors introduced no new findings.
- Browser fixtures do not constitute real-account end-to-end payment testing; no real student payment was created during QA.


### Student-wide balances on fee receipts

Single-payment and grouped receipts keep the balance for their selected fee(s), and also show the student's current outstanding balance across every issued fee and payment. Both ledgers use `readAll` pagination so Supabase page limits do not truncate the total. Confirmed against QAS-26-008: October monthly charge ৳500, paid ৳250, remaining ৳250; the last batch settled the separate admission and transport fees; student-wide due remains ৳250.
