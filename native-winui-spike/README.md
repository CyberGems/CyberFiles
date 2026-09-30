# WinUI file pane spike

This isolated proof of concept evaluates a Windows-native CyberFiles explorer using C#, XAML, and WinUI 3.

The window has two reusable file panes. Each pane has independent navigation history, path entry, filtering, sorting, selection, and direct-child counts. It indexes direct child names and types on a background task, reports the exact observed direct-child count, and loads file size and modification metadata in batches of 72 rows as the user scrolls. The WinUI ListView also virtualizes visible row containers. Double-clicking a folder navigates within that pane.

This is a focused architecture spike, not a CyberFiles rewrite. The compact name/type index for a complete direct directory remains in memory so exact counts, filtering, and alphabetical sorting work across all entries. Visible rows load in pages of 72, with the next page prefetched at least 900 device-independent pixels before the current scroll edge. Sorting by size or modification time currently reads metadata for the entire directory. The prototype does not yet implement random-access data virtualization, filesystem watching, thumbnails, archive previews, or integration with CyberFiles settings and saved sessions.

The two pane headers provide directional Copy and Move actions for selected entries. Operations enter one sequential in-memory queue, display the current source, destination, and aggregate progress, and can cancel either the active item or the full queue. The activity center opens when work starts, hides four seconds after the queue finishes unless pinned, and remains available from the window header. It previews the active item and up to four queued items, and keeps the ten most recent transfer and direct-action results with a Clear Recent action. Each pane also supports folder creation, renaming, sending selected entries to the Windows Recycle Bin after confirmation, and opening files with their registered Windows application. Enter and double-click open the selected entry, F2 renames it, and Delete asks for Recycle Bin confirmation. These short actions update the pane status and recent history, but execute immediately rather than entering the transfer queue. New names reject invalid Windows filename characters, trailing dots or spaces, and reserved device names. Existing destination names are never overwritten. Folder copies make a memory-bounded scan to estimate byte progress, then recurse through regular files and directories; they stop when they encounter a symbolic link or other reparse point. Copied files use destination defaults and do not preserve source timestamps, ACLs, or alternate data streams. Same-volume folder moves use a directory rename. Cross-volume file moves copy first and remove the source only after the copy succeeds. Cross-volume folder moves are not supported yet. If a copy is cancelled or fails after creating destination entries, partial output can remain and should be reviewed before retrying. The queue, pin state, and recent history are lost when the prototype closes.

## Build

From this directory, run the following commands:

- dotnet restore
- dotnet build

The app is unpackaged and uses the Windows App SDK package referenced by the project.

To open a specific folder, pass it after the run separator: dotnet run --no-build -- C:\path\to\folder

## Initial measurement

Before metadata paging was added, a local baseline loaded a temporary folder containing 10,000 empty files and 1,000 empty folders (11,000 direct entries). Enumeration, metadata row mapping, sorting, and assigning the result to the virtualized list took 2,298 ms. The process working set immediately after loading was about 139 MiB, including the Windows App SDK and WinUI runtime. The paged version has not been benchmarked yet.

This is one local baseline, not a performance guarantee. The user manually confirmed that the prior dual-pane build opened and showed exact counts. The latest paging behavior, row styling, and queued file operations still need a hands-on review in the running WinUI environment.
