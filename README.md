# CyberFiles

<p align="center">
  <img src="https://raw.githubusercontent.com/CyberGems/CyberFiles/main/public/icon.png" width="100" alt="CyberFiles">
</p>

**A dual-pane file manager for Windows, built with Tauri, Rust, React, and TypeScript.**

CyberFiles is an early Windows-first file manager preview. Its workspace combines familiar Windows locations and drives with flexible panes, independent tabs, and a customizable interface.

## Releases

Download the Windows installer and release notes from the [GitHub Releases page](https://github.com/CyberGems/CyberFiles/releases).

## Features

- Browse real Windows drives and common user folders from a unified This PC view.
- Use dual vertical, dual horizontal, or single-pane layouts, with independent tabs and navigation history.
- Switch between details, compact, and icon-grid views. Resize details columns and optionally keep the current view style while navigating.
- Preview common text, Markdown, HTML, and image files.
- Pin folders to personal Quick Access from the sidebar or folder context menu. Rename or remove shortcuts, sort A–Z, or arrange them manually with drag and drop or Alt+Up and Alt+Down.
- Recognize files and folders changed in the last 24 hours with a subtle amber accent and tooltip details. This option is enabled by default.
- Copy, move, rename, and create folders in the Windows desktop app. Confirmed deletions go to the Windows Recycle Bin.
- Choose CyberFiles, grayscale, or light appearance, and English or Spanish UI language.
- Use the system tray and configurable global shortcut. Window size, position, and maximized state are restored on the next launch.
- Use a development-only browser preview to browse one folder selected by the user through the File System Access API, where supported.

## Development

### Prerequisites

- Node.js and npm
- Rust stable toolchain
- The Windows build tools required by Tauri

### Install and run

<pre><code>npm ci
npm run dev:desktop</code></pre>

For a limited browser preview instead of the desktop app:

<pre><code>npm run dev</code></pre>

Browser preview is a development fallback. It can access only a folder the user explicitly chooses and only in browsers that support the File System Access API. It cannot use the Windows Shell, inspect arbitrary drives, or manage the Windows Recycle Bin.

## Build and checks

<pre><code>npm run test
npm run test:native
npm run check
npm run build:desktop
npm run build:installer</code></pre>

The debug executable is produced at <code>src-tauri/target/debug/cyberfiles.exe</code>. The installer build creates an NSIS package for Windows x64 under <code>src-tauri/target/release/bundle/nsis</code>. The first native build may take several minutes while Rust dependencies compile.

## Technology

- **Desktop shell:** Tauri 2 and Rust
- **Interface:** React, TypeScript, Vite, and Tailwind CSS
- **Native integration:** Windows drive discovery, folder enumeration, file operations, Recycle Bin, tray controls, and persisted window placement

## Project status

CyberFiles is Windows-first. The first prerelease is intended to validate the packaged installer and early workflow. Other desktop platforms have not been validated.

## License

No license has been declared yet. Until a license is added, all rights remain with the copyright holder.