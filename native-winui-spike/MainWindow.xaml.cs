using Microsoft.UI;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Windowing;
using Windows.Graphics;
using WinRT.Interop;

namespace CyberFiles.WinUIPrototype;

public sealed partial class MainWindow : Window
{
    private string _leftPath = string.Empty;
    private string _rightPath = string.Empty;
    private bool _isSpanish = true;
    private bool _leftIsActive = true;
    private bool _uiReady;
    private readonly FileOperationQueue _operationQueue = new();
    private FileOperationQueueSnapshot _lastQueueSnapshot = new(false, 0, 0, 0, null, 0, false, false, null);
    private FileTransferItemResult? _lastOperationResult;

    public MainWindow(string initialPath)
    {
        InitializeComponent();
        var windowHandle = WindowNative.GetWindowHandle(this);
        var windowId = Win32Interop.GetWindowIdFromWindow(windowHandle);
        AppWindow.GetFromWindowId(windowId).Resize(new SizeInt32(1440, 900));
        _leftPath = initialPath;
        _rightPath = GetInitialRightPath(initialPath);

        LeftPane.PaneActivated += LeftPane_Activated;
        RightPane.PaneActivated += RightPane_Activated;
        LeftPane.SelectionUpdated += Pane_SelectionUpdated;
        RightPane.SelectionUpdated += Pane_SelectionUpdated;
        LeftPane.DirectoryChanged += Pane_DirectoryChanged;
        RightPane.DirectoryChanged += Pane_DirectoryChanged;
        _operationQueue.StateChanged += OperationQueue_StateChanged;
        _operationQueue.ItemFinished += OperationQueue_ItemFinished;
        _uiReady = true;
        ApplyLanguage();
        UpdateActivePaneDisplay();
        _ = LoadPanesAsync();
    }

    private async Task LoadPanesAsync()
    {
        var leftLoad = LeftPane.LoadInitialPathAsync(_leftPath);
        var rightLoad = RightPane.LoadInitialPathAsync(_rightPath);
        await Task.WhenAll(leftLoad, rightLoad);
    }

    private static string GetInitialRightPath(string leftPath)
    {
        var candidates = new[]
        {
            Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),
            Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
        };

        string normalizedLeft;
        try
        {
            normalizedLeft = Path.GetFullPath(leftPath).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        }
        catch
        {
            normalizedLeft = leftPath;
        }

        foreach (var candidate in candidates)
        {
            if (string.IsNullOrWhiteSpace(candidate) || !Directory.Exists(candidate))
                continue;

            var normalizedCandidate = Path.GetFullPath(candidate).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
            if (!string.Equals(normalizedCandidate, normalizedLeft, StringComparison.OrdinalIgnoreCase))
                return candidate;
        }

