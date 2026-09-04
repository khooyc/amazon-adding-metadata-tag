<p align="center"><img src="build/icon.png" alt="Maviet Supplies logo" width="128"></p>

# Amazon - Adding Metadata Tag

Created by [khooyc](https://github.com/khooyc) on GitHub.

## Download and install

### Windows — recommended

[**Download the Windows installer**](https://github.com/khooyc/amazon-adding-metadata-tag/releases/latest/download/Amazon-Adding-Metadata-Tag-Windows-Setup.exe)

1. Click the download link above. You do not need Node.js, npm, or any separate tools.
2. Open `Amazon-Adding-Metadata-Tag-Windows-Setup.exe` after it downloads.
3. The one-click installer installs the app for your Windows account, creates Desktop and Start menu shortcuts, and opens the app.
4. If Windows SmartScreen appears, first confirm that the publisher download address starts with `https://github.com/khooyc/amazon-adding-metadata-tag/`. Then choose **More info → Run anyway**. The free installer is not currently code-signed, so this warning can appear even for an unchanged official release.

For checksums, release notes, and previous versions, use the [official Releases page](https://github.com/khooyc/amazon-adding-metadata-tag/releases/latest). Do not download installers reposted by third-party websites.

### macOS

- [**Download for Apple Silicon (M1 or newer)**](https://github.com/khooyc/amazon-adding-metadata-tag/releases/latest/download/Amazon-Adding-Metadata-Tag-mac-arm64.dmg)
- [**Download for Intel Mac**](https://github.com/khooyc/amazon-adding-metadata-tag/releases/latest/download/Amazon-Adding-Metadata-Tag-mac-x64.dmg)

Open the `.dmg`, drag the app to **Applications**, then follow the [first-launch instructions](#first-launch-on-macos). No separate dependencies are required.

### How it works

1. Choose the local folder containing your listing images and videos, then press **Scan**.
2. Optionally press **Detect people** to create a faster review queue. Detection runs locally and does not upload media.
3. Review each item and choose **Add tag & verify** or **No tag needed**. Watch videos fully before deciding.
4. The app creates a safety backup before changing a file, writes `contains-synthetic-performer` to XMP `dc:subject`, then reads that field again before reporting success.
5. Upload the verified files to Seller Central yourself. The app never logs in to Amazon or uploads on your behalf.

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
- Optional local face and body detection creates an advisory **People detected** queue without uploading images or authorizing tags.

A private, human-first Windows and macOS desktop app for preparing local Amazon listing images and videos that contain photorealistic AI-generated people. It adds the exact keyword `contains-synthetic-performer` to XMP `dc:subject`, then re-reads that explicit field before reporting the local file as verified.

## Safe workflow

1. Choose any media folder. Seller SKU subfolders are optional; media placed directly in the selected folder remains reviewable.
2. Open the app, choose that Media Library folder, and press **Scan**. No background monitoring occurs.
3. Optionally press **Detect people**. Each unique untagged image is analyzed once on this computer, exact copies reuse the cached result, and likely matches appear under **People detected**.
4. Review the untagged media. Click anywhere on a card to select or deselect it, then choose **Add tag & verify** or **No tag needed**. Watch every video fully before deciding. **Show in folder** never changes the selection.
5. Upload the prepared files to Seller Central manually. The app does not log in to Amazon or claim an upload succeeded.

Use **Select visible** for the current Seller SKU/search result, or **Select all media** to select the complete current queue across every Seller SKU. In **Duplicates & visual variants**, select a false visual match and choose **Not a duplicate** to remember that decision by content fingerprint; byte-for-byte exact duplicates cannot be dismissed.

Long operations show measured progress from 0% to 100%, with the current stage and file count. Unicode filenames (including Chinese characters) and UNC network-share paths are passed to ExifTool through a UTF-8-safe argument channel.

Supported videos appear in the main review queue with a full-watch warning. Safe containers can be tagged directly; unsupported video containers remain reviewable but must be converted or remuxed before embedded XMP writing.

Face/body detection only prioritizes review. It cannot determine whether a detected person is synthetic or photorealistic, and a missed detection does not mean that no person is present.

## What “verified locally” means

The app creates a private local safety backup before the first mutation, appends the keyword without replacing other subjects, and reads XMP `dc:subject` again. A file is successful only if the exact keyword is present after that re-read. This status does not mean Amazon received or accepted the file.

## Safety and privacy

- Media and AI detection stay on this computer; no image or video is uploaded for detection. The existing update checker contacts only this project’s GitHub Releases endpoint.
- The renderer has no direct filesystem access and may act only within the folder selected during this app session.
- Existing valid tags count as prior approval and remain outside the default review queue.
- **No tag needed** decisions are saved by content fingerprint. Changed content returns to review.
- Tag removal is a separately confirmed correction.
- File deletion uses the Windows Recycle Bin or macOS Trash only.
- Safety backups are eligible for manual cleanup after 30 days and are never deleted automatically.
- Unsupported files and metadata warnings are surfaced instead of silently skipped; Seller SKU folders are optional.

## Supported still-image formats

JPEG/JPG, PNG, TIFF/TIF, and WebP.

## Supported video formats

Videos are reviewable in 360, 3G2/3GP, ASF, AVI, F4V, FLV, LRV, M2TS, M4V, MKV, MOV, MP4, MPEG/MPG, MQV, MTS, MXF, OGV, QT, RM/RMVB, TS, VOB, WebM, and WMV containers. Embedded XMP writing is limited to the safer supported containers shown by the app; other containers must be converted or remuxed first.

## Development

```shell
npm install
node node_modules/electron/install.js
npm test
npm start
npm run dist:win
npm run dist:mac -- --arm64
```

`npm run dist:win` creates the per-user one-click NSIS installer `Amazon-Adding-Metadata-Tag-Windows-Setup.exe`. End users only run that `.exe`; Node.js, npm, and separate dependency downloads are not required.

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
