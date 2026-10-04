# Portal layout and optional sections — 2026-10-04

Student, teacher and helper portals reuse their existing loaded data. Optional panels start hidden and are revealed only after successful results contain data. Student notes ignore whitespace-only content; upcoming classes retain the original cancelled/date filters. Payroll tabs follow payroll panel visibility and keyboard navigation skips hidden tabs. Documents, information, identity, attendance, guardian and assignments remain available.

The user requested a layout update alongside the conditional-visibility prompt: equal full-width desktop tabs, compact assigned-teacher rows, full-width enrollment/guardian/fee sections, and a fixed mobile navigation bar with SVG icons. The new stylesheet is loaded only by the three portals and scoped to their body class. Shared management CSS is untouched.

No schema, RLS, auth, query, payment, payroll, receipt, document or attendance logic changed. No additional query or paid dependency was added. Existing IDs remain intact. Remote main was inspected before editing; rollback branch: `backup/portal-before-20261004` at `bcbf74b7723110fe12e4be20ffa61d3975a2a0b5`.

## Validation

`tests/portal-layout.cjs` is a Playwright fixture smoke test (requires Playwright and a Chromium installation; no production data is written). Run `node tests/portal-layout.cjs`; optionally set `PORTAL_TEST_BROWSER`, `PORTAL_TEST_BROWSER_LIBS`, and `PORTAL_TEST_SCREENSHOTS`.

- 12 data/no-data × normal/admin-preview scenarios across three portals.
- All visible tabs at 320, 390, 820 and 1440px: equal widths and no document overflow; fixed mobile navigation.
- Core teacher, attendance, guardian, assignments and document panels; unchanged fee balance and receipt links; document edit/preview permissions and school WhatsApp URL.
- Teacher attendance edit mode and preview read-only behavior; keyboard tab navigation; no duplicate DOM IDs or JavaScript runtime errors.
- Injected failed fee query remains an error, rather than a successful empty portal.
- JavaScript syntax checks and diff whitespace checks.

These tests use mocked backend/documents responses; they do not claim live upload/payment/attendance writes were tested. Deployment and live asset checks use Vercel, which hosts this project, rather than GitHub Pages.
