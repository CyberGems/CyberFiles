# CyberFiles

<p align="center">
  <img src="https://raw.githubusercontent.com/CyberGems/CyberFiles/main/public/icon.png" width="100" alt="CyberFiles">
</p>

**A dual-pane file manager for Windows, built with Tauri, Rust, React, and TypeScript.**

CyberFiles is an early Windows-first file manager preview. Its workspace combines familiar Windows locations and drives with flexible panes, independent tabs, and a customizable interface.

## Releases

Download the Windows installer and release notes from the [GitHub Releases page](https://github.com/CyberGems/CyberFiles/releases).

## Portable edition

Each Windows release also includes a portable ZIP package. Extract the ZIP and run `CyberFiles.exe`; no installer is needed. The portable edition stores its settings and user data in the `CyberFiles_Data` folder beside the executable. Keep that folder with the application when moving or backing up the portable copy. The portable profile is separate from the profile used by an installed copy of CyberFiles.

The portable edition requires the Microsoft Edge WebView2 Evergreen Runtime. The installer can download this runtime if it is missing; portable users need to install it separately when their PC does not already have it. Portable packages target Windows 10 and 11 on x64.

## Features

- Browse real Windows drives and common user folders from a unified This PC view.
- Browse large directories with additional items loaded automatically as you scroll, while folder totals remain accurate.
- Use dual vertical, dual horizontal, or single-pane layouts, with independent tabs and navigation history.
- Switch between details, compact, and icon-grid views. Resize details columns and optionally keep the current view style while navigating.
- Preview common text, Markdown, HTML, and image files, plus the contents of ZIP and RAR archives.
- Extract ZIP and RAR archives, including password-protected archives, or create ZIP files from selected items.
- Pin folders to personal Quick Access from the sidebar or folder context menu. Rename or remove shortcuts, sort A–Z or Z–A, or arrange them manually with drag and drop or Alt+Up and Alt+Down. The sidebar also keeps the current folder in context while browsing.
- Recognize files and folders changed in the last 24 hours with a subtle amber accent and tooltip details. This option is enabled by default.
- Copy, move, rename, and create folders in the Windows desktop app. Confirmed deletions go to the Windows Recycle Bin. A queued operations center shows progress and provides pause and cancel controls.
- Undo recent supported file operations from the ten-entry action history.
- Open the command palette with Ctrl+K to find commands and navigate to locations.
- View file icons from their Windows-associated applications, and calculate folder sizes by hovering over the folder name.
- Choose CyberFiles, grayscale, or light appearance, and English or Spanish UI language.
- Review drive capacity, folder selection, path length, and localized date and time details from the status bar.
- Use the system tray and configurable global shortcut. Window size, position, and maximized state are restored on the next launch.

## Development

### Prerequisites

- Node.js and npm
- Rust stable toolchain
- The Windows build tools required by Tauri

### Install and run

<pre><code>npm ci
npm run dev</code></pre>

This starts the Windows desktop app through Tauri. The Vite server is managed internally for the desktop webview; CyberFiles does not provide a browser mode.

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

CyberFiles is an early Windows-first prerelease. This release is intended to validate the packaged installer and expanded file-management workflows. Other desktop platforms have not been validated.

## License

No license has been declared yet. Until a license is added, all rights remain with the copyright holder.