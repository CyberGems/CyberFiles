using Microsoft.UI.Xaml;

namespace CyberFiles.WinUIPrototype;

public partial class App : Application
{
    private Window? _window;

    public App()
    {
        InitializeComponent();
    }

    protected override void OnLaunched(LaunchActivatedEventArgs args)
    {
        var initialPath = Environment.GetCommandLineArgs().Skip(1).FirstOrDefault(argument => !argument.StartsWith("--"))
            ?? Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        _window = new MainWindow(initialPath);
        _window.Activate();
    }
}
