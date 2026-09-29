using System.Globalization;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Windows.System;

namespace CyberFiles.WinUIPrototype;

public sealed partial class MainWindow : Window
{
    private readonly Stack<string> _backHistory = new();
    private readonly CultureInfo _culture = CultureInfo.CurrentCulture;
    private List<FileRow> _allRows = [];
    private CancellationTokenSource? _loadCancellation;
    private string _currentPath = string.Empty;
    private bool _isSpanish = true;
    private bool _isLoading;
    private bool _uiReady;

    public MainWindow(string initialPath)
    {
        InitializeComponent();
        _uiReady = true;
        ApplyLanguage();
        SortBox.SelectedIndex = 0;
        _currentPath = initialPath;
        PathBox.Text = _currentPath;
        _ = LoadPathAsync(_currentPath, addHistory: false);
    }

    private void ApplyLanguage()
    {
        Title = _isSpanish ? "CyberFiles · Explorador nativo (prueba)" : "CyberFiles · Native Explorer (prototype)";
        NameHeader.Text = _isSpanish ? "NOMBRE" : "NAME";
        RefreshButton.Content = _isSpanish ? "Actualizar" : "Refresh";
        OpenButton.Content = _isSpanish ? "Abrir" : "Open";
        CancelButton.Content = _isSpanish ? "Cancelar" : "Cancel";
        PathBox.PlaceholderText = _isSpanish ? "Escribe o pega una ruta..." : "Enter or paste a path...";
        FilterBox.PlaceholderText = _isSpanish ? "Filtrar por nombre..." : "Filter by name...";
        TypeHeader.Text = _isSpanish ? "TIPO" : "TYPE";
        SizeHeader.Text = _isSpanish ? "TAMAÑO" : "SIZE";
        ModifiedHeader.Text = _isSpanish ? "MODIFICADO" : "MODIFIED";

        SortBox.Items.Clear();
        SortBox.Items.Add(_isSpanish ? "Nombre: A-Z" : "Name: A-Z");
        SortBox.Items.Add(_isSpanish ? "Nombre: Z-A" : "Name: Z-A");
        SortBox.Items.Add(_isSpanish ? "Tamaño: mayor primero" : "Size: largest first");
        SortBox.Items.Add(_isSpanish ? "Modificado: reciente" : "Modified: newest");
        SortBox.SelectedIndex = 0;

        if (_allRows.Count > 0)
            ApplyView();
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

        _isLoading = true;
        UpdateNavigationButtons();
        CancelButton.IsEnabled = true;
        SetStatus(_isSpanish ? "Leyendo la carpeta..." : "Reading folder...");
        CountText.Text = _isSpanish ? "Contando elementos..." : "Counting items...";
        PathBox.Text = fullPath;
        try
        {
            var result = await Task.Run(() => ReadDirectory(fullPath, cancellation.Token), cancellation.Token);
            if (cancellation.IsCancellationRequested)
                return;

            _currentPath = fullPath;
            _allRows = result.Rows;
            ApplyView();
            CountText.Text = _isSpanish
                ? result.Total.ToString("N0", _culture) + " elementos (" +
                  result.Files.ToString("N0", _culture) + " archivos · " +
                  result.Folders.ToString("N0", _culture) + " carpetas)"
                : result.Total.ToString("N0", _culture) + " items (" +
                  result.Files.ToString("N0", _culture) + " files · " +
                  result.Folders.ToString("N0", _culture) + " folders)";

            if (result.Unclassified > 0)
            {
                SetStatus(_isSpanish
                    ? result.Unclassified.ToString("N0", _culture) + " elementos no permitieron leer sus atributos."
                    : result.Unclassified.ToString("N0", _culture) + " items could not expose their attributes.");
            }
            else
            {
                SetStatus(_isSpanish ? "Carpeta cargada." : "Folder loaded.");
            }
        }
        catch (OperationCanceledException)
        {
            SetStatus(_isSpanish ? "Lectura cancelada." : "Reading cancelled.");
        }
        catch (Exception ex)
        {
            _allRows = [];
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

    private static DirectoryReadResult ReadDirectory(string path, CancellationToken cancellationToken)
    {
        var rows = new List<FileRow>();
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
                rows.Add(FileRow.CreateUnavailable(entryPath));
                continue;
            }

            long? size = null;
            DateTime? modified = null;
            try
            {
                var info = isFolder ? (FileSystemInfo)new DirectoryInfo(entryPath) : new FileInfo(entryPath);
                modified = info.LastWriteTime;
                if (!isFolder)
                    size = ((FileInfo)info).Length;
            }
            catch
            {
                // Keep the row and exact direct-child count when optional metadata is unavailable.
            }

            rows.Add(new FileRow(entryPath, isFolder, size, modified, unavailable: false));
        }

        return new DirectoryReadResult(rows, totalCount, fileCount, folderCount, unclassifiedCount);
    }

