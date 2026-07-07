using System.ComponentModel;
using System.Windows;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Threading;
using PerpusBilling.WindowsClient.Models;

namespace PerpusBilling.WindowsClient;

public partial class MainWindow : Window
{
    private readonly ClientConfig _config;
    private readonly PerpusApiClient _api;
    private readonly WindowsPowerController _power;
    private readonly DispatcherTimer _heartbeatTimer = new();
    private readonly DispatcherTimer _clockTimer = new();
    private readonly DispatcherTimer _guardTimer = new();
    private readonly MiniBarWindow _miniBar = new();

    private SettingsResponse _settings = new();
    private SessionResponse? _activeSession;
    private bool _finalActionTriggered;
    private bool _remoteActionTriggered;
    private string _pendingAction = "shutdown";

    public MainWindow(ClientConfig config, PerpusApiClient api, WindowsPowerController power)
    {
        InitializeComponent();
        _config = config;
        _api = api;
        _power = power;

        _power.MakeWindowKiosk(this);
        ComputerCodeText.Text = _config.NormalizedComputerCode;
        FooterText.Text = $"Server: {_config.NormalizedServerUrl} · Client: {_config.ClientVersion}";

        _heartbeatTimer.Tick += async (_, _) => await HeartbeatAsync();
        _clockTimer.Interval = TimeSpan.FromSeconds(1);
        _clockTimer.Tick += (_, _) => RefreshSessionClock();
        _guardTimer.Interval = TimeSpan.FromMilliseconds(800);
        _guardTimer.Tick += (_, _) => EnforcePreLoginGuard();

        PreviewKeyDown += MainWindow_PreviewKeyDown;
        Deactivated += MainWindow_Deactivated;
        SourceInitialized += MainWindow_SourceInitialized;

        Loaded += async (_, _) =>
        {
            _clockTimer.Start();
            _guardTimer.Start();
            EnforcePreLoginGuard();
            await HeartbeatAsync();
        };
    }

    private async Task HeartbeatAsync()
    {
        try
        {
            _settings = await _api.GetSettingsAsync();
            ApplySettings();

            var heartbeat = await _api.HeartbeatAsync();
            ServerStatusText.Text = $"Online · {heartbeat.Computer?.Status ?? "unknown"}";
            ErrorText.Text = "";

            if (heartbeat.ActiveSession is not null)
            {
                SyncSessionFromServer(heartbeat.ActiveSession);
            }
            else if (_activeSession is not null && !_finalActionTriggered)
            {
                ResetToLogin("Session sudah tidak aktif. Komputer kembali terkunci.");
            }

            foreach (var command in heartbeat.Commands)
            {
                await HandleCommandAsync(command);
            }
        }
        catch (Exception ex)
        {
            ServerStatusText.Text = "Offline";
            ErrorText.Text = ex.Message;
        }
        finally
        {
            ScheduleNextHeartbeat();
        }
    }

    private void ApplySettings()
    {
        BusinessNameText.Text = _settings.BusinessName;
    }

    private void ScheduleNextHeartbeat()
    {
        var seconds = ReadInt(_settings.HeartbeatIntervalSeconds, _config.HeartbeatFallbackSeconds);
        _heartbeatTimer.Stop();
        _heartbeatTimer.Interval = TimeSpan.FromSeconds(Math.Max(1, seconds));
        _heartbeatTimer.Start();
    }

    private async void LoginButton_Click(object sender, RoutedEventArgs e)
    {
        ErrorText.Text = "";
        MessageText.Text = "Memvalidasi akun...";
        LoginButton.IsEnabled = false;

        try
        {
            var session = await _api.StartSessionAsync(UsernameBox.Text.Trim(), PasswordBox.Password);
            ApplySession(session, "Session aktif. Komputer boleh digunakan.");
        }
        catch (Exception ex)
        {
            ErrorText.Text = ex.Message;
            MessageText.Text = "Login gagal. Hubungi operator jika akun tidak valid.";
        }
        finally
        {
            LoginButton.IsEnabled = true;
            PasswordBox.Clear();
        }
    }

    private async void StopButton_Click(object sender, RoutedEventArgs e)
    {
        if (_activeSession is null) return;
        try
        {
            await _api.StopSessionAsync(_activeSession.Id, "User logout from Windows client");
        }
        catch
        {
            // Tetap kunci lokal walau server gagal, supaya client tidak bebas terbuka.
        }
        ResetToLogin("Session selesai. Hubungi operator untuk isi ulang jika waktu sudah habis.");
    }

    private void SyncSessionFromServer(SessionResponse session)
    {
        var isSameSession = _activeSession?.Id == session.Id;
        _activeSession = session;

        if (!isSameSession)
        {
            ApplySession(session, "Session aktif dipulihkan dari server.");
            return;
        }

        SessionUserText.Text = $"{session.Username} · Session #{session.Id}";
        RefreshSessionClock();
    }

