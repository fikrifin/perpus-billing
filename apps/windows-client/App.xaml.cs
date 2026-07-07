using System.Windows;

namespace PerpusBilling.WindowsClient;

public partial class App : Application
{
    private MainWindow? _window;
    private readonly WindowsStartupManager _startupManager = new();

    private async void Application_Startup(object sender, StartupEventArgs e)
    {
        var config = await ClientConfig.LoadAsync();
        _startupManager.EnsureStartup(config.AutoStartOnLogin);

        var api = new PerpusApiClient(config);
        var power = new WindowsPowerController();
        _window = new MainWindow(config, api, power);
        _window.Show();
    }
}
