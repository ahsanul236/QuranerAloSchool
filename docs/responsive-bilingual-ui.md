# Responsive and bilingual UI — September 30, 2026

The redesign retains existing database permissions, record identifiers, financial formulas and original edit/save handlers. No database migration or paid service is required.

- Dashboard: compact daily/monthly income and expense, net/current balance, student dues, school payables, quick actions, attention counts and today's vouchers.
- Lists: compact mobile search/filter tools; card/table choices for students, groups, teachers and helpers; four shortcuts on larger screens; desktop detail preview; tablet filter wrapping.
- Profiles/portals: compact profile hero, plain read values, role-specific tabs, expandable teacher groups and explicit unmarked attendance.
- Forms: two-step student/guardian entry, optional details, searchable student selection and payment review. Payment submission locks until completion; the source handler validates the remaining charge balance.
- Settings: Bengali/English preference per signed-in user; language follows receipt links and ID card output. Interface text is translated locally; record fields and select values retain their original values.
- ID cards: permitted entity roles, name/ID search, selective or bulk print/save PDF, existing profile images with school logo fallback. Card contents/layout remain a basic starting format.
- Finance: full range reads avoid fixed-limit balance truncation; ledger pagination; desktop-only overview and voucher preview. Mobile keeps its relevant dues details without duplicating the general financial overview.

Validation: 24 page/view routes at 390, 820 and 1440 px (72 states), zero uncaught JavaScript errors and zero document overflow. Fixture-only interaction checks cover mobile filters/card view, student wizard, desktop preview, keyboard combobox selection, review cancellation, one payment insert, salary arithmetic, compact profile edit controls, unmarked attendance, account language persistence, bilingual receipts, ID printing and permission-denied/read-only states. A 1,237-row range test checks totals, uniqueness and read errors. No production test records were created.

To extend translations, add explicit UI string pairs in `ui-i18n.js`; keep names/IDs/amounts inside record containers or `data-no-translate`. New editable controls must use explicit option values. Preserve native elements/listeners when adapting an existing module. The ID card page uses existing view/manage permissions for each entity and existing document authorization for photos.