    private void ApplySession(SessionResponse session, string message)
    {
        _activeSession = session;
        _finalActionTriggered = false;
        _remoteActionTriggered = false;
        _pendingAction = NormalizeAction(_settings.DefaultExpireAction);
        LoginPanel.Visibility = Visibility.Collapsed;
        WarningPanel.Visibility = Visibility.Collapsed;
        SessionPanel.Visibility = Visibility.Visible;
        SessionUserText.Text = $"{session.Username} · Session #{session.Id}";
        MessageText.Text = message;
        ShowMiniBar();
        _miniBar.StopWarning();
        HideMainWindowForActiveSession();
        RefreshSessionClock();
    }

    private void RefreshSessionClock()
    {
        if (_activeSession is null || _finalActionTriggered || _remoteActionTriggered) return;

        var now = DateTimeOffset.Now;
        var remaining = _activeSession.EndTime - now;
        var expireAction = NormalizeAction(_settings.DefaultExpireAction);
        var warningThresholdSeconds = ReadInt(_settings.ShutdownWarningSeconds, 60);

        if (remaining <= TimeSpan.Zero)
        {
            ExecuteFinalAction(expireAction, "Waktu habis. Menjalankan aksi akhir session.");
            return;
        }

        var remainingText = remaining.TotalHours >= 1
            ? $"{(int)remaining.TotalHours:00}:{remaining.Minutes:00}:{remaining.Seconds:00}"
            : $"{remaining.Minutes:00}:{remaining.Seconds:00}";

        RemainingText.Text = remainingText;
        _miniBar.UpdateDisplay(_activeSession.ComputerCode, _activeSession.Username, remainingText);

        var total = Math.Max(1, (_activeSession.EndTime - _activeSession.StartTime).TotalSeconds);
        var used = Math.Clamp((now - _activeSession.StartTime).TotalSeconds, 0, total);
        UsageProgress.Value = used / total * 100;

        if (expireAction != "lock" && remaining.TotalSeconds <= warningThresholdSeconds)
        {
            ShowExpiryWarning(expireAction, remaining);
            return;
        }

        if (WarningPanel.Visibility == Visibility.Visible)
        {
            WarningPanel.Visibility = Visibility.Collapsed;
            SessionPanel.Visibility = Visibility.Visible;
        }

        _miniBar.StopWarning();
    }

    private async Task HandleCommandAsync(CommandResponse command)
    {
        try
        {
            switch (command.Command)
            {
                case "lock":
                    if (_activeSession is not null)
                    {
                        await _api.StopSessionAsync(_activeSession.Id, "Remote lock from operator");
                    }
                    ResetToLogin("Komputer dikunci oleh operator.");
                    _power.Lock();
                    break;
                case "shutdown":
                    ExecuteImmediatePowerAction("shutdown", "Command shutdown diterima dari operator.");
                    break;
                case "restart":
                    ExecuteImmediatePowerAction("restart", "Command restart diterima dari operator.");
                    break;
            }
            await _api.AckCommandAsync(command.Id, true, "Handled by Windows client");
        }
        catch (Exception ex)
        {
            await _api.AckCommandAsync(command.Id, false, ex.Message);
        }
    }

    private void ShowExpiryWarning(string action, TimeSpan remaining)
    {
        if (_activeSession is null) return;

        _pendingAction = action;
        ShowMiniBar();
        _miniBar.ShowWarning(
            _activeSession.ComputerCode,
            _activeSession.Username,
            action,
            Math.Max(0, (int)Math.Ceiling(remaining.TotalSeconds)).ToString());
        HideMainWindowForActiveSession();
    }

    private void ExecuteImmediatePowerAction(string action, string message)
    {
        _remoteActionTriggered = true;
        if (_activeSession is not null)
        {
            ShowMiniBar();
            _miniBar.ShowWarning(_activeSession.ComputerCode, _activeSession.Username, action, "0");
        }
        else
        {
            ShowMainWindow();
        }

        WarningTitleText.Text = action == "restart" ? "Restart Komputer" : "Shutdown Komputer";
        WarningMessageText.Text = message;
        WarningCountdownText.Text = "0";
        SessionPanel.Visibility = Visibility.Collapsed;
        LoginPanel.Visibility = Visibility.Collapsed;
        WarningPanel.Visibility = Visibility.Visible;

        if (action == "restart") _power.Restart();
        else _power.Shutdown();
    }

    private void ExecuteFinalAction(string action, string message)
    {
        if (_finalActionTriggered) return;
        _finalActionTriggered = true;
        _pendingAction = action;

        if (action == "lock")
        {
            ResetToLogin("Waktu habis. Komputer kembali terkunci.");
            _power.Lock();
            return;
        }

        if (_activeSession is not null)
        {
            ShowMiniBar();
            _miniBar.ShowWarning(_activeSession.ComputerCode, _activeSession.Username, action, "0");
        }
        else
        {
            ShowMainWindow();
        }

        WarningTitleText.Text = action == "restart" ? "Restart Komputer" : "Shutdown Komputer";
        WarningMessageText.Text = message;
        WarningCountdownText.Text = "0";
        SessionPanel.Visibility = Visibility.Collapsed;
        LoginPanel.Visibility = Visibility.Collapsed;
        WarningPanel.Visibility = Visibility.Visible;

        if (action == "restart") _power.Restart();
        else _power.Shutdown();
    }

