<p align="center">
  English · <a href="./README.es.md">Español</a>
</p>

<p align="center">
  <a href="https://github.com/CyberGems/CyberFiles">
    <img src="https://raw.githubusercontent.com/CyberGems/CyberFiles/main/public/icon.png" width="120" alt="CyberFiles, a dual-pane file manager for Windows" />
  </a>
</p>

<p align="center">
  <a href="https://github.com/CyberGems/CyberFiles/releases/latest"><img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FCyberGems%2FCyberFiles%2Fmain%2Fpackage.json&query=%24.version&prefix=%20Download%20CyberFiles%20v&suffix=%20&style=for-the-badge&label=&labelColor=0891B2&color=0891B2" alt="Download Latest Release" /><img src="https://img.shields.io/badge/Windows_10%2F11_(64--bit)-2563EB?style=for-the-badge" alt="Windows 10/11 (64-bit)" /></a>
  &nbsp;<a href="https://github.com/CyberGems/CyberFiles/releases"><img src="https://img.shields.io/badge/All_releases-30363D?style=for-the-badge&logo=github&logoColor=white" alt="All Releases" /><img src="https://img.shields.io/badge/Changelog-475569?style=for-the-badge" alt="Changelog" /></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/License-GPL--3.0-1F2428.svg?style=flat-square&color=334155" alt="License" />&nbsp;
  <img src="https://img.shields.io/badge/Platform-Windows_10%2F11-1F2428.svg?style=flat-square&color=334155" alt="Platform" />&nbsp;
  <img src="https://img.shields.io/badge/Tauri-2.x-1F2428.svg?style=flat-square&logo=tauri&logoColor=white&color=334155" alt="Tauri" />&nbsp;
  <img src="https://img.shields.io/badge/React-19-1F2428.svg?style=flat-square&logo=react&logoColor=white&color=334155" alt="React" />&nbsp;
  <a href="https://github.com/CyberGems/CyberFiles/wiki"><img src="https://img.shields.io/badge/Wiki-Documentation-1F2428?style=flat-square&logo=gitbook&logoColor=white&color=334155" alt="Wiki" /></a>
</p>

---

## What is CyberFiles?

CyberFiles is a **dual-pane file manager for Windows** built for people who move files all day and want the keyboard to do most of the work. It combines two independent panes, each with its own tabs and history, with details, list and icon views, saved layouts and sessions, queued copy and move operations with undo, ZIP and RAR tools, and a properties panel that previews text, images, PDFs and archive contents. Windows drive discovery, native file icons, the Recycle Bin and the Windows properties dialog are wired through the Windows Shell rather than emulated. Built with **Tauri 2**, **Rust**, **React** and **TypeScript**.

*Free and open source (GPLv3): no ads, no tracking, no telemetry, no account. Everything runs on your PC.*

---

## 🗂️ Why CyberFiles?

Most Windows file managers either hide the second pane behind a paid tier or wrap basic operations in layers of dialogs. CyberFiles keeps the classic two-pane workflow, adds tabs and workspaces on top of it, and shows what is happening with every copy, move and delete.

| Need | Solution |
|---|---|
| Work in two folders at once | Dual vertical, dual horizontal or single-pane layouts, each pane with its own tabs |
| Keep a workflow across restarts | Saved layouts, tab sessions and workspaces, restored at startup if you want |
| Move a lot of files safely | Queued operations with progress, pause, cancel, per-item errors and undo history |
| See inside a file without opening it | Properties panel with text, code, Markdown, HTML, image, PDF and archive previews |
| Handle archives in place | Preview and extract ZIP and RAR, including password-protected archives, and create ZIP files |
| Find things fast | Command palette, in-pane filter, global file finder with patterns and regular expressions |
| Tame a messy folder tree | Quick Access, folder tree, flat view, saved per-folder styles, custom folder icons |
| Stay out of the way | System tray, configurable global shortcut, single instance, remembered window placement |

---

## ✨ Key Features

### 🗂️ Panes, Tabs & Workspaces
- **Three layouts**: dual vertical, dual horizontal and single pane, with a draggable divider between panes
- **Independent tabs**: each pane keeps its own tabs, navigation history, filter and selection
- **Tab control**: duplicate, rename, color, lock or reopen tabs from the tab menu; place the tab bar above, below, left or right; choose horizontal or vertical tabs with automatic, fixed or equal widths
- **New tab content**: choose whether a new tab opens the default folder, the current folder, a duplicate of the tab, your home folder, an empty tab or a specific location
- **Layouts, sessions and workspaces**: save the current layout, save a tab session, and combine both into a workspace that restores in one step
- **Startup behavior**: continue where you left off, open This PC, or load a saved session, chosen in Settings or the welcome screen
- **Unsaved change prompts**: saving, updating or discarding pending layout and session changes when you close the window