        return leftPath;
    }

    private void ApplyLanguage()
    {
        _isSpanish = LanguageBox.SelectedIndex != 1;
        Title = _isSpanish ? "CyberFiles · Explorador nativo (prototipo)" : "CyberFiles · Native Explorer (prototype)";
        PrototypeLabel.Text = _isSpanish ? "WinUI · prototipo" : "WinUI · prototype";
        LeftCopyButton.Content = _isSpanish ? "Copiar →" : "Copy →";
        LeftMoveButton.Content = _isSpanish ? "Mover →" : "Move →";
        RightCopyButton.Content = _isSpanish ? "← Copiar" : "← Copy";
        RightMoveButton.Content = _isSpanish ? "← Mover" : "← Move";
        CancelOperationButton.Content = _isSpanish ? "Cancelar actual" : "Cancel current";
        CancelQueueButton.Content = _isSpanish ? "Cancelar cola" : "Cancel queue";
        LeftPane.SetLanguage(_isSpanish);
        RightPane.SetLanguage(_isSpanish);
        PrototypeStatus.Text = _isSpanish
            ? "Navegación independiente en ambos paneles"
            : "Independent navigation in both panes";
        UpdateActivePaneDisplay();
        UpdateTransferButtons();
        RenderOperationState(_lastQueueSnapshot);
    }

    private void UpdateActivePaneDisplay()
    {
        var leftHeader = _leftIsActive
            ? (_isSpanish ? "PANEL IZQUIERDO · ACTIVO" : "LEFT PANE · ACTIVE")
            : (_isSpanish ? "PANEL IZQUIERDO" : "LEFT PANE");
        var rightHeader = !_leftIsActive
            ? (_isSpanish ? "PANEL DERECHO · ACTIVO" : "RIGHT PANE · ACTIVE")
            : (_isSpanish ? "PANEL DERECHO" : "RIGHT PANE");

        LeftPaneHeader.Text = leftHeader;
        RightPaneHeader.Text = rightHeader;
        ActivePaneText.Text = _isSpanish
            ? (_leftIsActive ? "Panel activo: izquierdo" : "Panel activo: derecho")
            : (_leftIsActive ? "Active pane: left" : "Active pane: right");
    }

    private void LeftPane_Activated(object? sender, EventArgs e)
    {
        _leftIsActive = true;
        UpdateActivePaneDisplay();
    }

    private void RightPane_Activated(object? sender, EventArgs e)
    {
        _leftIsActive = false;
        UpdateActivePaneDisplay();
    }

    private void Pane_SelectionUpdated(object? sender, EventArgs e) => UpdateTransferButtons();

    private void Pane_DirectoryChanged(object? sender, EventArgs e) => UpdateTransferButtons();

    private void UpdateTransferButtons()
    {
        var hasLeftSelection = !LeftPane.IsLoading && !RightPane.IsLoading && LeftPane.SelectedPaths.Count > 0 && !string.IsNullOrWhiteSpace(RightPane.CurrentPath);
        var hasRightSelection = !RightPane.IsLoading && !LeftPane.IsLoading && RightPane.SelectedPaths.Count > 0 && !string.IsNullOrWhiteSpace(LeftPane.CurrentPath);
        LeftCopyButton.IsEnabled = hasLeftSelection;
        LeftMoveButton.IsEnabled = hasLeftSelection;
        RightCopyButton.IsEnabled = hasRightSelection;
        RightMoveButton.IsEnabled = hasRightSelection;
    }

    private void LeftCopy_Click(object sender, RoutedEventArgs e) => QueueTransfer(LeftPane, RightPane, TransferKind.Copy);

    private void LeftMove_Click(object sender, RoutedEventArgs e) => QueueTransfer(LeftPane, RightPane, TransferKind.Move);

    private void RightCopy_Click(object sender, RoutedEventArgs e) => QueueTransfer(RightPane, LeftPane, TransferKind.Copy);

    private void RightMove_Click(object sender, RoutedEventArgs e) => QueueTransfer(RightPane, LeftPane, TransferKind.Move);

    private void QueueTransfer(FilePaneView source, FilePaneView destination, TransferKind kind)
    {
        var selectedPaths = source.SelectedPaths;
        if (selectedPaths.Count == 0 || string.IsNullOrWhiteSpace(destination.CurrentPath))
            return;

        _lastOperationResult = null;
        _operationQueue.Enqueue(selectedPaths, destination.CurrentPath, kind);
    }

    private void CancelOperation_Click(object sender, RoutedEventArgs e) => _operationQueue.CancelCurrent();

    private void CancelQueue_Click(object sender, RoutedEventArgs e) => _operationQueue.CancelAll();

    private void OperationQueue_StateChanged(FileOperationQueueSnapshot snapshot)
    {
        DispatcherQueue.TryEnqueue(() =>
        {
            _lastQueueSnapshot = snapshot;
            RenderOperationState(snapshot);
        });
    }

    private void OperationQueue_ItemFinished(FileTransferItemResult result)
    {
        DispatcherQueue.TryEnqueue(() =>
        {
            _lastOperationResult = result;
            UpdateOperationSummary(result);
            _ = RefreshPanesAfterTransferAsync(result);
        });
    }

    private void RenderOperationState(FileOperationQueueSnapshot snapshot)
    {
        CancelOperationButton.Visibility = snapshot.IsRunning ? Visibility.Visible : Visibility.Collapsed;
        CancelQueueButton.Visibility = snapshot.IsRunning && snapshot.PendingCount > 0 ? Visibility.Visible : Visibility.Collapsed;
        OperationProgress.Visibility = snapshot.TotalCount > 0 ? Visibility.Visible : Visibility.Collapsed;
        OperationProgress.IsIndeterminate = snapshot.IsRunning && snapshot.CurrentProgress < 0;
        if (snapshot.TotalCount > 0)
        {
            OperationProgress.Value = Math.Clamp(
                (snapshot.CompletedCount + (snapshot.IsRunning ? Math.Max(snapshot.CurrentProgress, 0) : 0)) / snapshot.TotalCount,
                0,
                1);
        }

        if (snapshot.IsRunning && snapshot.Current is not null)
        {
            var action = snapshot.CurrentProgress < 0
                ? (_isSpanish ? "Preparando" : "Preparing")
                : snapshot.Current.Kind == TransferKind.Copy
                    ? (_isSpanish ? "Copiando" : "Copying")
                    : (_isSpanish ? "Moviendo" : "Moving");
            var currentName = Path.GetFileName(Path.TrimEndingDirectorySeparator(snapshot.Current.SourcePath));
            var destinationName = Path.GetFileName(Path.TrimEndingDirectorySeparator(snapshot.Current.DestinationDirectory));
            var position = Math.Min(snapshot.CompletedCount + 1, snapshot.TotalCount);
            var queue = snapshot.PendingCount > 0
                ? (_isSpanish ? $" · {snapshot.PendingCount} en cola" : $" · {snapshot.PendingCount} queued")
                : string.Empty;
            OperationStatus.Text = $"{action}: {currentName} → {destinationName} · {position}/{snapshot.TotalCount}{queue}";
            return;
        }

        if (_lastOperationResult is not null)
        {
            UpdateOperationSummary(_lastOperationResult);
            return;
        }

        OperationStatus.Text = snapshot.TotalCount > 0
            ? (_isSpanish ? "Cola completada" : "Queue complete")
            : string.Empty;
    }

    private void UpdateOperationSummary(FileTransferItemResult result)
    {
        var name = Path.GetFileName(Path.TrimEndingDirectorySeparator(result.Request.SourcePath));
        if (result.Succeeded)
        {
            OperationStatus.Text = _isSpanish
                ? $"Completada: {name}"
                : $"Completed: {name}";
        }
        else if (result.Cancelled)
        {
            OperationStatus.Text = _isSpanish
                ? $"Cancelada: {name} · puede quedar una copia parcial en destino"
                : $"Cancelled: {name} · a partial copy may remain in the destination";
        }
        else
        {
            var prefix = _isSpanish ? "Error" : "Failed";
            var partial = _isSpanish ? " · puede quedar una copia parcial en destino" : " · a partial copy may remain in the destination";
            var error = GetLocalizedTransferError(result);
            var partialWarning = result.FailureReason == TransferFailureReason.Unknown ? partial : string.Empty;
            OperationStatus.Text = $"{prefix}: {name} · {error}{partialWarning}";
        }
    }

    private string GetLocalizedTransferError(FileTransferItemResult result)
    {
        if (!_isSpanish)
            return result.Error ?? "Unknown file operation error.";

        return result.FailureReason switch
        {
            TransferFailureReason.Collision => "ya existe un elemento con ese nombre en el destino",
            TransferFailureReason.SourceMissing => "el elemento de origen ya no existe",
            TransferFailureReason.DestinationMissing => "la carpeta de destino ya no existe",
            TransferFailureReason.SelfTarget => "no puedes colocar una carpeta dentro de sí misma",
            TransferFailureReason.ReparsePoint => "se omitió un enlace simbólico o punto de reanálisis por seguridad",
            TransferFailureReason.CrossVolumeFolderMove => "aún no se admite mover carpetas entre unidades",
            TransferFailureReason.SourceChanged => "el archivo cambió durante la copia",
            _ => result.Error ?? "Error desconocido de operación de archivos",
        };
    }

    private async Task RefreshPanesAfterTransferAsync(FileTransferItemResult result)
    {
        if (!result.Succeeded)
            return;

        var source = Path.GetFullPath(result.Request.SourcePath);
        var sourceParent = Path.GetDirectoryName(source);
        var destination = Path.GetFullPath(result.Request.DestinationDirectory);
        await RefreshPaneIfAffectedAsync(LeftPane, source, sourceParent, destination, result.Request.Kind);
        await RefreshPaneIfAffectedAsync(RightPane, source, sourceParent, destination, result.Request.Kind);
    }

    private static async Task RefreshPaneIfAffectedAsync(
        FilePaneView pane,
        string source,
        string? sourceParent,
        string destination,
        TransferKind kind)
    {
        if (kind == TransferKind.Move && PathsEqual(pane.CurrentPath, source))
        {
            if (sourceParent is not null)
                await pane.NavigateToPathAsync(sourceParent);
            return;
        }

        if ((kind == TransferKind.Move && sourceParent is not null && PathsEqual(pane.CurrentPath, sourceParent)) ||
            PathsEqual(pane.CurrentPath, destination))
            await pane.RefreshCurrentPathAsync();
    }

    private static bool PathsEqual(string first, string second)
    {
        if (string.IsNullOrWhiteSpace(first) || string.IsNullOrWhiteSpace(second))
            return false;
        return string.Equals(Path.TrimEndingDirectorySeparator(Path.GetFullPath(first)),
            Path.TrimEndingDirectorySeparator(Path.GetFullPath(second)), StringComparison.OrdinalIgnoreCase);
    }

    private void LanguageBox_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (_uiReady && LanguageBox.SelectedIndex >= 0)
            ApplyLanguage();
    }
}
