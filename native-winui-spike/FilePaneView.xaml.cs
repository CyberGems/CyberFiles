using System.Collections.ObjectModel;
using System.Diagnostics;
using System.Globalization;
using Microsoft.VisualBasic.FileIO;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using Windows.System;

namespace CyberFiles.WinUIPrototype;

public sealed partial class FilePaneView : UserControl
{
    private readonly Stack<string> _backHistory = new();
    private readonly CultureInfo _culture = CultureInfo.CurrentCulture;
    private List<FileEntryDescriptor> _allEntries = [];
    private List<FileRow> _allRows = [];
    private IReadOnlyList<FileEntryDescriptor> _filteredEntries = [];
    private ObservableCollection<FileRowDisplay> _visibleRows = [];
    private ScrollViewer? _listScrollViewer;
    private CancellationTokenSource? _loadCancellation;
    private string _currentPath = string.Empty;
    private bool _isSpanish = true;
    private bool _isLoading;
    private bool _uiReady;
    private bool _suppressSortSelectionChanged;
    private bool _hasLoadedDirectory;
    private bool _isPagedView;
    private bool _isLoadingPage;
    private int _nextEntryIndex;
    private int _totalCount;
    private int _fileCount;
    private int _folderCount;
    private int _unclassifiedCount;
    private int _viewGeneration;

    public event EventHandler? PaneActivated;
    public event EventHandler? SelectionUpdated;
    public event EventHandler? DirectoryChanged;

    public string CurrentPath => _currentPath;
    public bool IsLoading => _isLoading;

    public IReadOnlyList<string> SelectedPaths => EntryList.SelectedItems
        .OfType<FileRowDisplay>()
        .Where(row => !row.Unavailable)
        .Select(row => row.FullPath)
        .ToArray();

    public FilePaneView()
    {
        InitializeComponent();
        TextInputContextMenu.Attach(PathBox, () => _isSpanish);
        TextInputContextMenu.Attach(FilterBox, () => _isSpanish);
        _uiReady = true;
        ApplyLanguage();
    }

    public void SetLanguage(bool isSpanish)
    {
        _isSpanish = isSpanish;
        ApplyLanguage();
    }

    public Task LoadInitialPathAsync(string path) => LoadPathAsync(path, addHistory: false);

    public Task RefreshCurrentPathAsync() => string.IsNullOrWhiteSpace(_currentPath)
        ? Task.CompletedTask
        : LoadPathAsync(_currentPath, addHistory: false);

    public Task NavigateToPathAsync(string path) => LoadPathAsync(path, addHistory: true);

    private void ApplyLanguage()
    {
        var sortIndex = SortBox.SelectedIndex < 0 ? 0 : SortBox.SelectedIndex;
        RefreshButton.Content = _isSpanish ? "Actualizar" : "Refresh";
        OpenButton.Content = _isSpanish ? "Abrir" : "Open";
        CancelButton.Content = _isSpanish ? "Cancelar" : "Cancel";
        PathBox.PlaceholderText = _isSpanish ? "Escribe o pega una ruta..." : "Enter or paste a path...";
        FilterBox.PlaceholderText = _isSpanish ? "Filtrar por nombre..." : "Filter by name...";
        NewFolderButton.Content = _isSpanish ? "Nueva carpeta" : "New folder";
        RenameButton.Content = _isSpanish ? "Renombrar" : "Rename";
        DeleteButton.Content = _isSpanish ? "Papelera" : "Recycle bin";
        NameHeader.Text = _isSpanish ? "NOMBRE" : "NAME";
        TypeHeader.Text = _isSpanish ? "TIPO" : "TYPE";
        SizeHeader.Text = _isSpanish ? "TAMAÑO" : "SIZE";
        ModifiedHeader.Text = _isSpanish ? "MODIFICADO" : "MODIFIED";

        _suppressSortSelectionChanged = true;
        SortBox.Items.Clear();
        SortBox.Items.Add(_isSpanish ? "Nombre: A-Z" : "Name: A-Z");
        SortBox.Items.Add(_isSpanish ? "Nombre: Z-A" : "Name: Z-A");
        SortBox.Items.Add(_isSpanish ? "Tamaño: mayor primero" : "Size: largest first");
        SortBox.Items.Add(_isSpanish ? "Modificado: reciente" : "Modified: newest");
        SortBox.SelectedIndex = Math.Clamp(sortIndex, 0, SortBox.Items.Count - 1);
        _suppressSortSelectionChanged = false;

        if (_hasLoadedDirectory)
            _ = ApplyViewAsync();
        UpdateSelectionCount();
    }

