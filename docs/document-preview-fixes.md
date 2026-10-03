# Certificate and portal preview fixes — 2026-10-03

Certificate number generation previously failed for authenticated users because the invoker function could not resolve private.qa_has_permission. The migration grants authenticated schema USAGE; existing function EXECUTE permissions, RLS policies and exposed schemas remain unchanged. Authenticated owner execution was verified for all three recipient roles in a rolled-back transaction.

Certificates now use one fixed A4 landscape sheet (297 × 210 mm). A scaled preview preserves its ratio on small screens. Recipient identity appears in the body; staff templates include the ID there. The school logo watermark is shared by the certificate and the existing portrait ID card. Long certificate text shrinks within limits, then disables printing and shows a warning if it still exceeds a page. No paid service or runtime dependency was added.

Manual-reference controls align with the rest of the form. Portal Preview search results participate in panel layout, and the desktop settings columns account for their gap. Student/Teacher/Helper badge centering overrides the shared span rule. Document printing overrides tablet navigation styles to keep navigation outside the PDF.

Validation: Chromium fixture-backed workflows covered role switching, recipient search, independent output/UI languages, issuing and reopening records, watermarks, reference height, settings search containment, centered badges, and responsive widths 320/390/820/1440. PDF inspection confirmed a single A4 landscape page and no navigation text. Tests used synthetic people; no live certificate record was created.

## Watermark refinement

Replaced the 128-pixel watermark source with the supplied original 1254 × 1254 PNG, copied byte-for-byte. The separate asset is used only for document watermarks. Certificates measure the header and signature rules to define the watermark's vertical area; ID cards start the area immediately below the fixed portrait and end it before the authority footer. The logo retains its aspect ratio; only the original outer white padding is excluded by the display container.

Chromium checks verified both vertical boundaries, high-resolution source loading, certificate ratios at 320/390/820/1440, and unchanged portrait ID dimensions. PDF inspection confirmed one landscape A4 certificate page and one portrait A4 ID sheet.

## Centered content and page margins

The title and body now form one flex block centered between the certificate metadata and the signature rule. Short and longer text receive equal upper/lower spacing. Overflow checks measure the available content area before allowing printing. The A4 sheet remains 297 × 210 mm; the original double border is inset 10 mm on all four sides, including the preview. Header, metadata, footer and watermark continue to follow their existing document roles.

Validation: short and longer text centering and 10 mm CSS border insets at 320/390/820/1440; role/search/language/record regression flows; watermark anchor checks; excessive-text print protection; single-page A4 PDF. PDF vector inspection measured border margins approximately 10 mm (rounding within 0.15 mm).
