# CyberFiles

**A dual-pane file manager for Windows, built with Tauri, Rust, React, and TypeScript.**

CyberFiles is an early-stage desktop file manager focused on fast, clear folder navigation. Its workspace brings together the familiar Windows locations and drives with a flexible dual-pane layout, per-tab navigation, and a compact, customizable interface.

## Features

- Browse real Windows drives and common user folders from a unified “This PC” view.
- Work in dual vertical, dual horizontal, or single-pane layouts, with independent tabs and navigation history.
- Switch between details, compact, and icon-grid views. Resize details columns and optionally lock the current style while navigating.
- Preview common image formats as thumbnails in grid view.
- Keep frequently used locations and recent files close at hand in the sidebar.
- Choose CyberFiles, grayscale, or light appearance, and English or Spanish UI language.
- Use the system tray to show, hide, or quit the app. Window size, position, and maximized state are restored on the next launch.
- In supported browsers, browse a user-selected local folder through the File System Access API.

## Development status

CyberFiles is actively being developed and is not yet a finished file manager. Directory browsing and drive discovery use the real filesystem. File-changing operations such as copy, move, rename, create-folder, and delete are still being completed in the native filesystem layer; do not rely on this development build for important file operations.

The project is currently Windows-first. Other desktop platforms and production packaging have not been validated.

## Getting started

### Prerequisites

- Node.js and npm
- Rust stable toolchain
- The Windows build tools required by Tauri

### Install and run

```powershell
npm ci
npm run dev:desktop
```

To run the web interface instead:

```powershell
npm run dev
```

Browser mode can access only a folder the user explicitly chooses, and only in browsers that support the File System Access API.

## Build and checks

```powershell
npm run test          # Unit tests
npm run test:native   # Rust/Tauri tests
npm run check         # TypeScript validation and web production build
npm run build:desktop # Debug Windows executable, without an installer
```

The debug executable is produced at `src-tauri/target/debug/cyberfiles.exe`. The first native build may take several minutes while Rust dependencies compile.

## Technology

- **Desktop shell:** Tauri 2 and Rust
- **Interface:** React, TypeScript, Vite, and Tailwind CSS
- **Native integration:** Windows drive discovery, folder enumeration, tray controls, and persisted window placement

## Roadmap

- Complete safe native copy, move, rename, and folder-creation operations.
- Integrate deletion with the Windows Recycle Bin and handle recovery and filesystem errors.
- Refresh open folders in response to filesystem changes.
- Continue validating navigation, performance, accessibility, and packaged Windows builds.

## License

No license has been declared yet. Until a license is added, all rights remain with the copyright holder.
