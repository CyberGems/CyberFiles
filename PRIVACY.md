# Privacy — CyberFiles

CyberFiles runs on your PC and keeps your data on your PC. It has **no account, no telemetry, no analytics SDK and no ads**. It never sends your paths, view preferences or backups to its author or to anyone else.

Everything it knows (paths, view preferences or backups) stays in `%APPDATA%\com.cybergems.cyberfiles\` (JSON configuration). Portable builds keep everything in `CyberFiles_Data\config` next to the executable. The installer includes a **Delete app data** checkbox. Portable builds store their data next to the executable.

## When CyberFiles goes online

These are all the connections CyberFiles makes by itself. None of them sends your paths, view preferences or backups. Like any request on the internet, the server sees your IP address.

| When | Where | What for | How to turn it off |
|---|---|---|---|
| On startup and every 6 hours | `raw.githubusercontent.com` (signed update manifest) | Check for a newer version | Toggle in About → Automatic update checks (`cyberfiles_auto_check_updates_v1`); portable builds disable the updater |

Opening a network location or SMB share happens only when you choose it.

CyberFiles is an alpha pre-release. Details may change before the first stable release.

## What CyberFiles reads on your PC

CyberFiles reads the folders and paths you enter in the app. That information stays on your screen. Anything that changes the system asks for confirmation first and, where possible, is backed up so it can be undone.

## Questions

Open an issue: https://github.com/CyberGems/CyberFiles/issues

For a privacy-specific question, use the [contact page](https://cybergems.org/contact). The suite-wide statement is at [cybergems.org/privacy](https://cybergems.org/privacy).
