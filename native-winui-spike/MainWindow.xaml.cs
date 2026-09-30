using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Runtime.CompilerServices;
using Microsoft.UI;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Media.Animation;
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
    private FileOperationQueueSnapshot _lastQueueSnapshot = new(false, 0, 0, 0, null, Array.Empty<FileTransferRequest>(), 0, false, false, null);
    private FileTransferItemResult? _lastOperationResult;
    private readonly List<ActivityHistoryRecord> _recentActivities = [];
    private readonly ObservableCollection<ActivityQueueItemDisplay> _queueDisplayItems = [];
    private readonly ObservableCollection<ActivityHistoryItemDisplay> _historyDisplayItems = [];
    private readonly DispatcherTimer _activityCenterHideTimer = new() { Interval = TimeSpan.FromSeconds(4) };
    private Storyboard? _activityCenterStoryboard;
    private bool _activityCenterPinned;
    private bool _activityCenterAutoOpened;
    private bool _activityCenterClosing;

    public MainWindow(string initialPath)
    {
        InitializeComponent();
        ActivityQueueList.ItemsSource = _queueDisplayItems;
        ActivityHistoryList.ItemsSource = _historyDisplayItems;
        _activityCenterHideTimer.Tick += ActivityCenterHideTimer_Tick;
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
        LeftPane.FileActionCompleted += Pane_FileActionCompleted;
        RightPane.FileActionCompleted += Pane_FileActionCompleted;
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
        ActivityCenterButtonLabel.Text = _isSpanish ? "Operaciones" : "Operations";
        ActivityCenterTitle.Text = _isSpanish ? "Centro de operaciones" : "Activity center";
        ActivityPinButton.Content = _activityCenterPinned
            ? (_isSpanish ? "Fijado" : "Pinned")
            : (_isSpanish ? "Fijar" : "Pin");
        ActivityHistoryClearButton.Content = _isSpanish ? "Limpiar recientes" : "Clear recent";
        ActivityCancelCurrentButton.Content = _isSpanish ? "Cancelar actual" : "Cancel current";
        ActivityCancelQueueButton.Content = _isSpanish ? "Cancelar todo" : "Cancel all";
        ActivityEmptyText.Text = _isSpanish ? "Aún no hay operaciones recientes." : "No recent operations yet.";
        LeftPane.SetLanguage(_isSpanish);
        RightPane.SetLanguage(_isSpanish);
        PrototypeStatus.Text = _isSpanish
            ? "Navegación independiente en ambos paneles"
            : "Independent navigation in both panes";
        UpdateActivePaneDisplay();
        UpdateTransferButtons();
        RenderOperationState(_lastQueueSnapshot);
        RebuildActivityHistory();
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

    private void Pane_FileActionCompleted(FilePaneActionRecord action)
    {
        var kind = action.Kind switch
        {
            FilePaneActionKind.Open => ActivityActionKind.Open,
            FilePaneActionKind.CreateFolder => ActivityActionKind.CreateFolder,
            FilePaneActionKind.Rename => ActivityActionKind.Rename,
            FilePaneActionKind.RecycleBin => ActivityActionKind.RecycleBin,
            _ => ActivityActionKind.Open,
        };
        AddRecentActivity(new ActivityHistoryRecord(kind, action.Subject, action.Route, action.Succeeded, false, action.Error, Count: action.Count));
    }

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
        if (!_activityCenterPinned)
            ShowActivityCenter(automatically: true);
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
            if (snapshot.IsRunning)
                _activityCenterHideTimer.Stop();
            else
                ScheduleActivityCenterAutoHide();
        });
    }

    private void OperationQueue_ItemFinished(FileTransferItemResult result)
    {
        DispatcherQueue.TryEnqueue(() =>
        {
            _lastOperationResult = result;
            var kind = result.Request.Kind == TransferKind.Copy ? ActivityActionKind.Copy : ActivityActionKind.Move;
            AddRecentActivity(new ActivityHistoryRecord(
                kind,
                Path.GetFileName(Path.TrimEndingDirectorySeparator(result.Request.SourcePath)),
                $"{result.Request.SourcePath} → {result.Request.DestinationDirectory}",
                result.Succeeded,
                result.Cancelled,
                result.Error,
                result.FailureReason));
            UpdateOperationSummary(result);
            _ = RefreshPanesAfterTransferAsync(result);
        });
    }

    private void RenderOperationState(FileOperationQueueSnapshot snapshot)
    {
        ActivityCancelCurrentButton.Visibility = snapshot.IsRunning && snapshot.Current is not null ? Visibility.Visible : Visibility.Collapsed;
        ActivityCancelQueueButton.Visibility = snapshot.IsRunning && snapshot.PendingCount > 0 ? Visibility.Visible : Visibility.Collapsed;
        ActivityQueueSection.Visibility = snapshot.IsRunning || snapshot.PendingCount > 0 ? Visibility.Visible : Visibility.Collapsed;
        ActivityAggregateProgress.IsIndeterminate = snapshot.IsRunning && snapshot.CurrentProgress < 0;
        if (snapshot.TotalCount > 0)
        {
            ActivityAggregateProgress.Value = Math.Clamp(
                (snapshot.CompletedCount + (snapshot.IsRunning ? Math.Max(snapshot.CurrentProgress, 0) : 0)) / snapshot.TotalCount,
                0,
                1);
        }

        UpdateQueuePreview(snapshot);

        var activeCount = (snapshot.Current is null ? 0 : 1) + snapshot.PendingCount;
        ActivityBadgeText.Text = activeCount.ToString();
        ActivityBadge.Visibility = activeCount > 0 ? Visibility.Visible : Visibility.Collapsed;
        if (snapshot.IsRunning)
        {
            ActivityCenterSummary.Text = snapshot.Current is null
                ? (_isSpanish ? "Preparando la cola..." : "Preparing the queue...")
                : snapshot.PendingCount > 0
                    ? (_isSpanish ? $"1 operación activa · {snapshot.PendingCount} en espera" : $"1 active · {snapshot.PendingCount} queued")
                    : (_isSpanish ? "1 operación activa" : "1 operation active");
            ActivityQueueHeading.Text = snapshot.PendingCount > 0
                ? (_isSpanish ? $"EN CURSO Y EN COLA · {snapshot.PendingCount} EN ESPERA" : $"IN PROGRESS · {snapshot.PendingCount} QUEUED")
                : (_isSpanish ? "EN CURSO" : "IN PROGRESS");
        }
        else
        {
            ActivityCenterSummary.Text = _recentActivities.Count > 0
                ? (_isSpanish ? $"{_recentActivities.Count} operaciones recientes" : $"{_recentActivities.Count} recent operations")
                : (_isSpanish ? "Sin operaciones pendientes" : "No pending operations");
            ActivityQueueHeading.Text = _isSpanish ? "TRABAJOS EN COLA" : "QUEUED OPERATIONS";
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

    private void UpdateQueuePreview(FileOperationQueueSnapshot snapshot)
    {
        var entries = new List<(FileTransferRequest Request, double Progress, bool IsCurrent)>();
        if (snapshot.Current is not null)
            entries.Add((snapshot.Current, snapshot.CurrentProgress, true));
        entries.AddRange(snapshot.PendingPreview.Select(request => (request, 0d, false)));

        var entriesMatch = entries.Count == _queueDisplayItems.Count && entries
            .Select((entry, index) => entry.Request == _queueDisplayItems[index].Request && entry.IsCurrent == _queueDisplayItems[index].IsCurrent)
            .All(matches => matches);
        if (!entriesMatch)
        {
            _queueDisplayItems.Clear();
            foreach (var entry in entries)
                _queueDisplayItems.Add(new ActivityQueueItemDisplay(entry.Request, entry.Progress, entry.IsCurrent, _isSpanish));
            return;
        }

        for (var index = 0; index < entries.Count; index++)
            _queueDisplayItems[index].Update(entries[index].Progress, _isSpanish);
    }

    private void RebuildActivityHistory()
    {
        _historyDisplayItems.Clear();
        foreach (var record in _recentActivities)
        {
            var action = GetLocalizedActionName(record.Kind);
            var status = record.Succeeded
                ? (_isSpanish ? "Completada" : "Completed")
                : record.Cancelled
                    ? (_isSpanish ? "Cancelada" : "Cancelled")
                    : $"{(_isSpanish ? "Error" : "Failed")}: {GetLocalizedActivityError(record)}";
            var glyph = record.Succeeded ? "\uE73E" : record.Cancelled ? "\uE711" : "\uE783";
            var color = record.Succeeded
                ? Colors.LightGreen
                : record.Cancelled
                    ? Colors.LightGray
                    : Colors.OrangeRed;

            _historyDisplayItems.Add(new ActivityHistoryItemDisplay(
                $"{action}: {GetActivitySubject(record)}",
                record.Route,
                status,
                glyph,
                new SolidColorBrush(color)));
        }

        ActivityEmptyText.Visibility = _recentActivities.Count == 0 ? Visibility.Visible : Visibility.Collapsed;
        ActivityHistoryClearButton.IsEnabled = _recentActivities.Count > 0;
        if (!_lastQueueSnapshot.IsRunning)
        {
            ActivityCenterSummary.Text = _recentActivities.Count > 0
                ? (_isSpanish ? $"{_recentActivities.Count} operaciones recientes" : $"{_recentActivities.Count} recent operations")
                : (_isSpanish ? "Sin operaciones pendientes" : "No pending operations");
        }
        ActivityRecentHeading.Text = _isSpanish
            ? $"RECIENTES · {_recentActivities.Count}/10"
            : $"RECENT · {_recentActivities.Count}/10";
    }

    private void AddRecentActivity(ActivityHistoryRecord record)
    {
        _recentActivities.Insert(0, record);
        if (_recentActivities.Count > 10)
            _recentActivities.RemoveAt(_recentActivities.Count - 1);
        RebuildActivityHistory();
    }

    private string GetLocalizedActionName(ActivityActionKind kind) => kind switch
    {
        ActivityActionKind.Copy => _isSpanish ? "Copia" : "Copy",
        ActivityActionKind.Move => _isSpanish ? "Movimiento" : "Move",
        ActivityActionKind.Open => _isSpanish ? "Abrir" : "Open",
        ActivityActionKind.CreateFolder => _isSpanish ? "Crear carpeta" : "Create folder",
        ActivityActionKind.Rename => _isSpanish ? "Renombrar" : "Rename",
        ActivityActionKind.RecycleBin => _isSpanish ? "Papelera" : "Recycle Bin",
        _ => _isSpanish ? "Operación" : "Operation",
    };

    private string GetActivitySubject(ActivityHistoryRecord record) =>
        record.Kind == ActivityActionKind.RecycleBin && record.Count > 1
            ? (_isSpanish ? $"{record.Count} elementos" : $"{record.Count} items")
            : record.Subject;

    private string GetLocalizedActivityError(ActivityHistoryRecord record)
    {
        if (record.FailureReason != TransferFailureReason.Unknown)
            return GetLocalizedTransferError(record.FailureReason, record.Error);
        return record.Error ?? (_isSpanish ? "Error desconocido" : "Unknown error");
    }

    private void ActivityCenterToggle_Click(object sender, RoutedEventArgs e)
    {
        if (ActivityCenterPanel.Visibility == Visibility.Visible && !_activityCenterClosing)
            HideActivityCenter();
        else
            ShowActivityCenter(automatically: false);
    }

    private void ActivityCenterClose_Click(object sender, RoutedEventArgs e) => HideActivityCenter();

    private void ActivityPin_Click(object sender, RoutedEventArgs e)
    {
        _activityCenterPinned = ActivityPinButton.IsChecked == true;
        ActivityPinButton.Content = _activityCenterPinned
            ? (_isSpanish ? "Fijado" : "Pinned")
            : (_isSpanish ? "Fijar" : "Pin");
        if (_activityCenterPinned)
            _activityCenterHideTimer.Stop();
        else
            ScheduleActivityCenterAutoHide();
    }

    private void ActivityHistoryClear_Click(object sender, RoutedEventArgs e)
    {
        _recentActivities.Clear();
        RebuildActivityHistory();
    }

    private void ShowActivityCenter(bool automatically)
    {
        var wasVisible = ActivityCenterPanel.Visibility == Visibility.Visible;
        _activityCenterHideTimer.Stop();
        if (wasVisible && _activityCenterClosing)
        {
            _activityCenterStoryboard?.Stop();
            _activityCenterClosing = false;
            ActivityCenterPanel.Opacity = 1;
            ActivityCenterTranslation.Y = 0;
        }
        if (!wasVisible)
        {
            ActivityCenterPanel.Opacity = 0;
            ActivityCenterTranslation.Y = 22;
            ActivityCenterPanel.Visibility = Visibility.Visible;
            AnimateActivityCenter(show: true);
        }
        if (!automatically)
            _activityCenterAutoOpened = false;
        else if (!wasVisible && !_activityCenterPinned)
            _activityCenterAutoOpened = true;
    }

    private void HideActivityCenter()
    {
        _activityCenterHideTimer.Stop();
        if (ActivityCenterPanel.Visibility == Visibility.Visible)
            AnimateActivityCenter(show: false);
        else
            _activityCenterClosing = false;
        _activityCenterAutoOpened = false;
        _activityCenterPinned = false;
        ActivityPinButton.IsChecked = false;
        ActivityPinButton.Content = _isSpanish ? "Fijar" : "Pin";
    }

    private void AnimateActivityCenter(bool show)
    {
        _activityCenterStoryboard?.Stop();
        _activityCenterClosing = !show;
        var storyboard = new Storyboard();
        var duration = new Duration(TimeSpan.FromMilliseconds(show ? 210 : 160));
        var fade = new DoubleAnimation
        {
            To = show ? 1 : 0,
            Duration = duration,
            EasingFunction = new CubicEase { EasingMode = EasingMode.EaseOut },
        };
        Storyboard.SetTarget(fade, ActivityCenterPanel);
        Storyboard.SetTargetProperty(fade, "Opacity");

        var slide = new DoubleAnimation
        {
            To = show ? 0 : 22,
            Duration = duration,
            EasingFunction = new CubicEase { EasingMode = EasingMode.EaseOut },
        };
        Storyboard.SetTarget(slide, ActivityCenterTranslation);
        Storyboard.SetTargetProperty(slide, "Y");

        storyboard.Children.Add(fade);
        storyboard.Children.Add(slide);
        if (!show)
        {
            storyboard.Completed += (_, _) =>
            {
                if (_activityCenterClosing)
                {
                    ActivityCenterPanel.Visibility = Visibility.Collapsed;
                    ActivityCenterPanel.Opacity = 1;
                    _activityCenterClosing = false;
                }
            };
        }
        _activityCenterStoryboard = storyboard;
        storyboard.Begin();
    }

    private void ScheduleActivityCenterAutoHide()
    {
        if (_activityCenterAutoOpened && !_activityCenterPinned &&
            ActivityCenterPanel.Visibility == Visibility.Visible && !_lastQueueSnapshot.IsRunning)
        {
            _activityCenterHideTimer.Stop();
            _activityCenterHideTimer.Start();
        }
    }

    private void ActivityCenterHideTimer_Tick(object? sender, object e)
    {
        _activityCenterHideTimer.Stop();
        if (_activityCenterAutoOpened && !_activityCenterPinned && !_lastQueueSnapshot.IsRunning)
            HideActivityCenter();
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
        => GetLocalizedTransferError(result.FailureReason, result.Error);

    private string GetLocalizedTransferError(TransferFailureReason failureReason, string? error)
    {
        if (!_isSpanish)
            return error ?? "Unknown file operation error.";

        return failureReason switch
        {
            TransferFailureReason.Collision => "ya existe un elemento con ese nombre en el destino",
            TransferFailureReason.SourceMissing => "el elemento de origen ya no existe",
            TransferFailureReason.DestinationMissing => "la carpeta de destino ya no existe",
            TransferFailureReason.SelfTarget => "no puedes colocar una carpeta dentro de sí misma",
            TransferFailureReason.ReparsePoint => "se omitió un enlace simbólico o punto de reanálisis por seguridad",
            TransferFailureReason.CrossVolumeFolderMove => "aún no se admite mover carpetas entre unidades",
            TransferFailureReason.SourceChanged => "el archivo cambió durante la copia",
            _ => error ?? "Error desconocido de operación de archivos",
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

public sealed class ActivityQueueItemDisplay : INotifyPropertyChanged
{
    private string _title = string.Empty;
    private string _route = string.Empty;
    private string _state = string.Empty;
    private double _progress;
    private bool _isIndeterminate;

    public FileTransferRequest Request { get; }
    public bool IsCurrent { get; }
    public Visibility ProgressVisibility => IsCurrent ? Visibility.Visible : Visibility.Collapsed;

    public string Title
    {
        get => _title;
        private set => SetValue(ref _title, value);
    }

    public string Route
    {
        get => _route;
        private set => SetValue(ref _route, value);
    }

    public string State
    {
        get => _state;
        private set => SetValue(ref _state, value);
    }

    public double Progress
    {
        get => _progress;
        private set => SetValue(ref _progress, value);
    }

    public bool IsIndeterminate
    {
        get => _isIndeterminate;
        private set => SetValue(ref _isIndeterminate, value);
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    public ActivityQueueItemDisplay(FileTransferRequest request, double progress, bool isCurrent, bool isSpanish)
    {
        Request = request;
        IsCurrent = isCurrent;
        Update(progress, isSpanish);
    }

    public void Update(double progress, bool isSpanish)
    {
        var name = Path.GetFileName(Path.TrimEndingDirectorySeparator(Request.SourcePath));
        var action = Request.Kind == TransferKind.Copy
            ? (isSpanish ? "Copiar" : "Copy")
            : (isSpanish ? "Mover" : "Move");
        Title = $"{action}: {name}";
        Route = $"{Request.SourcePath} → {Request.DestinationDirectory}";
        State = !IsCurrent
            ? (isSpanish ? "En cola" : "Queued")
            : progress < 0
                ? (isSpanish ? "Preparando" : "Preparing")
                : Request.Kind == TransferKind.Copy
                    ? (isSpanish ? "Copiando" : "Copying")
                    : (isSpanish ? "Moviendo" : "Moving");
        Progress = Math.Max(progress, 0);
        IsIndeterminate = IsCurrent && progress < 0;
    }

    private void SetValue<T>(ref T field, T value, [CallerMemberName] string? propertyName = null)
    {
        if (EqualityComparer<T>.Default.Equals(field, value))
            return;

        field = value;
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
    }
}

public sealed record ActivityHistoryItemDisplay(
    string Title,
    string Route,
    string Status,
    string Glyph,
    Brush StatusBrush);

public enum ActivityActionKind
{
    Copy,
    Move,
    Open,
    CreateFolder,
    Rename,
    RecycleBin,
}

public sealed record ActivityHistoryRecord(
    ActivityActionKind Kind,
    string Subject,
    string Route,
    bool Succeeded,
    bool Cancelled,
    string? Error = null,
    TransferFailureReason FailureReason = TransferFailureReason.Unknown,
    int Count = 1);