### 📁 Browsing & Views
- **This PC view**: drives, common Windows folders, network locations and advanced Windows folders in one place
- **Address bar**: the current folder path with clickable segments; click a parent to jump back, click the current segment to refresh the listing, and open recent folders from the chevron at the right edge
- **Sidebar**: locations only, so the tree never leaves the screen: quick access with a lazy-loaded folder tree, drives with capacity bars, advanced Windows folders and Recycle Bin status
- **Quick Access**: pin up to 100 folders, rename or remove shortcuts, and sort them A–Z, Z–A or manually by dragging (Alt+Up and Alt+Down also work)
- **Views**: Details, List and Large Icons, with resizable columns, add or hide columns, sortable headers, and grouping by date or size
- **Relative graphs**: optional bars behind sizes and dates that make the shape of a folder visible at a glance
- **Progressive loading**: large folders load as you scroll while the status bar keeps accurate file, folder and item totals
- **Flat view**: recursively list every subfolder in one list, with a confirmation when the tree is large
- **Filter**: narrow the current list as you type, without running a full search
- **Mouse gestures**: hold the right button and drag left or right to go back or forward, or up or down to jump to the start or end of the list; a normal right-click still opens the context menu
- **Folder style Lock**: keep view, sorting and column widths while navigating, or let each folder use its own saved style
- **Custom folder icons**: pick an icon, color and status badge for a folder, stored by CyberFiles and never written to Windows

### 🚚 File Operations
- **Two-pane transfers**: copy with F5 or move with F6, or drag items between panes with the intended action shown before you drop
- **Clipboard**: cut, copy and paste with Windows keyboard shortcuts
- **Operations center**: copy, move, extraction and ZIP creation run through a queue with progress, pause, resume, cancel and per-item errors
- **Undo history**: the last ten supported actions can be reversed from the toolbar, with clear reasons when an action cannot be undone
- **Create and rename**: new folder, new text document, new shortcut, single rename and a batch rename studio with search and replace, prefix, suffix, sequential numbering and case changes
- **Delete safely**: confirmed deletions go to the Windows Recycle Bin through the Shell, and the sidebar shows Recycle Bin contents with restore and empty actions
- **No silent overwrites**: name conflicts receive a distinct name instead of replacing an existing item

### 🗜️ Archives & Preview
- **Archive preview**: list the contents of ZIP and RAR files, with a password prompt for protected archives
- **Extract**: extract here or into a folder named after the archive, with unsafe paths rejected
- **Create ZIP**: compress the selection or the current folder into a new archive
- **Properties panel**: text, code, Markdown, HTML, image and PDF previews, plus encoding, line count and full metadata
- **Image previews**: PNG, JPEG, GIF, WebP, BMP, TIFF, ICO and SVG, with the same thumbnail in the file tooltip and in icon view
- **Quick actions**: copy file content, copy the full path, or open the original Windows properties dialog

### 🔎 Search & Tools
- **Command palette (Ctrl+K)**: jump to commands and locations without leaving the keyboard
- **Global file finder**: search by name or pattern, use regular expressions, filter by size, type or category, and locate any result in the active pane
- **Content search**: search text that CyberFiles has already previewed, with an explicit note about what is searched
- **Search history**: reuse or clear recent queries
- **Shortcut cheat sheet (F1)**: the full key map, available from the toolbar and the status bar
- **Folder sizes**: hold the pointer over a folder to calculate its total, or request it from the column

### 🖥️ Windows Integration
- **Native icons and properties**: file type icons come from their Windows-associated applications, and the properties button opens the real Windows dialog
- **Terminals and Explorer**: open Command Prompt or PowerShell, with administrator variants, show the current folder in Windows File Explorer, and jump to advanced Windows folders
- **System tray**: a styled tray menu shows the window state, the global shortcut, help links, other CyberGems apps, and settings
- **Global shortcut**: show or hide CyberFiles from anywhere with a configurable combination (Alt+Shift+F by default)
- **Instance control**: single instance by default, with an option to allow separate windows on each launch
- **Window memory**: size, position and maximized state are restored, and closing can minimize to tray or exit with a remembered choice
- **Status bar detail**: folder counts, selection size, drive capacity, path length, date and time, and time zone

