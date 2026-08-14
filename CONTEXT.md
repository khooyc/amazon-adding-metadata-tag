# Amazon Media Compliance

This context defines how media is classified and prepared for Amazon's synthetic-performer disclosure requirement.

## Language

**Synthetic Performer**:
A photorealistic AI-generated person whose presence requires the Amazon keyword `contains-synthetic-performer`. Real people, including those altered with AI tools, and non-photorealistic people are excluded under Amazon's stated rule.
_Avoid_: AI person, fake person

**Classification Recommendation**:
A computer-vision assessment from an optional local module suggesting whether a media file contains a Synthetic Performer; it is advisory and cannot authorize tagging by itself. The review workflow remains complete without this recommendation.
_Avoid_: Final result, automatic approval

**Tag Decision**:
The human-approved determination of whether a media file contains a Synthetic Performer and therefore requires the Amazon keyword.
_Avoid_: AI decision, prediction

**Tag Correction**:
A separately confirmed human decision to remove an existing `contains-synthetic-performer` keyword; rejecting a Classification Recommendation is not a Tag Correction.
_Avoid_: Rejection, automatic cleanup

**Verified Tag**:
The exact `contains-synthetic-performer` keyword is present in the local file's XMP `dc:subject` field when re-read after writing. It does not indicate that the file was uploaded to or accepted by Amazon.
_Avoid_: Amazon verified, uploaded, submitted

**Media Library**:
The local collection of master images and videos used for Amazon listings, including unorganized and duplicate files.
_Avoid_: Amazon media, upload folder

**Published Media**:
A copy of a media file currently used in an Amazon listing; the Media Library remains the source of truth.
_Avoid_: Master file, original

**Media Set**:
All master images and videos associated with one Seller SKU, regardless of marketplace, media role, or version.
_Avoid_: ASIN folder, product images

**Image Review Batch**:
A human-review group containing still images for one Seller SKU; reviewers may approve selected files together and deselect unrelated files before deciding. Videos are reviewed fully and tagged manually outside this batch.
_Avoid_: Automatic batch approval, folder approval

**Exact Duplicate**:
An image whose file contents are byte-for-byte identical to another image; one Tag Decision may apply to all copies.
_Avoid_: Similar image, variant

**Visual Variant**:
A resized, cropped, recompressed, or edited version of another image; it may be grouped for review but requires explicit human selection.
_Avoid_: Exact duplicate

**Visual Match Dismissal**:
A human decision that a visually similar image is not a duplicate; the decision follows the image content fingerprint until that content changes. Exact Duplicates cannot be dismissed.
_Avoid_: Delete duplicate, ignore exact copy
