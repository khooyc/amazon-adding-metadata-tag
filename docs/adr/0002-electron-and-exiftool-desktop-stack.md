# Use a secured Electron shell with bundled ExifTool

The app uses Electron to provide the same secured local workflow on Windows and macOS, with a per-user Windows installer and native Apple Silicon and Intel macOS disk images. Privileged file operations remain in the main process behind a narrow isolated bridge, while the pinned cross-platform ExifTool package supplies the correct executable for each operating system and performs explicit XMP `dc:subject` reads and writes across JPEG, PNG, TIFF, and WebP; replacing this stack would affect the UI, packaging, metadata operations, and tests.
