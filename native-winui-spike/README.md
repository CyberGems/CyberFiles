# WinUI file pane spike

This isolated proof of concept evaluates a Windows-native CyberFiles explorer using C#, XAML, and WinUI 3.

The window has two reusable file panes. Each pane has independent navigation history, path entry, filtering, sorting, selection, and direct-child counts. It indexes direct child names and types on a background task, reports the exact observed direct-child count, and loads file size and modification metadata in batches of 72 rows as the user scrolls. The WinUI ListView also virtualizes visible row containers. Double-clicking a folder navigates within that pane.

This is a focused architecture spike, not a CyberFiles rewrite. The compact name/type index for a complete direct directory remains in memory so exact counts, filtering, and alphabetical sorting work across all entries. Sorting by size or modification time currently reads metadata for the entire directory. The prototype does not yet implement random-access data virtualization, filesystem watching, thumbnails, archive previews, file operations, or integration with CyberFiles settings and saved sessions.

## Build

From this directory, run the following commands:

- dotnet restore
- dotnet build

The app is unpackaged and uses the Windows App SDK package referenced by the project.

To open a specific folder, pass it after the run separator: dotnet run --no-build -- C:\path\to\folder

## Initial measurement

Before metadata paging was added, a local baseline loaded a temporary folder containing 10,000 empty files and 1,000 empty folders (11,000 direct entries). Enumeration, metadata row mapping, sorting, and assigning the result to the virtualized list took 2,298 ms. The process working set immediately after loading was about 139 MiB, including the Windows App SDK and WinUI runtime. The paged version has not been benchmarked yet.

This is one local baseline, not a performance guarantee. The user manually confirmed that the prior dual-pane build opened and showed exact counts. The new paging behavior and row styling still need a hands-on review in the running WinUI environment.