    private async Task LoadPathAsync(string requestedPath, bool addHistory)
    {
        var path = requestedPath.Trim().Trim('"');
        if (!Path.IsPathFullyQualified(path))
        {
            SetStatus(_isSpanish ? "La ruta debe ser absoluta." : "Enter an absolute path.");
            return;
        }

        string fullPath;
        try
        {
            fullPath = Path.GetFullPath(path);
        }
        catch (Exception ex)
        {
            SetStatus(ex.Message);
            return;
        }

        if (!Directory.Exists(fullPath))
        {
            SetStatus(_isSpanish ? "No se encontró la carpeta o no tienes acceso." : "Folder not found or access denied.");
            return;
        }

        if (addHistory && !string.IsNullOrEmpty(_currentPath) &&
            !string.Equals(_currentPath, fullPath, StringComparison.OrdinalIgnoreCase))
            _backHistory.Push(_currentPath);

        _loadCancellation?.Cancel();
        _loadCancellation?.Dispose();
        _loadCancellation = new CancellationTokenSource();
        var cancellation = _loadCancellation;
        _isPagedView = false;

        _isLoading = true;
        UpdateNavigationButtons();
        EntryList.SelectedItems.Clear();
        SelectionUpdated?.Invoke(this, EventArgs.Empty);
        CancelButton.IsEnabled = true;
        SetStatus(_isSpanish ? "Leyendo la carpeta..." : "Reading folder...");
        CountText.Text = _isSpanish ? "Contando elementos..." : "Counting items...";
        PathBox.Text = fullPath;

        try
        {
            var result = await Task.Run(() => ReadDirectoryIndex(fullPath, cancellation.Token), cancellation.Token);
            if (cancellation.IsCancellationRequested)
                return;

            _currentPath = fullPath;
            DirectoryChanged?.Invoke(this, EventArgs.Empty);
            var entries = result.Entries;
            _allEntries = entries;
            _totalCount = result.Total;
            _fileCount = result.Files;
            _folderCount = result.Folders;
            _unclassifiedCount = result.Unclassified;
            _allRows = [];
            _hasLoadedDirectory = true;

            if (SortBox.SelectedIndex >= 2)
                _allRows = await Task.Run(() => ReadRows(fullPath, entries, cancellation.Token), cancellation.Token);

            if (cancellation.IsCancellationRequested)
                return;

            await ApplyViewAsync();
            CountText.Text = _isSpanish
                ? _totalCount.ToString("N0", _culture) + " elementos (" +
                  _fileCount.ToString("N0", _culture) + " archivos · " +
                  _folderCount.ToString("N0", _culture) + " carpetas)"
                : _totalCount.ToString("N0", _culture) + " items (" +
                  _fileCount.ToString("N0", _culture) + " files · " +
                  _folderCount.ToString("N0", _culture) + " folders)";

            if (_unclassifiedCount > 0)
            {
                SetStatus(_isSpanish
                    ? _unclassifiedCount.ToString("N0", _culture) + " elementos no permitieron leer sus atributos."
                    : _unclassifiedCount.ToString("N0", _culture) + " items could not expose their attributes.");
            }
            else
            {
                SetStatus(_isSpanish ? "Carpeta cargada." : "Folder loaded.");
            }
        }
        catch (OperationCanceledException)
        {
            if (ReferenceEquals(_loadCancellation, cancellation))
                SetStatus(_isSpanish ? "Lectura cancelada." : "Reading cancelled.");
        }
        catch (Exception ex)
        {
            if (!ReferenceEquals(_loadCancellation, cancellation))
                return;

            _allEntries = [];
            _allRows = [];
            _hasLoadedDirectory = false;
            _totalCount = 0;
            _fileCount = 0;
            _folderCount = 0;
            _unclassifiedCount = 0;
            EntryList.ItemsSource = null;
            CountText.Text = _isSpanish ? "No se pudo obtener el conteo." : "Could not count items.";
            SetStatus(ex.Message);
        }
        finally
        {
            if (ReferenceEquals(_loadCancellation, cancellation))
            {
                _isLoading = false;
                CancelButton.IsEnabled = false;
                UpdateNavigationButtons();
                UpdateSelectionCount();
            }
        }
    }

