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
        LeftPane.SetLanguage(_isSpanish);
        RightPane.SetLanguage(_isSpanish);
        PrototypeStatus.Text = _isSpanish
            ? "Navegación independiente en ambos paneles"
            : "Independent navigation in both panes";
        UpdateActivePaneDisplay();
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

    private void LanguageBox_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (_uiReady && LanguageBox.SelectedIndex >= 0)
            ApplyLanguage();
    }
}
