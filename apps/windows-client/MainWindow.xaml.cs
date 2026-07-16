using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Threading;
using PerpusBilling.WindowsClient.Models;

namespace PerpusBilling.WindowsClient;

public partial class MainWindow : Window
{
    private const int WM_HOTKEY = 0x0312;

    private readonly ClientConfig _config;
    private readonly PerpusApiClient _api;
    private readonly WindowsPowerController _power;
    private readonly WindowsClientLogger _logger;
    private readonly DispatcherTimer _heartbeatTimer = new();
    private readonly DispatcherTimer _clockTimer = new();
    private readonly DispatcherTimer _guardTimer = new();
    private readonly MiniBarWindow _miniBar = new();

    private SettingsResponse _settings = new();
    private bool _adminExitUnlocked;
    private SessionResponse? _activeSession;
    private bool _finalActionTriggered;
    private bool _remoteActionTriggered;
    private bool _serverOffline;
    private DateTimeOffset? _lastSuccessfulHeartbeatAt;
    private string _pendingAction = "shutdown";

    public MainWindow(ClientConfig config, PerpusApiClient api, WindowsPowerController power, WindowsClientLogger logger)
    {
        InitializeComponent();
        _config = config;
        _api = api;
        _power = power;
        _logger = logger;

        _power.MakeWindowKiosk(this);
        ComputerCodeText.Text = _config.NormalizedComputerCode;
        FooterText.Text = $"Server: {_config.NormalizedServerUrl} · Client: {_config.ClientVersion}";

        _heartbeatTimer.Tick += async (_, _) => await HeartbeatAsync();
        _clockTimer.Interval = TimeSpan.FromSeconds(1);
        _clockTimer.Tick += (_, _) => RefreshSessionClock();
        _guardTimer.Interval = TimeSpan.FromMilliseconds(800);
        _guardTimer.Tick += (_, _) => EnforcePreLoginGuard();
        _miniBar.ExitRequested += MiniBar_ExitRequested;

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
            MarkServerOnline(heartbeat);

            if (heartbeat.ActiveSession is not null)
            {
                SyncSessionFromServer(heartbeat.ActiveSession);
            }
            else if (_activeSession is not null && !_finalActionTriggered)
            {
                _logger.Warn("Server reports no active session; returning to login", ("sessionId", _activeSession.Id));
                ResetToLogin("Session sudah tidak aktif. Komputer kembali terkunci.");
            }

            foreach (var command in heartbeat.Commands)
            {
                await HandleCommandAsync(command);
            }
        }
        catch (Exception ex)
        {
            MarkServerOffline(ex);
        }
        finally
        {
            ScheduleNextHeartbeat();
        }
    }

    private void ApplySettings()
    {
        BusinessNameText.Text = _settings.BusinessName;
        AdminExitHintText.Text = _config.AutoStartOnLogin
            ? "Mode auto-start aktif. Masukkan kode admin untuk menutup aplikasi lalu kembali ke desktop Windows."
            : "Masukkan kode admin untuk menutup aplikasi client ini."
            ;
    }

    private void ScheduleNextHeartbeat()
    {
        var seconds = ReadInt(_settings.HeartbeatIntervalSeconds, _config.HeartbeatFallbackSeconds);
        _heartbeatTimer.Stop();
        _heartbeatTimer.Interval = TimeSpan.FromSeconds(Math.Max(1, seconds));
        _heartbeatTimer.Start();
    }

    private void MarkServerOnline(HeartbeatResponse heartbeat)
    {
        _lastSuccessfulHeartbeatAt = DateTimeOffset.Now;
        if (_serverOffline)
        {
            _logger.Info("Server connection restored", ("computerStatus", heartbeat.Computer?.Status ?? "unknown"));
        }

        _serverOffline = false;
        ServerStatusText.Text = $"Online · {heartbeat.Computer?.Status ?? "unknown"}";
        ErrorText.Text = "";
        if (_activeSession is not null)
        {
            MessageText.Text = "Session aktif. Koneksi server normal.";
        }
    }

    private void MarkServerOffline(Exception ex)
    {
        if (!_serverOffline)
        {
            _logger.Warn("Server connection lost", ("message", ex.Message));
        }

        _serverOffline = true;
        var lastSeen = _lastSuccessfulHeartbeatAt is null
            ? "belum pernah berhasil"
            : $"terakhir online {_lastSuccessfulHeartbeatAt:HH:mm:ss}";
        ServerStatusText.Text = $"Offline · mencoba konek ulang ({lastSeen})";
        ErrorText.Text = ex.Message;

        if (_activeSession is not null && !_finalActionTriggered && !_remoteActionTriggered)
        {
            MessageText.Text = "Koneksi server terputus. Timer lokal tetap berjalan, client akan reconnect otomatis.";
            _miniBar.ShowOffline(_activeSession.ComputerCode, _activeSession.Username, RemainingText.Text);
        }
    }

    private async void LoginButton_Click(object sender, RoutedEventArgs e)
    {
        ErrorText.Text = "";
        MessageText.Text = "Memvalidasi akun...";
        LoginButton.IsEnabled = false;

        try
        {
            var session = await _api.StartSessionAsync(UsernameBox.Text.Trim(), PasswordBox.Password);
            _logger.Info("Session started", ("sessionId", session.Id), ("username", session.Username), ("computer", session.ComputerCode));
            ApplySession(session, "Session aktif. Komputer boleh digunakan.");
        }
        catch (Exception ex)
        {
            _logger.Warn("Login failed", ("username", UsernameBox.Text.Trim()), ("message", ex.Message));
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
        await StopSessionToLoginAsync();
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
        _logger.Info("Apply active session", ("sessionId", session.Id), ("username", session.Username), ("endTime", session.EndTime));
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
        RestorePostLoginShell();
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
        if (_serverOffline)
        {
            _miniBar.ShowOffline(_activeSession.ComputerCode, _activeSession.Username, remainingText);
        }
        else
        {
            _miniBar.UpdateDisplay(_activeSession.ComputerCode, _activeSession.Username, remainingText);
        }

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
            _logger.Info("Command received", ("commandId", command.Id), ("command", command.Command), ("note", command.Note));
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
            _logger.Info("Command acknowledged", ("commandId", command.Id), ("command", command.Command));
        }
        catch (Exception ex)
        {
            _logger.Error("Command handling failed", ex, ("commandId", command.Id), ("command", command.Command));
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
        _logger.Warn("Immediate power action triggered", ("action", action), ("sessionId", _activeSession?.Id), ("message", message));
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
        _logger.Warn("Final action triggered", ("action", action), ("sessionId", _activeSession?.Id), ("message", message));

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

    private async Task StopSessionToLoginAsync()
    {
        if (_activeSession is null) return;
        var sessionId = _activeSession.Id;
        try
        {
            await _api.StopSessionAsync(sessionId, "User logout from Windows client");
            _logger.Info("Session stopped by user", ("sessionId", sessionId));
        }
        catch (Exception ex)
        {
            _logger.Warn("Stop session failed; locking local client anyway", ("sessionId", sessionId), ("message", ex.Message));
            // Tetap kunci lokal walau server gagal, supaya client tidak bebas terbuka.
        }
        ResetToLogin("Session selesai. Hubungi operator untuk isi ulang jika waktu sudah habis.");
    }

    private async Task StopSessionAndShutdownAsync()
    {
        if (_activeSession is null) return;

        var username = _activeSession.Username;
        var confirm = MessageBox.Show(
            $"Akhiri session {username} sekarang?\nSisa waktu user akan disimpan di server, lalu komputer akan shutdown.",
            "Konfirmasi Keluar",
            MessageBoxButton.YesNo,
            MessageBoxImage.Question,
            MessageBoxResult.No);

        if (confirm != MessageBoxResult.Yes)
        {
            return;
        }

        try
        {
            await _api.StopSessionAsync(_activeSession.Id, "User exit from mini bar and shutdown Windows client");
            _logger.Info("Session stopped from mini bar", ("sessionId", _activeSession.Id));
        }
        catch (Exception ex)
        {
            _logger.Warn("Mini bar exit failed to stop session", ("sessionId", _activeSession.Id), ("message", ex.Message));
            MessageBox.Show(
                $"Gagal menyimpan status session ke server:\n{ex.Message}\n\nShutdown dibatalkan agar waktu user tidak hilang.",
                "Gagal Menyimpan Session",
                MessageBoxButton.OK,
                MessageBoxImage.Warning);
            return;
        }

        _remoteActionTriggered = true;
        _logger.Warn("Mini bar user exit requested shutdown", ("sessionId", _activeSession.Id), ("username", username));
        _miniBar.ShowWarning(_activeSession.ComputerCode, _activeSession.Username, "shutdown", "0");
        _power.Shutdown();
    }

    private void AdminExitExpander_Expanded(object sender, RoutedEventArgs e)
    {
        AdminExitCodeBox.Clear();
        ErrorText.Text = "";
        AdminExitCodeBox.Focus();
    }

    private void AdminExitCancelButton_Click(object sender, RoutedEventArgs e)
    {
        AdminExitExpander.IsExpanded = false;
        AdminExitCodeBox.Clear();
        ErrorText.Text = "";
        UsernameBox.Focus();
    }

    private async void AdminExitButton_Click(object sender, RoutedEventArgs e)
    {
        ErrorText.Text = "";
        AdminExitButton.IsEnabled = false;

        try
        {
            if (!string.Equals(AdminExitCodeBox.Password, _config.AdminExitCode, StringComparison.Ordinal))
            {
                AdminExitCodeBox.Clear();
                ErrorText.Text = "Kode admin salah.";
                AdminExitCodeBox.Focus();
                return;
            }

            _logger.Warn("Admin exit accepted");
            await ExitToWindowsAsync();
        }
        finally
        {
            if (!_adminExitUnlocked)
            {
                AdminExitButton.IsEnabled = true;
            }
        }
    }

    private async Task ExitToWindowsAsync()
    {
        _adminExitUnlocked = true;
        _heartbeatTimer.Stop();
        _clockTimer.Stop();
        _guardTimer.Stop();
        Deactivated -= MainWindow_Deactivated;
        PreviewKeyDown -= MainWindow_PreviewKeyDown;
        StateChanged -= Window_StateChanged;
        Closing -= Window_Closing;
        RestorePostLoginShell();
        _miniBar.ExitRequested -= MiniBar_ExitRequested;
        if (_miniBar.IsVisible)
        {
            _miniBar.Hide();
        }
        _miniBar.Close();
        Topmost = false;
        ShowInTaskbar = true;
        WindowStyle = WindowStyle.SingleBorderWindow;
        ResizeMode = ResizeMode.CanResize;
        MessageText.Text = "Menutup client dan mengembalikan Windows...";

        if (PresentationSource.FromVisual(this) is HwndSource source)
        {
            _power.UnregisterPreLoginHotKeys(source.Handle);
            source.RemoveHook(WndProc);
        }

        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = "explorer.exe",
                UseShellExecute = true
            });
        }
        catch
        {
            // best effort; kalau explorer gagal, tetap lanjut tutup app
        }

        await Dispatcher.InvokeAsync(() =>
        {
            Hide();
            Close();
        }, DispatcherPriority.Send);

        await Task.Delay(200);
        Application.Current.ShutdownMode = ShutdownMode.OnExplicitShutdown;
        Application.Current.Shutdown();
        await Task.Delay(200);
        Environment.Exit(0);
    }

    private void ResetToLogin(string message)
    {
        _logger.Info("Reset to login", ("message", message));
        _activeSession = null;
        _finalActionTriggered = false;
        _remoteActionTriggered = false;
        ApplyPreLoginHardening();
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

    private async void MiniBar_ExitRequested(object? sender, EventArgs e)
    {
        await StopSessionAndShutdownAsync();
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
        Topmost = IsPreLoginLocked();
        Activate();
        Focus();
    }

    private void EnforcePreLoginGuard()
    {
        if (!IsPreLoginLocked())
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
        if (_adminExitUnlocked)
        {
            return;
        }

        if (_activeSession is not null && WindowState == WindowState.Minimized)
        {
            WindowState = WindowState.Maximized;
            HideMainWindowForActiveSession();
            return;
        }

        if (IsPreLoginLocked() && WindowState == WindowState.Minimized)
        {
            WindowState = WindowState.Maximized;
            ShowMainWindow();
        }
    }

    private void MainWindow_Deactivated(object? sender, EventArgs e)
    {
        if (!IsPreLoginLocked())
        {
            return;
        }

        Dispatcher.BeginInvoke(ShowMainWindow, DispatcherPriority.ApplicationIdle);
    }

    private void MainWindow_PreviewKeyDown(object sender, KeyEventArgs e)
    {
        if (!IsPreLoginLocked())
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
            _power.RegisterPreLoginHotKeys(source.Handle);
            _power.SetWindowTopmost(source.Handle, true);
        }
        ApplyPreLoginHardening();
    }

    private IntPtr WndProc(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
    {
        const int WM_CLOSE = 0x0010;
        const int WM_SYSCOMMAND = 0x0112;
        const int SC_CLOSE = 0xF060;
        const int SC_MINIMIZE = 0xF020;

        if (msg == WM_HOTKEY && IsPreLoginLocked())
        {
            handled = true;
            Dispatcher.BeginInvoke(ShowMainWindow, DispatcherPriority.ApplicationIdle);
            return IntPtr.Zero;
        }

        if (IsPreLoginLocked())
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
        if (_adminExitUnlocked)
        {
            e.Cancel = false;
            return;
        }

        e.Cancel = true;

        if (_activeSession is not null)
        {
            HideMainWindowForActiveSession();
            ShowMiniBar();
            return;
        }

        ShowMainWindow();
    }

    public bool IsPreLoginLocked()
    {
        return _activeSession is null && !_finalActionTriggered && !_remoteActionTriggered && !_adminExitUnlocked;
    }

    public bool IsAdminExitInProgress => _adminExitUnlocked;

    public bool HasActiveSession => _activeSession is not null;

    private void ApplyPreLoginHardening()
    {
        if (!OperatingSystem.IsWindows() || !IsLoaded || _adminExitUnlocked) return;
        _power.SetShellVisibility(false);
        if (PresentationSource.FromVisual(this) is HwndSource source)
        {
            _power.SetWindowTopmost(source.Handle, true);
        }
        Topmost = true;
    }

    private void RestorePostLoginShell()
    {
        if (!OperatingSystem.IsWindows()) return;
        _power.SetShellVisibility(true);
        if (PresentationSource.FromVisual(this) is HwndSource source)
        {
            _power.SetWindowTopmost(source.Handle, false);
        }
        Topmost = false;
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