    private static DirectoryIndexResult ReadDirectoryIndex(string path, CancellationToken cancellationToken)
    {
        var entries = new List<FileEntryDescriptor>();
        var fileCount = 0;
        var folderCount = 0;
        var unclassifiedCount = 0;
        var totalCount = 0;

        foreach (var entryPath in Directory.EnumerateFileSystemEntries(path))
        {
            cancellationToken.ThrowIfCancellationRequested();
            totalCount++;

            bool isFolder;
            try
            {
                isFolder = (File.GetAttributes(entryPath) & FileAttributes.Directory) != 0;
                if (isFolder)
                    folderCount++;
                else
                    fileCount++;
            }
            catch
            {
                unclassifiedCount++;
                entries.Add(new FileEntryDescriptor(Path.GetFileName(entryPath), false, true));
                continue;
            }

            entries.Add(new FileEntryDescriptor(Path.GetFileName(entryPath), isFolder, false));
        }

        return new DirectoryIndexResult(entries, totalCount, fileCount, folderCount, unclassifiedCount);
    }

    private static List<FileRow> ReadRows(
        string directory,
        IReadOnlyList<FileEntryDescriptor> entries,
        CancellationToken cancellationToken)
    {
        var rows = new List<FileRow>(entries.Count);
        foreach (var entry in entries)
        {
            cancellationToken.ThrowIfCancellationRequested();
            rows.Add(ReadRow(directory, entry));
        }

        return rows;
    }

    internal static FileRow ReadRow(string directory, FileEntryDescriptor entry)
    {
        var fullPath = Path.Combine(directory, entry.Name);
        if (entry.Unavailable)
            return FileRow.CreateUnavailable(fullPath);

        long? size = null;
        DateTime? modified = null;
        try
        {
            var info = entry.IsFolder ? (FileSystemInfo)new DirectoryInfo(fullPath) : new FileInfo(fullPath);
            modified = info.LastWriteTime;
            if (!entry.IsFolder)
                size = ((FileInfo)info).Length;
        }
        catch
        {
            // Keep the indexed entry when optional metadata is unavailable.
        }

        return new FileRow(fullPath, entry.IsFolder, size, modified, unavailable: false);
    }