### 🎨 Customization
- **3 themes**: CyberFiles (dark with a cyan accent), Gray and Light
- **Bilingual UI**: complete English and Spanish interface
- **Date formats**: application style, system locale or ISO
- **Display options**: recent-item highlighting and hidden-item styling with your own colors, image thumbnails in tooltips, optional notification banners and tooltips
- **Settings search**: filter settings across every tab from a single field
- **Welcome screen**: first-run setup for language, theme, folder style and startup behavior

---

## 🚀 Getting Started

### Install

1. Download the [latest release](https://github.com/CyberGems/CyberFiles/releases/latest)
2. Run the NSIS installer, or extract the portable ZIP and start `CyberFiles.exe`
3. Follow the welcome screen to choose language, theme, folder style and startup behavior

The installer offers a per-user or a system-wide installation; the system-wide option may ask for administrator approval. When the Microsoft Edge WebView2 Evergreen Runtime is missing, setup downloads its bootstrapper, so an internet connection is needed during installation.

The release assets include `SHA256SUMS.txt` with checksums for both packages, so you can verify a download before running it.

### Portable edition

The portable ZIP contains `CyberFiles.exe` and a short `README.txt`. Extract it anywhere and run the executable; no installer is needed. Settings and the WebView2 profile are stored in the `CyberFiles_Data` folder beside the executable, so keep that folder with the application when you move or back it up, and keep the location writable.

The portable profile is separate from an installed copy, and both editions can run at the same time. Portable packages target Windows 10 and 11 on x64 and require the WebView2 Evergreen Runtime, which is already present on current Windows 11 and many updated Windows 10 installations.

### 🛡️ Windows SmartScreen

Windows may show a SmartScreen warning the first time you run the CyberFiles installer: this is an unsigned hobby app, so Windows hasn't built reputation for the file yet. This is expected; the source is public so you can inspect exactly what it does. The same can appear when launching the portable build.

To continue:

<details>
<summary><strong>See how to run the installer (step by step)</strong></summary>

Windows shows this warning for any installer without a paid code-signing certificate; it does not mean the file is unsafe. Do <strong>not</strong> click "Don't run":

1. Run the installer. Windows may show the blue "Windows protected your PC" dialog.

![Windows SmartScreen warning](https://cybergems.org/branding/smartscreen-warning.svg)

2. Click the small **More info** link.

![SmartScreen dialog after More info](https://cybergems.org/branding/smartscreen-runanyway.svg)

3. Click **Run anyway**. The installer starts normally.

You can verify the file independently: compare the SHA with the GitHub release, scan it on VirusTotal, or build from source. More details: [SmartScreen guide on the website](https://cybergems.org/download#smartscreen).

</details>

---

## 🛠️ Tech Stack & Architecture

- **Platform:** Windows 10 and 11 (x64)
- **Desktop shell:** Tauri 2 with Rust
- **Interface:** React 19, TypeScript, Vite and Tailwind CSS 4
- **Windows integration:** the `windows` and `windows-sys` crates for Shell file operations, icon extraction, drive information and the Recycle Bin
- **Archives:** the `zip` crate (including AES) and `unrar-rs`
- **Storage:** no database; preferences live in the WebView profile and small JSON files in the app config folder
- **Runtime:** Microsoft Edge WebView2 Evergreen Runtime

```
CyberFiles/
├── src/                        React frontend
│   ├── components/             Panes, tabs, dialogs, settings, preview, tray-adjacent UI
│   ├── locales/                English and Spanish strings
│   ├── themes/                 Theme context
│   ├── tray/                   Tray window, suite catalog and styling
│   ├── utils/                  Filesystem helpers, workspaces, search index, preferences
│   ├── App.tsx                 Application shell, state and keyboard handling
│   └── main.tsx                Frontend entry point
├── src-tauri/
│   ├── src/main.rs             Commands, Windows Shell integration, tray and hotkey
│   ├── src/windows_file_icons.rs
│   ├── Cargo.toml
│   └── tauri.conf.json
├── scripts/                    Portable packaging and dev server helper
├── public/                     Application icons
├── tray.html                   Tray window entry
├── vite.config.ts
└── package.json
```

### Architecture Highlights

- **Rust owns the filesystem**: copy, move, rename, delete, archive and drive queries run in native commands, not in the webview
- **Shell-first Windows behavior**: deletions use `IFileOperation` with the recycle flag, icons come from the Shell image lists, and properties open the real Windows dialog
- **Queued transfers**: operations report progress and per-item results so partial failures stay visible
- **Two frontend entry points**: `index.html` for the main window and `tray.html` for the transparent tray menu, both built by one Vite config
- **Lazy UI**: the file pane and every modal load on demand, keeping startup light

### Building from Source (Developers)

Only needed if you want to work on CyberFiles or build it yourself; regular users can skip this section.

#### Prerequisites

Node.js 22 or later (the release workflow uses Node 24), a stable Rust toolchain with the `x86_64-pc-windows-msvc` target, and the [Tauri Windows prerequisites](https://v2.tauri.app/start/prerequisites/): Microsoft C++ build tools and the WebView2 runtime. Building the installer also needs NSIS.

#### Development

```powershell
npm ci
npm run dev
```

`npm run dev` starts the desktop app through Tauri and manages the Vite server internally. There is no supported browser mode; the internal Vite server exists only for UI troubleshooting.

#### Checks and tests

```powershell
npm test
npm run test:native
npm run check
```

`npm test` runs the TypeScript unit tests, `npm run test:native` runs the Rust tests, and `npm run check` runs the type check and the frontend build.

#### Build

```powershell
npm run build:desktop
npm run build:installer
npm run build:portable
```

The debug executable is written to `src-tauri/target/debug/cyberfiles.exe`. The installer build creates an NSIS package under `src-tauri/target/release/bundle/nsis`, and the portable build creates a ZIP under `src-tauri/target/release/bundle/portable`. The first native build takes several minutes while Rust dependencies compile.

Pushing an annotated `v*` tag that matches the versions in `package.json` and `src-tauri/tauri.conf.json` builds and publishes a release; the tag message becomes the release summary.

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
|---|---|
| `Tab` | Switch between the left and right pane |
| `F1` | Open the keyboard shortcuts cheat sheet |
| `F2` | Rename the selected item |
| `F3` or `Space` | Show or hide the properties panel |
| `Ctrl+L` | Show or hide the locations panel |
| `F5` | Copy the selection to the opposite pane |
| `F6` | Move the selection to the opposite pane |
| `F7` | Create a folder in the current location |
| `Ctrl+R` | Open batch rename |
| `Ctrl+F` | Search by name, path or available content |
| `Ctrl+K` | Open the command palette for commands and locations |
| `Ctrl+T` / `Ctrl+W` | Open a tab / close the active tab |
| `Ctrl+A` | Select all visible items |
| `Shift+Arrow keys` | Extend or shrink the selection |
| `Shift+Home` / `Shift+End` | Select to the beginning or end of the list |
| `Ctrl+C` / `Ctrl+X` / `Ctrl+V` | Copy, cut and paste files |
| `Backspace` | Go to the parent folder |
| `Enter` | Open a folder or file |
| `Delete` | Ask for deletion confirmation |
| `Esc` | Close dialogs |
| `Alt+Shift+F` | Show or hide CyberFiles (global, configurable) |

With the file list focused, typing letters jumps to a matching name and repeating the letter cycles through matches. In Manual Quick Access ordering, Alt+Up and Alt+Down move the focused shortcut.

---

## 🧪 Project status

CyberFiles is an early Windows-first prerelease. The current release validates the packaged installer, the portable edition and the expanded file-management workflows. Other desktop platforms have not been validated.

Two current limitations are intentional and documented:

- **Network locations cannot be used as a delete target.** Recycle Bin deletion accepts only canonical local fixed and removable drives; UNC paths, mapped network drives, optical media and filesystem roots are rejected with a per-item error. Use Windows Explorer for network deletion.
- **Empty Recycle Bin follows Windows behavior.** It passes a null path to the Shell, which empties the Recycle Bins of all drives, so its scope can be wider than the status indicator. It is permanent and cannot be undone.

See [File Operations and Safety](https://github.com/CyberGems/CyberFiles/wiki/File-Operations-and-Safety) for the full list of behaviors.

---

## 🤝 Contributing

Contributions are welcome. Please open an issue describing the change before starting large work, and submit pull requests against the main branch. Keep user-facing text available in both English and Spanish.

## 🙏 Acknowledgments

CyberFiles builds on open-source components including [Tauri](https://tauri.app/), [React](https://react.dev/), [Vite](https://vite.dev/), [Tailwind CSS](https://tailwindcss.com/), [Lucide](https://lucide.dev/), the [`zip`](https://crates.io/crates/zip) crate, and [`unrar-rs`](https://crates.io/crates/unrar-rs), thanks to their authors and maintainers.

The RAR support includes UnRAR source code. Its license terms are reproduced in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

---

## ❤️ Donate

After countless hours building and refining **CyberFiles** for my own use, I recently decided to share it with the world along with my other open-source tools in [CyberGems](https://github.com/CyberGems#-all-apps--repositories).

If you’d like to support future updates, I’d truly appreciate it. Your donation helps keep development going, roll out new features, speed up updates and bug resolution, and enhance documentation quality. You can also show your support by [starring the repo on GitHub](https://github.com/CyberGems/CyberFiles). Thank you! 🙏

<p align="center">
  <a href="https://www.paypal.com/donate/?hosted_button_id=M4PY3UPJA5Y6Q"><img src="https://img.shields.io/badge/Donate-PayPal-0070BA?style=for-the-badge&logo=paypal" alt="Donate via PayPal" /></a>
</p>

<p align="center">
  <a href="https://ko-fi.com/cybergems"><img src="https://img.shields.io/badge/Support_me_on_Ko--fi-FF5E5B?style=for-the-badge&logo=ko-fi&logoColor=white" alt="Support me on Ko-fi" /></a>
</p>

<p align="center">
  <a href="https://buymeacoffee.com/cybergems"><img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black" alt="Buy Me a Coffee" /></a>
</p>

<div align="center">

<details>
<summary><b>Crypto donations (BTC, ETH, USDT, LTC): click to view addresses</b></summary>

| Asset | Address | QR |
|---|---|---|
| **BTC** | <pre><code>bc1q5mxzz05nmvsheqzx7970euswta3fksxzcfzag4</code></pre> | <img src="assets/donate/qr-btc.png" width="90" height="90" alt="BTC QR" /> |
| **ETH** | <pre><code>0x79b703Ec0f77493679Fcd280aF3b983E20c580B8</code></pre> | <img src="assets/donate/qr-eth.png" width="90" height="90" alt="ETH QR" /> |
| **USDT (ERC20 / BEP20)** | <pre><code>0x79b703Ec0f77493679Fcd280aF3b983E20c580B8</code></pre> | <img src="assets/donate/qr-eth.png" width="90" height="90" alt="USDT QR" /> |
| **USDT (TRC20)** | <pre><code>TSVbSk1HSyZ1NprCnAYiw56ECwXgH887mD</code></pre> | <img src="assets/donate/qr-usdt-tron.png" width="90" height="90" alt="USDT TRC20 QR" /> |
| **LTC** | <pre><code>LWGnEHgcFCE2BRkzLnsdPDD8Y8ZeDK577X</code></pre> | <img src="assets/donate/qr-ltc.png" width="90" height="90" alt="LTC QR" /> |

> ⚠️ Send only the selected asset on the indicated network. Using the wrong network will result in permanent loss of funds.

</details>

</div>

---

## 📄 License

CyberFiles is distributed under the terms of the GNU General Public License v3.0. See [`LICENSE`](LICENSE) for the full license text.

Copyright (C) 2026 CyberGems

---

## ❓ FAQ

For usage guides, settings, keyboard shortcuts, safety details and troubleshooting, visit the [CyberFiles wiki](https://github.com/CyberGems/CyberFiles/wiki):

| Page | What it covers |
|---|---|
| [How Do You Use CyberFiles](https://github.com/CyberGems/CyberFiles/wiki/How-Do-You-Use) | This PC, panes, tabs, views and item inspection |
| [Settings](https://github.com/CyberGems/CyberFiles/wiki/Settings) | Themes, language, navigation, startup and the global shortcut |
| [File Operations and Safety](https://github.com/CyberGems/CyberFiles/wiki/File-Operations-and-Safety) | Queue, undo, Recycle Bin behavior and network restrictions |
| [Installation and Setup](https://github.com/CyberGems/CyberFiles/wiki/Installation-and-Setup) | Releases, portable edition, development commands and builds |
| [Troubleshooting](https://github.com/CyberGems/CyberFiles/wiki/Troubleshooting) | Common questions about operations, archives and shortcuts |

---

<div align="center" style="background:#0D0F17; border:1px solid rgba(0,255,255,0.12); border-radius:12px; padding:28px 20px; margin-top:32px;">

### Thanks for using CyberFiles! 🎉

Made by [**CyberGems**](https://cybergems.org)

</div>
<p align="center">
  <a href="https://www.reddit.com/submit?url=https%3A%2F%2Fgithub.com%2FCyberGems%2FCyberFiles&title=CyberFiles%3A%20a%20dual-pane%20file%20manager%20for%20Windows"><img src="https://img.shields.io/badge/Share_on_Reddit-FF4500?style=for-the-badge&logo=reddit&logoColor=white" alt="Share on Reddit" /></a>
  &nbsp;<a href="https://twitter.com/intent/tweet?text=CyberFiles%3A%20a%20dual-pane%20file%20manager%20for%20Windows&url=https%3A%2F%2Fgithub.com%2FCyberGems%2FCyberFiles"><img src="https://img.shields.io/badge/Share_on_X-1DA1F2?style=for-the-badge&logo=x&logoColor=white" alt="Share on X" /></a>
  &nbsp;<a href="https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fgithub.com%2FCyberGems%2FCyberFiles"><img src="https://img.shields.io/badge/Share_on_Facebook-1877F2?style=for-the-badge&logo=facebook&logoColor=white" alt="Share on Facebook" /></a>
  &nbsp;<a href="mailto:?subject=CyberFiles%3A%20a%20dual-pane%20file%20manager%20for%20Windows&body=CyberFiles%3A%20a%20dual-pane%20file%20manager%20for%20Windows%20https%3A%2F%2Fgithub.com%2FCyberGems%2FCyberFiles"><img src="https://img.shields.io/badge/Share_by_Email-EA4335?style=for-the-badge&logo=gmail&logoColor=white" alt="Share by Email" /></a>
  &nbsp;<a href="https://t.me/share/url?url=https%3A%2F%2Fgithub.com%2FCyberGems%2FCyberFiles&text=CyberFiles%3A%20a%20dual-pane%20file%20manager%20for%20Windows"><img src="https://img.shields.io/badge/Share_on_Telegram-26A5E4?style=for-the-badge&logo=telegram&logoColor=white" alt="Share on Telegram" /></a>
  &nbsp;<a href="https://www.linkedin.com/sharing/share-offsite/?url=https%3A%2F%2Fgithub.com%2FCyberGems%2FCyberFiles"><img src="https://img.shields.io/badge/Share_on_LinkedIn-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white" alt="Share on LinkedIn" /></a>
</p>

---

## 🔗 See also

More free, open-source, privacy-first apps from [**CyberGems**](https://github.com/CyberGems):

| App | Description |
|:---:|---|
| 🕐&nbsp;[**CyberClock**](https://github.com/CyberGems/CyberClock#readme) | Desktop clock with analog & digital display, calendar, timer, stopwatch and relaxation module. |
| 📢&nbsp;[**CyberFeeds**](https://github.com/CyberGems/CyberFeeds#readme) | High-performance, local-first RSS and Atom reader built for speed, privacy and clean reading. |
| 🚀&nbsp;[**CyberLauncher**](https://github.com/CyberGems/CyberLauncher#readme) | Windows application launcher with hot corners, scheduler, system monitor and integrated terminal. |
| 💻&nbsp;[**CyberManager**](https://github.com/CyberGems/CyberManager#readme) | Lightweight, high-performance task manager, virtualized and NT-native, a powerful Task Manager alternative. |
| 📝&nbsp;[**CyberNotes**](https://github.com/CyberGems/CyberNotes#readme) | Privacy-focused note-taking app with rich text, folders, tabs and bcrypt-protected local storage. |
| ⚡&nbsp;[**CyberPaste**](https://github.com/CyberGems/CyberPaste#readme) | Privacy-first clipboard manager for text, code, images, HTML and files. |
| 📸&nbsp;[**CyberSnap**](https://github.com/CyberGems/CyberSnap#readme) | Screen capture and annotation suite with vector tools, high-speed OCR, screen recording and color picker. |
| ⭐&nbsp;[**CyberTray**](https://github.com/CyberGems/CyberTray#readme) | High-performance tray launcher with hotspots, system monitoring, process manager and PIN-protected file vault. |
| 💫&nbsp;[**CyberViewer**](https://github.com/CyberGems/CyberViewer#readme) | Full-featured image viewer and editor engineered for casual and power users. |
| 🛡️&nbsp;[**CyberWall**](https://github.com/CyberGems/CyberWall#readme) | User-friendly Windows firewall with real-time per-app rules powered by the WFP kernel engine. |

➡️ **[Browse all apps at cybergems.org](https://cybergems.org)**