    private void ResetToLogin(string message)
    {
        _activeSession = null;
        _finalActionTriggered = false;
        _remoteActionTriggered = false;
        ShowMainWindow();
        _miniBar.StopWarning();
        HideMiniBar();
        SessionPanel.Visibility = Visibility.Collapsed;
        WarningPanel.Visibility = Visibility.Collapsed;
        LoginPanel.Visibility = Visibility.Visible;
        MessageText.Text = message;
        UsernameBox.Text = "";
        PasswordBox.Clear();
        Activate();
    }

    private void ShowMiniBar()
    {
        if (!_miniBar.IsVisible)
        {
            _miniBar.Show();
        }
        _miniBar.Topmost = true;
        _miniBar.PositionAtTopCenter();
    }

    private void HideMiniBar()
    {
        if (_miniBar.IsVisible)
        {
            _miniBar.Hide();
        }
    }

    private void HideMainWindowForActiveSession()
    {
        Hide();
    }

    private void ShowMainWindow()
    {
        if (!IsVisible)
        {
            Show();
        }
        WindowState = WindowState.Maximized;
        Topmost = true;
        Activate();
        Focus();
    }

    private void EnforcePreLoginGuard()
    {
        if (_activeSession is not null || _finalActionTriggered || _remoteActionTriggered)
        {
            return;
        }

        HideMiniBar();

        if (!IsVisible)
        {
            Show();
        }

        if (WindowState != WindowState.Maximized)
        {
            WindowState = WindowState.Maximized;
        }

        if (!Topmost)
        {
            Topmost = true;
        }
    }

    private void Window_StateChanged(object sender, EventArgs e)
    {
        if (_activeSession is not null && WindowState == WindowState.Minimized)
        {
            WindowState = WindowState.Maximized;
            HideMainWindowForActiveSession();
            return;
        }

        if (_activeSession is null && WindowState == WindowState.Minimized)
        {
            WindowState = WindowState.Maximized;
            ShowMainWindow();
        }
    }

    private void MainWindow_Deactivated(object? sender, EventArgs e)
    {
        if (_activeSession is not null || _finalActionTriggered || _remoteActionTriggered)
        {
            return;
        }

        Dispatcher.BeginInvoke(ShowMainWindow, DispatcherPriority.ApplicationIdle);
    }

    private void MainWindow_PreviewKeyDown(object sender, KeyEventArgs e)
    {
        if (_activeSession is not null)
        {
            return;
        }

        if ((Keyboard.Modifiers & ModifierKeys.Alt) == ModifierKeys.Alt && e.SystemKey == Key.F4)
        {
            e.Handled = true;
            return;
        }

        if ((Keyboard.Modifiers & ModifierKeys.Alt) == ModifierKeys.Alt && e.SystemKey == Key.Space)
        {
            e.Handled = true;
            return;
        }

        if ((Keyboard.Modifiers & ModifierKeys.Control) == ModifierKeys.Control && e.Key == Key.Escape)
        {
            e.Handled = true;
        }
    }

    private void MainWindow_SourceInitialized(object? sender, EventArgs e)
    {
        if (PresentationSource.FromVisual(this) is HwndSource source)
        {
            source.AddHook(WndProc);
        }
    }

    private IntPtr WndProc(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
    {
        const int WM_CLOSE = 0x0010;
        const int WM_SYSCOMMAND = 0x0112;
        const int SC_CLOSE = 0xF060;
        const int SC_MINIMIZE = 0xF020;

        if (_activeSession is null && !_finalActionTriggered && !_remoteActionTriggered)
        {
            if (msg == WM_CLOSE)
            {
                handled = true;
                Dispatcher.BeginInvoke(ShowMainWindow, DispatcherPriority.ApplicationIdle);
                return IntPtr.Zero;
            }

            if (msg == WM_SYSCOMMAND)
            {
                var command = wParam.ToInt32() & 0xFFF0;
                if (command == SC_CLOSE || command == SC_MINIMIZE)
                {
                    handled = true;
                    Dispatcher.BeginInvoke(ShowMainWindow, DispatcherPriority.ApplicationIdle);
                    return IntPtr.Zero;
                }
            }
        }

        return IntPtr.Zero;
    }

    private void Window_Closing(object? sender, CancelEventArgs e)
    {
        e.Cancel = true;

        if (_activeSession is not null)
        {
            HideMainWindowForActiveSession();
            ShowMiniBar();
            return;
        }

        ShowMainWindow();
    }

    private static string NormalizeAction(string? action)
    {
        return string.IsNullOrWhiteSpace(action) ? "shutdown" : action.Trim().ToLowerInvariant();
    }

    private static int ReadInt(string? value, int fallback)
    {
        return int.TryParse(value, out var parsed) && parsed > 0 ? parsed : fallback;
    }
}