    private async Task ApplyViewAsync()
    {
        if (!_hasLoadedDirectory)
            return;

        var generation = Interlocked.Increment(ref _viewGeneration);
        var query = FilterBox.Text?.Trim() ?? string.Empty;
        var sortIndex = SortBox.SelectedIndex;
        var isSpanish = _isSpanish;
        var culture = _culture;

        if (SortBox.SelectedIndex >= 2)
        {
            var materializedRows = _allRows;
            var displayRows = await Task.Run(() =>
            {
                IEnumerable<FileRow> rows = materializedRows;
                if (!string.IsNullOrEmpty(query))
                    rows = rows.Where(row => row.Name.Contains(query, StringComparison.CurrentCultureIgnoreCase));

                rows = sortIndex switch
                {
                    2 => rows.OrderByDescending(row => row.IsFolder).ThenByDescending(row => row.SortSize),
                    _ => rows.OrderByDescending(row => row.IsFolder).ThenByDescending(row => row.SortModified),
                };
                return rows.Select(row => row.ToDisplay(isSpanish, culture)).ToList();
            });

            if (generation != _viewGeneration)
                return;

            _isPagedView = false;
            EntryList.ItemsSource = displayRows;
            UpdateSelectionCount();
            return;
        }

        var allEntries = _allEntries;
        var filteredEntries = await Task.Run(() =>
        {
            IEnumerable<FileEntryDescriptor> filtered = allEntries;
            if (!string.IsNullOrEmpty(query))
                filtered = filtered.Where(entry => entry.Name.Contains(query, StringComparison.CurrentCultureIgnoreCase));

            filtered = sortIndex switch
            {
                1 => filtered.OrderByDescending(entry => entry.IsFolder).ThenBy(entry => entry.Unavailable).ThenByDescending(entry => entry.Name, StringComparer.CurrentCultureIgnoreCase),
                _ => filtered.OrderByDescending(entry => entry.IsFolder).ThenBy(entry => entry.Unavailable).ThenBy(entry => entry.Name, StringComparer.CurrentCultureIgnoreCase),
            };

            return filtered.ToList();
        });

        if (generation != _viewGeneration)
            return;

        _filteredEntries = filteredEntries;
        _visibleRows = [];
        _nextEntryIndex = 0;
        _isPagedView = true;
        EntryList.ItemsSource = _visibleRows;
        if (_listScrollViewer is not null)
            _ = LoadNextPageAsync();
        UpdateSelectionCount();
    }

    private void EntryList_Loaded(object sender, RoutedEventArgs e)
    {
        EntryList.ApplyTemplate();
        EntryList.UpdateLayout();
        _listScrollViewer ??= FindScrollViewer(EntryList);
        if (_listScrollViewer is not null)
        {
            _listScrollViewer.ViewChanged -= ListScrollViewer_ViewChanged;
            _listScrollViewer.ViewChanged += ListScrollViewer_ViewChanged;
        }

        if (_isPagedView)
            _ = LoadNextPageAsync();
    }

    private async void ListScrollViewer_ViewChanged(object? sender, ScrollViewerViewChangedEventArgs e)
    {
        if (_listScrollViewer is null || !_isPagedView)
            return;

        var remainingContent = _listScrollViewer.ExtentHeight -
            (_listScrollViewer.VerticalOffset + _listScrollViewer.ViewportHeight);
        var prefetchDistance = Math.Max(900, _listScrollViewer.ViewportHeight * 1.5);
        if (remainingContent < prefetchDistance)
            await LoadNextPageAsync();
    }

    private async Task LoadNextPageAsync()
    {
        if (!_isPagedView || _isLoadingPage || _nextEntryIndex >= _filteredEntries.Count)
            return;

        _isLoadingPage = true;
        var targetRows = _visibleRows;
        var targetEntries = _filteredEntries;
        var directory = _currentPath;
        var isSpanish = _isSpanish;
        var culture = _culture;
        var firstIndex = _nextEntryIndex;
        var pageEntries = targetEntries.Skip(firstIndex).Take(72).ToArray();
        var cancellationToken = _loadCancellation?.Token ?? CancellationToken.None;

        try
        {
            var pageRows = await Task.Run(() => pageEntries
                .Select(entry => FilePaneView.ReadRow(directory, entry).ToDisplay(isSpanish, culture))
                .ToList(), cancellationToken);

            if (cancellationToken.IsCancellationRequested || !ReferenceEquals(targetRows, _visibleRows))
                return;

            foreach (var row in pageRows)
                targetRows.Add(row);

            _nextEntryIndex += pageEntries.Length;
        }
        catch (OperationCanceledException)
        {
            // A new navigation or refresh replaced this page request.
        }
        finally
        {
            _isLoadingPage = false;
            if (_isPagedView && !ReferenceEquals(targetRows, _visibleRows))
                _ = LoadNextPageAsync();
        }
    }

    private static ScrollViewer? FindScrollViewer(DependencyObject parent)
    {
        var childCount = VisualTreeHelper.GetChildrenCount(parent);
        for (var index = 0; index < childCount; index++)
        {
            var child = VisualTreeHelper.GetChild(parent, index);
            if (child is ScrollViewer scrollViewer)
                return scrollViewer;

            var nestedScrollViewer = FindScrollViewer(child);
            if (nestedScrollViewer is not null)
                return nestedScrollViewer;
        }

        return null;
    }

