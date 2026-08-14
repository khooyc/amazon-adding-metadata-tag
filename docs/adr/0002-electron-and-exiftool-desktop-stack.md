# Use a secured Electron shell with bundled ExifTool

The app uses Electron because this PC has a current Node toolchain but no .NET SDK, and Electron can produce a normal per-user Windows installer. Privileged file operations remain in the main process behind a narrow isolated bridge, while a pinned bundled ExifTool performs explicit XMP `dc:subject` reads and writes across JPEG, PNG, TIFF, and WebP; replacing this stack would affect the UI, packaging, metadata operations, and tests.
