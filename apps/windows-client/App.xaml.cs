using System.Diagnostics;
using System.IO;
using System.Text;
using System.Windows;
using System.Windows.Threading;

namespace PerpusBilling.WindowsClient;

public partial class App : Application
{
    private MainWindow? _window;
    private readonly WindowsStartupManager _startupManager = new();
    private readonly WindowsClientLogger _logger = new();

    private async void Application_Startup(object sender, StartupEventArgs e)
    {
        DispatcherUnhandledException += App_DispatcherUnhandledException;
        AppDomain.CurrentDomain.UnhandledException += CurrentDomain_UnhandledException;

        var config = await ClientConfig.LoadAsync();
        _logger.Info("Client starting", ("server", config.NormalizedServerUrl), ("computer", config.NormalizedComputerCode), ("version", config.ClientVersion));
        var startupRegistered = _startupManager.EnsureStartup(config.AutoStartOnLogin, config.EnableStartupShortcutFallback);
        _logger.Info("Startup registration evaluated",
            ("enabled", config.AutoStartOnLogin),
            ("registered", startupRegistered),
            ("shortcutFallback", config.EnableStartupShortcutFallback),
            ("registryCommand", _startupManager.GetRegisteredCommand() ?? "none"),
            ("startupShortcut", _startupManager.GetStartupFolderShortcutPath() ?? "none"));

        var api = new PerpusApiClient(config);
        var power = new WindowsPowerController(_logger);
        _window = new MainWindow(config, api, power, _logger);
        _window.Show();
    }

    private void App_DispatcherUnhandledException(object sender, DispatcherUnhandledExceptionEventArgs e)
    {
        var shouldRelaunch = ShouldRelaunchClient();
        TryWriteCrashLog("dispatcher", e.Exception);
        _logger.Error("Unhandled dispatcher exception", e.Exception);
        if (shouldRelaunch)
        {
            _startupManager.TryLaunchCurrentExecutable("relaunch-after-dispatcher-crash");
        }

        e.Handled = false;
    }

    private void CurrentDomain_UnhandledException(object sender, UnhandledExceptionEventArgs e)
    {
        var exception = e.ExceptionObject as Exception ?? new Exception("Unknown unhandled exception");
        var shouldRelaunch = ShouldRelaunchClient();
        TryWriteCrashLog("appdomain", exception);
        _logger.Error("Unhandled appdomain exception", exception);
        if (shouldRelaunch)
        {
            _startupManager.TryLaunchCurrentExecutable("relaunch-after-appdomain-crash");
        }
    }

    private bool ShouldRelaunchClient()
    {
        return _window?.IsPreLoginLocked() == true
            && _window?.IsAdminExitInProgress != true
            && _window?.HasActiveSession != true;
    }

    private void TryWriteCrashLog(string source, Exception exception)
    {
        try
        {
            var root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "PerpusBilling", "WindowsClient", "logs");
            Directory.CreateDirectory(root);
            var path = Path.Combine(root, $"crash-{DateTime.Now:yyyyMMdd}.log");
            var builder = new StringBuilder();
            builder.AppendLine($"[{DateTimeOffset.Now:O}] source={source}");
            builder.AppendLine(exception.ToString());
            builder.AppendLine(new string('-', 60));
            File.AppendAllText(path, builder.ToString(), Encoding.UTF8);
        }
        catch
        {
            // jangan bikin crash kedua hanya karena gagal logging
        }
    }
}
