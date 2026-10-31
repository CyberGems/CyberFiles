# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

