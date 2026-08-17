<p align="center"><img src="build/icon.png" alt="Maviet Supplies logo" width="128"></p>

# Amazon - Adding Metadata Tag

Created by [khooyc](https://github.com/khooyc) on GitHub.

## Human Verification Required

This tool may make mistakes. Always review your files, check the latest applicable Amazon requirements, and confirm that any required XMP metadata or tag is present in the final file before uploading or submitting it.

See [Software Licence & Disclaimer](SOFTWARE_LICENCE_AND_DISCLAIMER.md) for the full terms. This independent tool is not endorsed by, sponsored by, or affiliated with Amazon.

## What is preserved on GitHub

The repository preserves the application source code, documentation, legal disclaimer, logo assets, tests, and macOS build workflow. Published Windows and macOS installers are kept in the [Releases](https://github.com/khooyc/amazon-adding-metadata-tag/releases) section, so they remain available even if the local project folder is removed.

Your media files, local review decisions, safety backups, and app settings are intentionally not uploaded. They stay on the computer where you use the app.

## Update notifications

When the app opens, it checks the public GitHub Releases endpoint for the latest stable release of this repository. A small status indicator appears in the header: **Up to date**, **Update available**, or **Updates unavailable**. If an update is available, clicking the indicator opens the trusted GitHub release page. The check sends no media paths, file contents, review decisions, or app settings, and updates are never downloaded or installed automatically.

To publish a notification-triggering update, increase the version in `package.json`, create a matching GitHub Release tag such as `v1.6.1`, and attach the installer artifacts. Draft and prerelease versions are ignored by the “latest release” check. Users who are offline simply see that update checking is unavailable and can continue using the app.

## Languages, appearance, and onboarding

- Interface languages: English, Simplified Chinese, and Traditional Chinese.
- Appearance: light, dark, or automatic system theme.
- New users receive a five-step quick-start tutorial.
- Language, theme, and tutorial choices are stored only in the local app profile.

A private, human-first Windows and macOS desktop app for preparing local Amazon listing images and supported videos that contain photorealistic AI-generated people. It adds the exact keyword `contains-synthetic-performer` to XMP `dc:subject`, then re-reads that explicit field before reporting the local file as verified.

## Safe workflow

1. Select any media folder. Seller SKU or product subfolders are optional; media placed directly in the selected folder appears under **No SKU**.
2. Open the app, choose that Media Library folder, and press **Scan**. No background monitoring occurs.
3. Review the untagged images and videos by optional media group. Click anywhere on a media card to select or deselect it, then choose **Add tag & verify** or **No tag needed**. Videos carry a red **WATCH FULL VIDEO BEFORE REVIEW** warning; watch the entire video before making a decision. **Show in folder** never changes the selection.
4. Upload the prepared files to Seller Central manually. The app does not log in to Amazon or claim an upload succeeded.

Use **Select visible** for the current group/search result, or **Select all media** to select the complete current queue across every group. In **Duplicates & visual variants**, select a false visual match and choose **Not a duplicate** to remember that decision by content fingerprint; byte-for-byte exact duplicates cannot be dismissed.

Long operations show measured progress from 0% to 100%, with the current stage and file count. Unicode filenames (including Chinese characters) and UNC network-share paths are passed to ExifTool through a UTF-8-safe argument channel.

Recognized videos enter the normal Media review queue, including AVI, MKV, WebM, WMV, MPEG, TS, VOB, and other common containers. The app does not analyze their content; the red warning requires a human to watch the full video first. Only containers that the bundled ExifTool can safely write and re-read may use **Add tag & verify**. Other video containers remain visible in Media with a conversion/remux warning.

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
- Unsupported non-media files and metadata warnings are surfaced instead of silently skipped. Media does not require a Seller SKU folder. Recognized videos remain visible in the review queue until a human decision is recorded.

## Supported still-image formats

JPEG/JPG, PNG, TIFF/TIF, and WebP.

## Video formats

Recognized video containers include 360, 3G2/3GP, ASF, AVI, F4V, FLV, LRV, M2TS, M4V, MKV, MOV, MP4, MPEG/MPG, MQV, MTS, MXF, OGV, QT, RM/RMVB, TS, VOB, WebM, and WMV. Video content is never classified automatically: watch the full file before making a decision.

Embedded XMP tagging and verification are enabled for 360, 3G2/3GP, F4V, LRV, M4V, MOV, MP4, MQV, and QT. Other recognized video containers stay in the Media queue but show a warning to convert or remux to a writable container first; the app never creates a sidecar or falsely reports those files as tagged.

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

The Windows installer offers a checked-by-default **Create a Start Menu shortcut** option. Clear it if you do not want the shortcut; this does not affect the desktop shortcut or the installed application.

## First launch on macOS

The free Mac build is not Apple Developer ID signed or notarized. This is why macOS may show a warning saying that Apple cannot verify the developer or that the app cannot be opened. The warning is expected for this unsigned release; it does not mean the app requires an Apple Developer account to run.

To open it safely:

1. Download the `.dmg` from this repository’s [Releases page](https://github.com/khooyc/amazon-adding-metadata-tag/releases). Choose `arm64` for Apple Silicon (M1 or newer) or `x64` for Intel.
2. Open the `.dmg` and drag **Amazon - Adding Metadata Tag** into **Applications**.
3. Open **Applications**, then Control-click the app and choose **Open**.
4. In the confirmation dialog, choose **Open** again.
5. If macOS still blocks it, open **System Settings → Privacy & Security**, find the message about the blocked app, and select **Open Anyway**.

You normally need to approve only the first launch of each newly downloaded version. Do not disable Gatekeeper globally or run unfamiliar commands from third-party websites. Review the release notes and checksum before installing.