    private async Task NavigateAsync(string path) => await LoadPathAsync(path, addHistory: true);

    private void UpdateNavigationButtons()
    {
        BackButton.IsEnabled = !_isLoading && _backHistory.Count > 0;
        UpButton.IsEnabled = !_isLoading && Directory.GetParent(_currentPath) is not null;
        OpenButton.IsEnabled = !_isLoading;
        RefreshButton.IsEnabled = !_isLoading;
        SortBox.IsEnabled = !_isLoading;
    }

    private void UpdateSelectionCount()
    {
        var selected = EntryList.SelectedItems.Count;
        SelectionText.Text = _isSpanish
            ? selected.ToString("N0", _culture) + " seleccionados"
            : selected.ToString("N0", _culture) + " selected";
        NewFolderButton.IsEnabled = !_isLoading && _hasLoadedDirectory;
        RenameButton.IsEnabled = !_isLoading && SelectedPaths.Count == 1;
        DeleteButton.IsEnabled = !_isLoading && SelectedPaths.Count > 0;
        SelectionUpdated?.Invoke(this, EventArgs.Empty);
    }

    private void SetStatus(string value) => StatusText.Text = value;

    private void ActivatePane() => PaneActivated?.Invoke(this, EventArgs.Empty);

    private async void Open_Click(object sender, RoutedEventArgs e) => await NavigateAsync(PathBox.Text);

    private async void PathBox_KeyDown(object sender, KeyRoutedEventArgs e)
    {
        if (e.Key == VirtualKey.Enter)
        {
            e.Handled = true;
            await NavigateAsync(PathBox.Text);
        }
    }

    private async void Back_Click(object sender, RoutedEventArgs e)
    {
        if (_backHistory.Count > 0)
            await LoadPathAsync(_backHistory.Pop(), addHistory: false);
    }

    private async void Up_Click(object sender, RoutedEventArgs e)
    {
        var parent = Directory.GetParent(_currentPath);
        if (parent is not null)
            await NavigateAsync(parent.FullName);
    }

    private async void Refresh_Click(object sender, RoutedEventArgs e)
    {
        if (!string.IsNullOrEmpty(_currentPath))
            await LoadPathAsync(_currentPath, addHistory: false);
    }

    private void Cancel_Click(object sender, RoutedEventArgs e)
    {
        if (_isLoading)
            _loadCancellation?.Cancel();
    }

    private async void EntryList_DoubleTapped(object sender, DoubleTappedRoutedEventArgs e)
    {
        await OpenSelectedAsync();
    }

    private async void EntryList_KeyDown(object sender, KeyRoutedEventArgs e)
    {
        switch (e.Key)
        {
            case VirtualKey.Enter:
                e.Handled = true;
                await OpenSelectedAsync();
                break;
            case VirtualKey.F2:
                e.Handled = true;
                await RenameSelectedAsync();
                break;
            case VirtualKey.Delete:
                e.Handled = true;
                await SendSelectedToRecycleBinAsync();
                break;
        }
    }

    private async Task OpenSelectedAsync()
    {
        if (EntryList.SelectedItem is not FileRowDisplay row || row.Unavailable)
            return;

        if (row.IsFolder)
        {
            await NavigateAsync(row.FullPath);
            return;
        }

        try
        {
            Process.Start(new ProcessStartInfo(row.FullPath) { UseShellExecute = true });
            SetStatus(_isSpanish ? "Archivo abierto con la aplicación predeterminada." : "Opened with the default application.");
        }
        catch (Exception ex)
        {
            SetStatus((_isSpanish ? "No se pudo abrir el archivo: " : "Could not open the file: ") + ex.Message);
        }
    }

    private async void NewFolder_Click(object sender, RoutedEventArgs e) => await CreateFolderAsync();

