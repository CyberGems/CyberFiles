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
    private int _wheelEvents;
    private int _viewChanges;
    private bool _isSpanish = true;
    private bool _isPointerOverList;
    private bool _uiReady;

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

        var windowHandle = WindowNative.GetWindowHandle(this);
        var windowId = Win32Interop.GetWindowIdFromWindow(windowHandle);
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
            ? "Desplaza esta lista sin hacer clic primero."
            : "Scroll this list without clicking it first.";
        ResultHintText.Text = _isSpanish
            ? "La prueba registra la entrada de rueda y el movimiento real por separado."
            : "The test records wheel input and actual movement separately.";
        UpdateDiagnostics();
    }

    private void UpdateDiagnostics()
    {
        var offset = _scrollViewer?.VerticalOffset ?? 0;
        WheelEventsText.Text = _isSpanish ? $"Eventos de rueda: {_wheelEvents}" : $"Wheel events: {_wheelEvents}";
        ViewChangesText.Text = _isSpanish ? $"Cambios de vista: {_viewChanges}" : $"View changes: {_viewChanges}";
        OffsetText.Text = _isSpanish ? $"Posición: {offset:N0}" : $"Offset: {offset:N0}";
        PointerText.Text = _isSpanish
            ? (_isPointerOverList ? "Cursor sobre la lista" : "Cursor fuera de la lista")
            : (_isPointerOverList ? "Pointer over the list" : "Pointer outside the list");
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
