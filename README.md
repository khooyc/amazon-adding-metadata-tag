<p align="center"><img src="build/icon.png" alt="Maviet Supplies logo" width="128"></p>

# Amazon - Adding Metadata Tag

Created by [khooyc](https://github.com/khooyc) on GitHub.

## Human Verification Required

This tool may make mistakes. Always review your files, check the latest applicable Amazon requirements, and confirm that any required XMP metadata or tag is present in the final file before uploading or submitting it.

See [Software Licence & Disclaimer](SOFTWARE_LICENCE_AND_DISCLAIMER.md) for the full terms. This independent tool is not endorsed by, sponsored by, or affiliated with Amazon.

## What is preserved on GitHub

The repository preserves the application source code, documentation, legal disclaimer, logo assets, tests, and macOS build workflow. Published Windows and macOS installers are kept in the [Releases](https://github.com/khooyc/amazon-adding-metadata-tag/releases) section, so they remain available even if the local project folder is removed.

Your media files, local review decisions, safety backups, and app settings are intentionally not uploaded. They stay on the computer where you use the app.

## Languages, appearance, and onboarding

- Interface languages: English, Simplified Chinese, and Traditional Chinese.
- Appearance: light, dark, or automatic system theme.
- New users receive a five-step quick-start tutorial.
- Language, theme, and tutorial choices are stored only in the local app profile.

A private, human-first Windows and macOS desktop app for preparing local Amazon listing images that contain photorealistic AI-generated people. It adds the exact keyword `contains-synthetic-performer` to XMP `dc:subject`, then re-reads that explicit field before reporting the local file as verified.

## Safe workflow

1. Organize media under `Media Library\Seller-SKU\...`.
2. Open the app, choose that Media Library folder, and press **Scan**. No background monitoring occurs.
3. Review the untagged images for one Seller SKU. Click anywhere on an image card to select or deselect it, then choose **Add tag & verify** or **No tag needed**. **Show in folder** never changes the selection.
4. Upload the prepared files to Seller Central manually. The app does not log in to Amazon or claim an upload succeeded.

Use **Select visible** for the current Seller SKU/search result, or **Select all media** to select the complete current queue across every Seller SKU. In **Duplicates & visual variants**, select a false visual match and choose **Not a duplicate** to remember that decision by content fingerprint; byte-for-byte exact duplicates cannot be dismissed.

Long operations show measured progress from 0% to 100%, with the current stage and file count. Unicode filenames (including Chinese characters) and UNC network-share paths are passed to ExifTool through a UTF-8-safe argument channel.

Videos appear under **Other files** and remain a full-human-watch/manual-tag workflow.

## What “verified locally” means

The app creates a private local safety backup before the first mutation, appends the keyword without replacing other subjects, and reads XMP `dc:subject` again. A file is successful only if the exact keyword is present after that re-read. This status does not mean Amazon received or accepted the file.

## Safety and privacy

- Media stays on this computer; there are no network or cloud AI integrations.
- The renderer has no direct filesystem access and may act only within the folder selected during this app session.
- Existing valid tags count as prior approval and remain outside the default review queue.
- **No tag needed** decisions are saved by content fingerprint. Changed content returns to review.
- Tag removal is a separately confirmed correction.
- File deletion uses the Windows Recycle Bin or macOS Trash only.
- Safety backups are eligible for manual cleanup after 30 days and are never deleted automatically.
- Videos, unsupported files, files without a Seller SKU folder, and metadata warnings are surfaced instead of silently skipped.

## Supported still-image formats

JPEG/JPG, PNG, TIFF/TIF, and WebP.

## Development

```shell
npm install
node node_modules/electron/install.js
npm test
npm start
npm run dist:win
npm run dist:mac -- --arm64
```

The packaged application bundles ExifTool 13.59 through pinned platform-specific `exiftool-vendored` packages. Windows releases use an NSIS `.exe`; macOS releases provide separate `.dmg` files for Apple Silicon (`arm64`) and Intel (`x64`). Native macOS artifacts are built and tested on GitHub-hosted macOS runners.

## First launch on macOS

The free Mac build is not Apple Developer ID signed or notarized. This is why macOS may show a warning saying that Apple cannot verify the developer or that the app cannot be opened. The warning is expected for this unsigned release; it does not mean the app requires an Apple Developer account to run.

To open it safely:

1. Download the `.dmg` from this repository’s [Releases page](https://github.com/khooyc/amazon-adding-metadata-tag/releases). Choose `arm64` for Apple Silicon (M1 or newer) or `x64` for Intel.
2. Open the `.dmg` and drag **Amazon - Adding Metadata Tag** into **Applications**.
3. Open **Applications**, then Control-click the app and choose **Open**.
4. In the confirmation dialog, choose **Open** again.
5. If macOS still blocks it, open **System Settings → Privacy & Security**, find the message about the blocked app, and select **Open Anyway**.

You normally need to approve only the first launch of each newly downloaded version. Do not disable Gatekeeper globally or run unfamiliar commands from third-party websites. Review the release notes and checksum before installing.