    private async Task CreateFolderAsync()
    {
        var name = await PromptForNameAsync(
            _isSpanish ? "Crear carpeta" : "Create folder",
            _isSpanish ? "Nombre de la carpeta" : "Folder name",
            string.Empty,
            _isSpanish ? "Crear" : "Create");
        if (name is null)
            return;

        if (!TryGetSafeLeafName(name, out var validationMessage))
        {
            SetStatus(validationMessage);
            return;
        }

        var targetPath = Path.Combine(_currentPath, name);
        try
        {
            if (File.Exists(targetPath) || Directory.Exists(targetPath))
            {
                SetStatus(_isSpanish ? "Ya existe un elemento con ese nombre." : "An item with that name already exists.");
                return;
            }

            Directory.CreateDirectory(targetPath);
            await RefreshCurrentPathAsync();
            SetStatus(_isSpanish ? "Carpeta creada." : "Folder created.");
        }
        catch (Exception ex)
        {
            SetStatus((_isSpanish ? "No se pudo crear la carpeta: " : "Could not create the folder: ") + ex.Message);
        }
    }

    private async void Rename_Click(object sender, RoutedEventArgs e) => await RenameSelectedAsync();

    private async Task RenameSelectedAsync()
    {
        var selected = SelectedPaths;
        if (selected.Count != 1)
            return;

        var sourcePath = selected[0];
        var currentName = Path.GetFileName(Path.TrimEndingDirectorySeparator(sourcePath));
        var newName = await PromptForNameAsync(
            _isSpanish ? "Renombrar elemento" : "Rename item",
            _isSpanish ? "Nuevo nombre" : "New name",
            currentName,
            _isSpanish ? "Renombrar" : "Rename");
        if (newName is null || string.Equals(currentName, newName, StringComparison.Ordinal))
            return;

        if (!TryGetSafeLeafName(newName, out var validationMessage))
        {
            SetStatus(validationMessage);
            return;
        }

        var parentPath = Path.GetDirectoryName(sourcePath);
        if (string.IsNullOrEmpty(parentPath))
            return;

        var destinationPath = Path.Combine(parentPath, newName);
        try
        {
            if (File.Exists(destinationPath) || Directory.Exists(destinationPath))
            {
                SetStatus(_isSpanish ? "Ya existe un elemento con ese nombre." : "An item with that name already exists.");
                return;
            }

            if (Directory.Exists(sourcePath))
                Directory.Move(sourcePath, destinationPath);
            else
                File.Move(sourcePath, destinationPath);

            await RefreshCurrentPathAsync();
            SetStatus(_isSpanish ? "Elemento renombrado." : "Item renamed.");
        }
        catch (Exception ex)
        {
            SetStatus((_isSpanish ? "No se pudo renombrar: " : "Could not rename: ") + ex.Message);
        }
    }

    private async void Delete_Click(object sender, RoutedEventArgs e) => await SendSelectedToRecycleBinAsync();

