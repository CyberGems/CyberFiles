# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.7.0] - 2026-11-10

### Added
- Network drive support: browse LAN devices and SMB shares, navigate UNC paths, map and disconnect network drives, and authenticate with a native credentials dialog.
- Windows environment variables in folder paths (for example %APPDATA%), resolved at navigation time.
- Keyboard navigation for context menus and tab menus: arrow keys, anchored submenu flyouts, radio items, horizontal band navigation, and Space to activate menu items.
- Operations badge on the status bar button counting completed and failed operations since the last review, resetting when the operations center is opened, with a setting to turn the completed count off (on by default).
- Lister text size setting with scaled rows and headers, plus command palette commands for it.
- Configurable toast duration, hover pause, and a close button on toasts.
- Terminal launcher and flat view commands in the command palette.
- Offer to return to the previous folder when a removed drive reconnects.

### Changed
- Compacted toolbar: merged view controls into a dropdown, overflow menu portal, and group collapsing measured from the window size.
- Command bar hugs its controls with refined split hover and category separators.
- Simplified the unsaved changes dialog to a Cancel prompt with an Esc hint.
- Startup panel and column preferences are no longer overridden by the layout profile, and legacy migration profiles are named in the stored language.
- Space now selects or deselects the focused item instead of toggling the properties panel (F3 keeps the panel), and the shortcuts modal documents both.

### Fixed
- Logical drive changes are watched automatically, tabs left on removed drives recover or return to This PC, stale session paths are sanitized, and Quick Access or recent folders on missing drives are marked offline.
- Removed the gap between the top tab strip and the navigation bar so tabs connect with the address bar block.
- Kept the batch rename modal open when a rename is rejected, localized its interface, and aligned filename validation with the backend.
- Hardened native folder listing, bounded flat view scans, and decoded legacy text previews.
- Set a main window background color to prevent the startup flash and fixed the squashed NSIS header icon.
- Do not force the properties panel open when opening a file, and polished Details view column headers and the extension column.

## [0.6.3] - 2026-10-29

### Added
- Search modal search preservation preference with prompt on close ("Keep", "Discard", and "Remember decision" options).
- Backdrop click dismiss support for search modal.
- Operations Center placement on the far right of the status bar, tracking create, rename, delete, restore, and undo operations with dedicated `Ctrl+J` shortcut.
- Modern lister context menu header with Windows 11 style quick-action buttons (Cut, Copy, Rename, Delete).
- Address bar empty area right-click support to directly enter edit mode and open context menu.

### Changed
- Converted search modal input evaluation to concurrent `useDeferredValue` queries with windowed batch rendering and precompiled regexes for zero-latency keystroke response.
- Stabilized search modal layout height to prevent vertical jumping between empty and populated result states.
- Enhanced search scope labels to distinguish current folder count and multi-tab item totals with clear iconography.

### Fixed
- Fixed React hook call order in search modal by moving modal open guard past all hook invocations.
- Fixed elevated Administrator terminal launches to preserve current directory context.
- Fixed context menu viewport clamping to prevent off-screen overflow.

## [0.6.2] - 2026-10-28

### Fixed
- Fixed frameless window minimization and taskbar persistence.
- Repaired window hiding on maximize or restore.
- Aligned sidebar collapsible section header hover colors with theme tokens.
- Ensured reliable background system tray icon registration.

## [0.6.1] - 2026-10-26

### Added
- Windows Explorer context menu integration and startup preferences.
- Second-instance window activation.

### Fixed
- Fixed application state initialization before window creation to resolve launch crashes in installed builds.

## [0.6.0] - 2026-10-24

### Added
- Recents section, dual pane visual refinements, and configurable deletion policies.

