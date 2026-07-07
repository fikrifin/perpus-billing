using System.Windows;
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
    private readonly DispatcherTimer _warningTimer = new();

    private SettingsResponse _settings = new();
    private SessionResponse? _activeSession;
    private int _warningSeconds;
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
        _warningTimer.Interval = TimeSpan.FromSeconds(1);
        _warningTimer.Tick += (_, _) => TickWarningCountdown();

        Loaded += async (_, _) =>
        {
            _clockTimer.Start();
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
                ApplySession(heartbeat.ActiveSession, "Session aktif dipulihkan dari server.");
            }
            else if (_activeSession is not null && WarningPanel.Visibility != Visibility.Visible)
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
        _warningSeconds = ReadInt(_settings.ShutdownWarningSeconds, 60);
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

    private void ApplySession(SessionResponse session, string message)
    {
        _activeSession = session;
        LoginPanel.Visibility = Visibility.Collapsed;
        WarningPanel.Visibility = Visibility.Collapsed;
        SessionPanel.Visibility = Visibility.Visible;
        SessionUserText.Text = $"{session.Username} · Session #{session.Id}";
        MessageText.Text = message;
        RefreshSessionClock();
    }

    private void RefreshSessionClock()
    {
        if (_activeSession is null) return;

        var now = DateTimeOffset.Now;
        var remaining = _activeSession.EndTime - now;
        if (remaining <= TimeSpan.Zero)
        {
            TriggerExpireAction(_settings.DefaultExpireAction, "Waktu habis.");
            return;
        }

        RemainingText.Text = remaining.TotalHours >= 1
            ? $"{(int)remaining.TotalHours:00}:{remaining.Minutes:00}:{remaining.Seconds:00}"
            : $"{remaining.Minutes:00}:{remaining.Seconds:00}";

        var total = Math.Max(1, (_activeSession.EndTime - _activeSession.StartTime).TotalSeconds);
        var used = Math.Clamp((now - _activeSession.StartTime).TotalSeconds, 0, total);
        UsageProgress.Value = used / total * 100;
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
                    TriggerExpireAction("shutdown", "Command shutdown diterima dari operator.");
                    break;
                case "restart":
                    TriggerExpireAction("restart", "Command restart diterima dari operator.");
                    break;
            }
            await _api.AckCommandAsync(command.Id, true, "Handled by Windows client");
        }
        catch (Exception ex)
        {
            await _api.AckCommandAsync(command.Id, false, ex.Message);
        }
    }

    private void TriggerExpireAction(string? action, string message)
    {
        _pendingAction = string.IsNullOrWhiteSpace(action) ? "shutdown" : action;
        if (_pendingAction == "lock")
        {
            ResetToLogin("Waktu habis. Komputer kembali terkunci.");
            _power.Lock();
            return;
        }

        SessionPanel.Visibility = Visibility.Collapsed;
        LoginPanel.Visibility = Visibility.Collapsed;
        WarningPanel.Visibility = Visibility.Visible;
        WarningTitleText.Text = _pendingAction == "restart" ? "Restart Komputer" : "Shutdown Komputer";
        WarningMessageText.Text = $"{message} Komputer akan {_pendingAction} otomatis.";
        _warningSeconds = ReadInt(_settings.ShutdownWarningSeconds, 60);
        WarningCountdownText.Text = _warningSeconds.ToString();
        _warningTimer.Start();
    }

    private void TickWarningCountdown()
    {
        _warningSeconds -= 1;
        WarningCountdownText.Text = Math.Max(0, _warningSeconds).ToString();
        if (_warningSeconds > 0) return;

        _warningTimer.Stop();
        if (_pendingAction == "restart") _power.Restart();
        else _power.Shutdown();
    }

    private void ResetToLogin(string message)
    {
        _activeSession = null;
        _warningTimer.Stop();
        SessionPanel.Visibility = Visibility.Collapsed;
        WarningPanel.Visibility = Visibility.Collapsed;
        LoginPanel.Visibility = Visibility.Visible;
        MessageText.Text = message;
        UsernameBox.Text = "";
        PasswordBox.Clear();
    }

    private static int ReadInt(string? value, int fallback)
    {
        return int.TryParse(value, out var parsed) && parsed > 0 ? parsed : fallback;
    }
}