    private async Task SendSelectedToRecycleBinAsync()
    {
        var selected = SelectedPaths;
        if (selected.Count == 0)
            return;

        var preview = string.Join(Environment.NewLine, selected.Take(6).Select(Path.GetFileName));
        if (selected.Count > 6)
            preview += Environment.NewLine + (_isSpanish ? $"y {selected.Count - 6} más…" : $"and {selected.Count - 6} more…");

        var confirmation = new ContentDialog
        {
            XamlRoot = XamlRoot,
            Title = _isSpanish ? "Enviar a la Papelera de reciclaje" : "Move to Recycle Bin",
            Content = new StackPanel
            {
                Spacing = 8,
                Children =
                {
                    new TextBlock
                    {
                        Text = _isSpanish
                            ? $"Se moverán {selected.Count} elemento(s) a la Papelera de reciclaje. Podrás restaurarlos desde allí."
                            : $"{selected.Count} item(s) will be moved to the Recycle Bin, where you can restore them.",
                        TextWrapping = TextWrapping.Wrap,
                    },
                    new TextBlock { Text = preview, TextWrapping = TextWrapping.Wrap, Foreground = new SolidColorBrush(Microsoft.UI.Colors.DarkGray) },
                },
            },
            PrimaryButtonText = _isSpanish ? "Enviar a la Papelera" : "Move to Recycle Bin",
            CloseButtonText = _isSpanish ? "Cancelar" : "Cancel",
            DefaultButton = ContentDialogButton.Close,
        };

        if (await confirmation.ShowAsync() != ContentDialogResult.Primary)
            return;

        var succeeded = 0;
        var failures = new List<string>();
        foreach (var path in selected)
        {
            try
            {
                if (Directory.Exists(path))
                    FileSystem.DeleteDirectory(path, UIOption.OnlyErrorDialogs, RecycleOption.SendToRecycleBin);
                else if (File.Exists(path))
                    FileSystem.DeleteFile(path, UIOption.OnlyErrorDialogs, RecycleOption.SendToRecycleBin);
                else
                {
                    failures.Add($"{Path.GetFileName(path)}: " + (_isSpanish ? "ya no existe" : "no longer exists"));
                    continue;
                }
                succeeded++;
            }
            catch (Exception ex)
            {
                failures.Add($"{Path.GetFileName(path)}: {ex.Message}");
            }
        }

        await RefreshCurrentPathAsync();
        if (failures.Count == 0)
        {
            SetStatus(_isSpanish
                ? $"{succeeded} elemento(s) enviado(s) a la Papelera."
                : $"{succeeded} item(s) moved to the Recycle Bin.");
        }
        else
        {
            SetStatus(_isSpanish
                ? $"{succeeded} enviado(s) a la Papelera; {failures.Count} no se pudieron mover."
                : $"{succeeded} moved to the Recycle Bin; {failures.Count} could not be moved.");
        }
    }

    private async Task<string?> PromptForNameAsync(string title, string label, string initialValue, string primaryAction)
    {
        var textBox = new TextBox { Text = initialValue, PlaceholderText = label };
        TextInputContextMenu.Attach(textBox, () => _isSpanish);
        textBox.Loaded += (_, _) =>
        {
            textBox.Focus(Microsoft.UI.Xaml.FocusState.Programmatic);
            textBox.SelectAll();
        };

        var dialog = new ContentDialog
        {
            XamlRoot = XamlRoot,
            Title = title,
            Content = textBox,
            PrimaryButtonText = primaryAction,
            CloseButtonText = _isSpanish ? "Cancelar" : "Cancel",
            DefaultButton = ContentDialogButton.Primary,
        };

        return await dialog.ShowAsync() == ContentDialogResult.Primary ? textBox.Text : null;
    }

    private bool TryGetSafeLeafName(string name, out string error)
    {
        if (string.IsNullOrWhiteSpace(name) || name is "." or ".." ||
            name.EndsWith(' ') || name.EndsWith('.') ||
            name.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0 ||
            !string.Equals(Path.GetFileName(name), name, StringComparison.Ordinal))
        {
            error = _isSpanish ? "Escribe un nombre de archivo o carpeta válido." : "Enter a valid file or folder name.";
            return false;
        }

        var deviceName = name.Split('.')[0];
        var isReservedDeviceName = deviceName.Equals("CON", StringComparison.OrdinalIgnoreCase) ||
            deviceName.Equals("PRN", StringComparison.OrdinalIgnoreCase) ||
            deviceName.Equals("AUX", StringComparison.OrdinalIgnoreCase) ||
            deviceName.Equals("NUL", StringComparison.OrdinalIgnoreCase) ||
            (deviceName.Length == 4 &&
             (deviceName.StartsWith("COM", StringComparison.OrdinalIgnoreCase) ||
              deviceName.StartsWith("LPT", StringComparison.OrdinalIgnoreCase)) &&
             deviceName[3] is >= '1' and <= '9');
        if (isReservedDeviceName)
        {
            error = _isSpanish ? "Ese nombre está reservado por Windows." : "That name is reserved by Windows.";
            return false;
        }

        error = string.Empty;
        return true;
    }