    private void ApplyView()
    {
        var query = FilterBox.Text?.Trim();
        IEnumerable<FileRow> filtered = _allRows;

        if (!string.IsNullOrEmpty(query))
            filtered = filtered.Where(row => row.Name.Contains(query, StringComparison.CurrentCultureIgnoreCase));

        filtered = SortBox.SelectedIndex switch
        {
            1 => filtered.OrderByDescending(row => row.IsFolder).ThenByDescending(row => row.Name, StringComparer.CurrentCultureIgnoreCase),
            2 => filtered.OrderByDescending(row => row.IsFolder).ThenByDescending(row => row.SortSize),
            3 => filtered.OrderByDescending(row => row.IsFolder).ThenByDescending(row => row.SortModified),
            _ => filtered.OrderByDescending(row => row.IsFolder).ThenBy(row => row.Name, StringComparer.CurrentCultureIgnoreCase),
        };

        var rows = filtered.Select(row => row.ToDisplay(_isSpanish, _culture)).ToList();
        EntryList.ItemsSource = rows;
        UpdateSelectionCount();
    }

    private async Task NavigateAsync(string path)
    {
        await LoadPathAsync(path, addHistory: true);
    }

    private void UpdateNavigationButtons()
    {
        BackButton.IsEnabled = !_isLoading && _backHistory.Count > 0;
        UpButton.IsEnabled = !_isLoading && Directory.GetParent(_currentPath) is not null;
        OpenButton.IsEnabled = !_isLoading;
        RefreshButton.IsEnabled = !_isLoading;
    }

    private void UpdateSelectionCount()
    {
        var selected = EntryList.SelectedItems.Count;
        SelectionText.Text = _isSpanish
            ? selected.ToString("N0", _culture) + " seleccionados"
            : selected.ToString("N0", _culture) + " selected";
    }

    private void SetStatus(string value) => StatusText.Text = value;

    private async void Open_Click(object sender, RoutedEventArgs e)
    {
        await NavigateAsync(PathBox.Text);
    }

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
        if (_backHistory.Count == 0)
            return;

        var path = _backHistory.Pop();
        await LoadPathAsync(path, addHistory: false);
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
        if (EntryList.SelectedItem is FileRowDisplay row && row.IsFolder && !row.Unavailable)
            await NavigateAsync(row.FullPath);
    }

    private void EntryList_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (_uiReady)
            UpdateSelectionCount();
    }

    private void FilterBox_TextChanged(object sender, TextChangedEventArgs e)
    {
        if (!_uiReady) return;
        ApplyView();
    }

    private void SortBox_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (!_uiReady) return;
        ApplyView();
    }

    private void LanguageBox_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (_uiReady && LanguageBox.SelectedIndex >= 0)
        {
            _isSpanish = LanguageBox.SelectedIndex == 0;
            ApplyLanguage();
        }
    }
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

        var size = IsFolder || !SortSize.HasValue
            ? "—"
            : FormatSize(SortSize.Value, culture);

        var modified = _modified.HasValue
            ? _modified.Value.ToString("g", culture)
            : "—";

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

public sealed record DirectoryReadResult(
    List<FileRow> Rows,
    int Total,
    int Files,
    int Folders,
    int Unclassified);
