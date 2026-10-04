# Bengali ID-card glyph clearance

The original Hind Siliguri font reproduced clipping in the preview. Text ranges extended above their clipped line boxes: role 3px, name 3px, school heading 4px, and detail value 2px. The cause was compact 1.05–1.1 line heights together with overflow clipping.

Cards now carry `data-card-language`. A removable, Bengali-only CSS block provides sufficient line height for the role, name, school heading/address and detail rows. The fixed-height school header reclaims internal vertical padding so its three text lines still fit. The English rules, portrait card dimensions, photo dimensions, watermark, printing controls and data/permissions are unchanged.

Validation used the actual Hind Siliguri Regular/Bold font files and mocked profile data. Text ranges no longer extend above the line boxes. All 24 student/teacher/helper × Bengali/English × 390/1100px × screen/print cases passed; card size remains 54 × 85.6mm, photo 21 × 24mm, and details do not overlap the authority footer. A print PDF was generated and before/after rendered card images were inspected. No live student data was changed.

Rollback: `backup/id-card-before-bengali-spacing-20261004` at `c26b8ecf4e9bf1015651128937337583621120df`. Alternatively remove the final CSS block headed “Bengali glyph clearance”; the language attribute can remain harmlessly. Only ID-card files and this note are published.