    private void EntryList_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (_uiReady)
            UpdateSelectionCount();
    }

    private void FilterBox_TextChanged(object sender, TextChangedEventArgs e)
    {
        if (_uiReady)
            _ = ApplyViewAsync();
    }

    private void SortBox_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (!_uiReady || _suppressSortSelectionChanged || SortBox.SelectedIndex < 0)
            return;

        if (_hasLoadedDirectory && SortBox.SelectedIndex >= 2)
            _ = LoadPathAsync(_currentPath, addHistory: false);
        else
            _ = ApplyViewAsync();
    }

    private void Pane_GotFocus(object sender, RoutedEventArgs e) => ActivatePane();

    private void Pane_PointerPressed(object sender, PointerRoutedEventArgs e) => ActivatePane();
}

public sealed class FileRow
{
    public string FullPath { get; }
    public string Name { get; }
    public string Extension { get; }
    public bool IsFolder { get; }
    public bool Unavailable { get; }
    public long? SortSize { get; }
    public long SortModified { get; }
    private readonly DateTime? _modified;

    public string Glyph => Unavailable ? "\uE783" : IsFolder ? "\uE8B7" : "\uE8A5";
    public Microsoft.UI.Xaml.Media.Brush IconBrush => IsFolder
        ? new Microsoft.UI.Xaml.Media.SolidColorBrush(Microsoft.UI.Colors.Gold)
        : new Microsoft.UI.Xaml.Media.SolidColorBrush(Microsoft.UI.Colors.LightSkyBlue);

    public FileRow(string path, bool isFolder, long? size, DateTime? modified, bool unavailable)
    {
        FullPath = path;
        Name = Path.GetFileName(path);
        Extension = Path.GetExtension(path);
        IsFolder = isFolder;
        SortSize = size;
        _modified = modified;
        SortModified = modified?.Ticks ?? 0;
        Unavailable = unavailable;
    }

    private FileRow(string path)
    {
        FullPath = path;
        Name = Path.GetFileName(path);
        Extension = Path.GetExtension(path);
        IsFolder = false;
        Unavailable = true;
    }

    public static FileRow CreateUnavailable(string path) => new(path);

    public FileRowDisplay ToDisplay(bool spanish, CultureInfo culture)
    {
        var kind = Unavailable
            ? (spanish ? "Sin acceso" : "Unavailable")
            : IsFolder
                ? (spanish ? "Carpeta" : "Folder")
                : string.IsNullOrEmpty(Extension)
                    ? (spanish ? "Archivo" : "File")
                    : Extension.TrimStart('.').ToUpper(culture);

        var size = IsFolder || !SortSize.HasValue ? "—" : FormatSize(SortSize.Value, culture);
        var modified = _modified.HasValue ? _modified.Value.ToString("g", culture) : "—";
        return new FileRowDisplay(this, kind, size, modified);
    }

    private static string FormatSize(long bytes, CultureInfo culture)
    {
        if (bytes < 1024)
            return bytes.ToString("N0", culture) + " B";

        string[] units = ["KB", "MB", "GB", "TB", "PB"];
        double size = bytes;
        var unitIndex = -1;
        do
        {
            size /= 1024;
            unitIndex++;
        } while (size >= 1024 && unitIndex < units.Length - 1);

        return size.ToString("0.##", culture) + " " + units[unitIndex];
    }
}

public sealed record FileRowDisplay(FileRow Source, string Kind, string Size, string Modified)
{
    public string FullPath => Source.FullPath;
    public string Name => Source.Name;
    public string Glyph => Source.Glyph;
    public Microsoft.UI.Xaml.Media.Brush IconBrush => Source.IconBrush;
    public bool IsFolder => Source.IsFolder;
    public bool Unavailable => Source.Unavailable;
    public long? SortSize => Source.SortSize;
    public long SortModified => Source.SortModified;
}

public sealed record FileEntryDescriptor(string Name, bool IsFolder, bool Unavailable);

public sealed record DirectoryIndexResult(
    List<FileEntryDescriptor> Entries,
    int Total,
    int Files,
    int Folders,
    int Unclassified);
