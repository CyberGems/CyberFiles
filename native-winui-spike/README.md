# WinUI file pane spike

This isolated proof of concept evaluates a Windows-native CyberFiles explorer using C#, XAML, and WinUI 3.

The window has two reusable file panes. Each pane has independent navigation history, path entry, filtering, sorting, selection, and direct-child counts. It enumerates directory entries on a background task, reports the exact observed direct-child count, and presents rows in a WinUI ListView with a virtualizing ItemsStackPanel. Rows include names, item types, file sizes, and modified dates. Double-clicking a folder navigates within that pane.

This is a focused architecture spike, not a CyberFiles rewrite. It currently loads metadata rows for the complete direct directory into memory. The WinUI list virtualizes visible row containers, but the prototype does not yet implement data virtualization, filesystem watching, thumbnails, archive previews, file operations, or integration with CyberFiles settings and saved sessions. The two panes establish a native browsing foundation before those workflows are ported.

## Build

From this directory, run the following commands:

- dotnet restore
- dotnet build

The app is unpackaged and uses the Windows App SDK package referenced by the project.

To open a specific folder, pass it after the run separator: dotnet run --no-build -- C:\path\to\folder

## Initial measurement

On the development machine, the prototype loaded a temporary folder containing 10,000 empty files and 1,000 empty folders (11,000 direct entries). Enumeration, row mapping, sorting, and assigning the result to the virtualized list took 2,298 ms. The process working set immediately after loading was about 139 MiB, including the Windows App SDK and WinUI runtime.

This is one local measurement, not a performance guarantee. The desktop automation surface in this session did not expose native windows, so visual scrolling and selection were not verified. The source is ready for a hands-on review in the running WinUI environment.
