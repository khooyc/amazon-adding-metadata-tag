# Amazon Metadata Tag — Chrome extension

This Manifest V3 extension runs locally and requests only the `downloads` permission. It has no content scripts, host permissions, remote code, backend, analytics, or image-upload endpoint.

## Local test installation

1. Run `npm run extension:build` from the project root.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select the generated `extension-dist` folder.
5. Pin the extension if desired, then click its toolbar icon to open the workspace.

## Chrome Web Store publication status

The version 1.6.4 store package is ready at `dist/Amazon-Metadata-Tag-Chrome-Extension-v1.6.4.zip`, but public submission is postponed. The publisher account has reached its current three-extension limit. Google does not publish a guaranteed engagement threshold for increasing that limit; it evaluates genuine sustained usage of existing extensions, extension quality, and publisher-account tenure and activity.

After the existing extensions gain genuine users and the publisher limit is increased, upload the ZIP through the Chrome Web Store Developer Dashboard. Do not upload the complete project or `node_modules`. The dashboard may allow the item to be saved as a draft before another submission slot becomes available, but it cannot be submitted for review while the limit is reached.

The extension supports JPEG and PNG. TIFF, WebP, videos, compressed PNG XMP, and extended JPEG XMP remain desktop-app workflows. Person detection is advisory and does not determine whether an image is AI-generated.
