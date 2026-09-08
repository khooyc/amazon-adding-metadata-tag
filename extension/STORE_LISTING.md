# Chrome Web Store listing draft

## Name

Amazon Metadata Tag — Local Review

## Short description

Detect people locally, review images, and add and verify the synthetic-performer XMP keyword in JPEG and PNG copies.

## Detailed description

Amazon Metadata Tag — Local Review is an independent workflow helper for image teams preparing marketplace media.

Drop JPEG or PNG files into the extension workspace, run bundled local face and body detection, review the recommendations, and choose which images should receive `contains-synthetic-performer` in XMP `dc:subject`. The extension reads the generated metadata again before reporting the output as verified.

Images and detection results stay on the device. The extension has no account system, analytics, backend, external model requests, content scripts, or access to websites you visit. It requests the Downloads permission only to save processed copies.

People detection is advisory. It cannot determine whether a person is AI-generated, and the user remains responsible for reviewing every decision and the latest applicable marketplace requirements.

This extension is independent and is not affiliated with or endorsed by Amazon.

## Permission justification

`downloads`: Saves the JPEG or PNG copy after the exact XMP keyword has been written and verified. Existing filenames are handled with Chrome's `uniquify` conflict behavior.

## Single purpose

Locally assist human review and verified XMP tagging of marketplace JPEG and PNG images.

## Privacy disclosure

No user data is collected, transmitted, sold, or used for advertising. Media processing occurs locally in the extension page.
