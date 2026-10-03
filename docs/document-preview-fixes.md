# Certificate and portal preview fixes — 2026-10-03

Certificate number generation previously failed for authenticated users because the invoker function could not resolve private.qa_has_permission. The migration grants authenticated schema USAGE; existing function EXECUTE permissions, RLS policies and exposed schemas remain unchanged. Authenticated owner execution was verified for all three recipient roles in a rolled-back transaction.

Certificates now use one fixed A4 landscape sheet (297 × 210 mm). A scaled preview preserves its ratio on small screens. Recipient identity appears in the body; staff templates include the ID there. The school logo watermark is shared by the certificate and the existing portrait ID card. Long certificate text shrinks within limits, then disables printing and shows a warning if it still exceeds a page. No paid service or runtime dependency was added.

Manual-reference controls align with the rest of the form. Portal Preview search results participate in panel layout, and the desktop settings columns account for their gap. Student/Teacher/Helper badge centering overrides the shared span rule. Document printing overrides tablet navigation styles to keep navigation outside the PDF.

Validation: Chromium fixture-backed workflows covered role switching, recipient search, independent output/UI languages, issuing and reopening records, watermarks, reference height, settings search containment, centered badges, and responsive widths 320/390/820/1440. PDF inspection confirmed a single A4 landscape page and no navigation text. Tests used synthetic people; no live certificate record was created.
