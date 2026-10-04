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

## Mobile More menu and management-style shell

The follow-up update opens Information by default in all three portals. Desktop tab ordering stays as before. Mobile ordering is:

- Student: Information, Classes, Summary, Fees, More (Documents and the existing Sign out control).
- Teacher: Information, My Students, My Groups, Summary, More (Payroll, Documents and the existing Sign out control).
- Helper: Information, Summary, Payroll, More (Documents and the existing Sign out control).

Empty payroll behavior is retained. The existing WhatsApp node moves beside the profile name on mobile; the original sign-out node moves into the sheet. They return to the header above 620px. No event handler or backend action is replaced. The logo is centered above the school name on mobile; the language switch remains at the top right. SVG line icons use the management palette, active green icon blocks, rounded shell, and More-sheet presentation.

Scroll thresholds match `management-nav.js`: hide when moving down more than 9px beyond 120px; show near the top or when moving up more than 7px. An open More menu prevents hiding. Escape, backdrop, close button, focus return and dialog keyboard trapping are supported; reduced-motion settings disable bar animation.

The fixture browser tests additionally cover the exact mobile order, initial Information, centered logo, WhatsApp relocation, visible sign-out label inside More, payroll visibility, selecting overflow panes, desktop restoration, scroll hide/show, and normal sign-out versus read-only preview exit. No real account was signed out by these tests. Rollback branch: `backup/portal-before-mobile-more-20261004` at `46a69b03c96eab61181a2d72fddfaa79220180b7`.

## Compact header and clear WhatsApp icon

The mobile header was reduced from 126px to the management shell's 88px. Centered branding now uses the same 46px logo, 14px school name, 3px gap and 8px vertical padding. The profile WhatsApp control now uses the exact filled SVG path from the management student profile, without the previous hand-drawn stroke. Existing WhatsApp URL, control ID, placement, language switch, More menu and scroll behavior are preserved. Desktop CSS is unchanged.

The 12-scenario portal smoke test also verifies the 88px mobile header and filled/non-stroked WhatsApp SVG at 320px and 390px. Rollback branch: `backup/portal-before-header-icon-20261004` at `05c1129a520b32a7f22ffd121adae930754d4439`.
