using System.Runtime.InteropServices;
using Microsoft.UI;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using Windows.Graphics;
using WinRT.Interop;

namespace CyberFiles.WheelLab;

public sealed partial class MainWindow : Window
{
    private ScrollViewer? _scrollViewer;
    private int _nativeWheelMessages;
    private int _wheelEvents;
    private int _viewChanges;
    private bool _isSpanish = true;
    private bool _isPointerOverList;
    private bool _uiReady;
    private double _pointerY;
    private string _lastWheelSource = "—";
    private readonly WindowSubclassProcedure _windowSubclassProcedure;
    private IntPtr _windowHandle;

    private const uint WmMouseWheel = 0x020A;
    private static readonly UIntPtr WindowSubclassId = new(1);

    [UnmanagedFunctionPointer(CallingConvention.Winapi)]
    private delegate IntPtr WindowSubclassProcedure(
        IntPtr windowHandle,
        uint message,
        UIntPtr wParam,
        IntPtr lParam,
        UIntPtr subclassId,
        UIntPtr referenceData);

    [DllImport("comctl32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetWindowSubclass(
        IntPtr windowHandle,
        WindowSubclassProcedure callback,
        UIntPtr subclassId,
        UIntPtr referenceData);

    [DllImport("comctl32.dll")]
    private static extern IntPtr DefSubclassProc(
        IntPtr windowHandle,
        uint message,
        UIntPtr wParam,
        IntPtr lParam);

    [DllImport("comctl32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool RemoveWindowSubclass(
        IntPtr windowHandle,
        WindowSubclassProcedure callback,
        UIntPtr subclassId);

    public MainWindow()
    {
        InitializeComponent();
        EntryList.ItemsSource = Enumerable.Range(1, 10_000)
            .Select(index => new WheelLabRow(index, $"Item {index:N0}", $"{index * 13:N0} KB"))
            .ToArray();
        EntryList.AddHandler(
            UIElement.PointerWheelChangedEvent,
            new PointerEventHandler(EntryList_PointerWheelChanged),
            handledEventsToo: true);

        _windowHandle = WindowNative.GetWindowHandle(this);
        _windowSubclassProcedure = WindowSubclassCallback;
        SetWindowSubclass(_windowHandle, _windowSubclassProcedure, WindowSubclassId, UIntPtr.Zero);
        Closed += MainWindow_Closed;

        var windowId = Win32Interop.GetWindowIdFromWindow(_windowHandle);
        AppWindow.GetFromWindowId(windowId).Resize(new SizeInt32(900, 720));
        _uiReady = true;
        ApplyLanguage();
    }

    private void EntryList_Loaded(object sender, RoutedEventArgs e)
    {
        EntryList.ApplyTemplate();
        EntryList.UpdateLayout();
        _scrollViewer = FindScrollViewer(EntryList);
        if (_scrollViewer is not null)
            _scrollViewer.ViewChanged += ScrollViewer_ViewChanged;
        UpdateDiagnostics();
    }

    private void EntryList_PointerWheelChanged(object sender, PointerRoutedEventArgs e)
    {
        _wheelEvents++;
        _lastWheelSource = e.OriginalSource?.GetType().Name ?? "—";
        UpdateDiagnostics();
    }

    private void ScrollViewer_ViewChanged(object? sender, ScrollViewerViewChangedEventArgs e)
    {
        _viewChanges++;
        UpdateDiagnostics();
    }

    private void EntryList_PointerEntered(object sender, PointerRoutedEventArgs e)
    {
        _isPointerOverList = true;
        UpdateDiagnostics();
    }

    private void EntryList_PointerExited(object sender, PointerRoutedEventArgs e)
    {
        _isPointerOverList = false;
        UpdateDiagnostics();
    }

    private void EntryList_PointerMoved(object sender, PointerRoutedEventArgs e)
    {
        _pointerY = e.GetCurrentPoint(EntryList).Position.Y;
        UpdateDiagnostics();
    }

    private IntPtr WindowSubclassCallback(
        IntPtr windowHandle,
        uint message,
        UIntPtr wParam,
        IntPtr lParam,
        UIntPtr subclassId,
        UIntPtr referenceData)
    {
        if (message == WmMouseWheel)
        {
            _nativeWheelMessages++;
            DispatcherQueue.TryEnqueue(UpdateDiagnostics);
        }

        return DefSubclassProc(windowHandle, message, wParam, lParam);
    }

    private void MainWindow_Closed(object sender, WindowEventArgs e) =>
        RemoveWindowSubclass(_windowHandle, _windowSubclassProcedure, WindowSubclassId);

    private void LanguageBox_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (!_uiReady)
            return;

        _isSpanish = LanguageBox.SelectedIndex != 1;
        ApplyLanguage();
    }

    private void ApplyLanguage()
    {
        Title = _isSpanish ? "CyberFiles · Laboratorio de rueda" : "CyberFiles · Wheel input lab";
        TitleText.Text = _isSpanish ? "Prueba aislada de rueda" : "Isolated wheel test";
        DescriptionText.Text = _isSpanish
            ? "Desplaza sobre los números, nombres, tamaños y espacios vacíos."
            : "Scroll over numbers, names, sizes, and empty spaces.";
        ResultHintText.Text = _isSpanish
            ? "El contenido visual de cada fila deja que el contenedor reciba el puntero."
            : "Each row's visual content lets the item container receive pointer input.";
        UpdateDiagnostics();
    }

    private void UpdateDiagnostics()
    {
        var offset = _scrollViewer?.VerticalOffset ?? 0;
        NativeWheelText.Text = $"Windows: {_nativeWheelMessages}";
        WheelEventsText.Text = $"XAML: {_wheelEvents}";
        ViewChangesText.Text = _isSpanish ? $"Vista: {_viewChanges}" : $"View: {_viewChanges}";
        OffsetText.Text = _isSpanish ? $"Posición: {offset:N0}" : $"Offset: {offset:N0}";
        PointerText.Text = _isSpanish
            ? (_isPointerOverList ? $"Cursor Y: {_pointerY:N0} · Objetivo: {_lastWheelSource}" : "Cursor fuera de la lista")
            : (_isPointerOverList ? $"Pointer Y: {_pointerY:N0} · Target: {_lastWheelSource}" : "Pointer outside the list");
    }

    private static ScrollViewer? FindScrollViewer(DependencyObject parent)
    {
        var childCount = VisualTreeHelper.GetChildrenCount(parent);
        for (var index = 0; index < childCount; index++)
        {
            var child = VisualTreeHelper.GetChild(parent, index);
            if (child is ScrollViewer scrollViewer)
                return scrollViewer;

            var nested = FindScrollViewer(child);
            if (nested is not null)
                return nested;
        }

        return null;
    }
}

public sealed record WheelLabRow(int Number, string Name, string Size);
