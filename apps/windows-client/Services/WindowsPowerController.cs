using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows;
using System.Windows.Input;
using System.Windows.Interop;

namespace PerpusBilling.WindowsClient;

public sealed class WindowsPowerController
{
    private readonly WindowsClientLogger? _logger;

    public WindowsPowerController(WindowsClientLogger? logger = null)
    {
        _logger = logger;
    }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool LockWorkStation();

    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr FindWindow(string? lpClassName, string? lpWindowName);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool UnregisterHotKey(IntPtr hWnd, int id);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool ShowCursor(bool bShow);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool BringWindowToTop(IntPtr hWnd);

    private const int SW_HIDE = 0;
    private const int SW_SHOW = 5;
    private const uint SWP_NOMOVE = 0x0002;
    private const uint SWP_NOSIZE = 0x0001;
    private const uint SWP_NOACTIVATE = 0x0010;
    private static readonly IntPtr HWND_TOPMOST = new(-1);
    private static readonly IntPtr HWND_NOTOPMOST = new(-2);
    private const uint MOD_ALT = 0x0001;
    private const uint MOD_NOREPEAT = 0x4000;
    private const uint VK_TAB = 0x09;
    private const uint VK_ESCAPE = 0x1B;
    private const uint VK_LWIN = 0x5B;
    private const uint VK_RWIN = 0x5C;

    private const int HotKeyAltTab = 0xB101;
    private const int HotKeyAltEsc = 0xB102;
    private const int HotKeyLeftWin = 0xB103;
    private const int HotKeyRightWin = 0xB104;

    public void Lock()
    {
        if (!OperatingSystem.IsWindows()) return;
        _logger?.Warn("Lock workstation requested");
        LockWorkStation();
    }

    public void Shutdown()
    {
        RunShutdownCommand("/s /t 0");
    }

    public void Restart()
    {
        RunShutdownCommand("/r /t 0");
    }

    private void RunShutdownCommand(string arguments)
    {
        if (!OperatingSystem.IsWindows()) return;
        _logger?.Warn("Power command requested", ("command", "shutdown.exe"), ("arguments", arguments));
        Process.Start(new ProcessStartInfo
        {
            FileName = "shutdown.exe",
            Arguments = arguments,
            CreateNoWindow = true,
            UseShellExecute = false
        });
    }

    public void MakeWindowKiosk(Window window)
    {
        window.WindowStyle = WindowStyle.None;
        window.ResizeMode = ResizeMode.NoResize;
        window.Topmost = true;
        window.WindowState = WindowState.Maximized;
        window.ShowInTaskbar = false;
    }

    public void SetShellVisibility(bool visible)
    {
        if (!OperatingSystem.IsWindows()) return;

        ToggleWindow("Shell_TrayWnd", visible);
        ToggleWindow("Button", visible);
    }

    public void SetCursorVisibility(bool visible)
    {
        if (!OperatingSystem.IsWindows()) return;

        try
        {
            var maxAttempts = 8;
            for (var i = 0; i < maxAttempts; i++)
            {
                var result = ShowCursor(visible);
                if ((visible && result >= 0) || (!visible && result < 0))
                {
                    break;
                }
            }
        }
        catch (Exception ex)
        {
            _logger?.Warn("Failed to toggle cursor visibility", ("visible", visible.ToString()), ("message", ex.Message));
        }
    }

    public void SetWindowTopmost(IntPtr hwnd, bool topmost)
    {
        if (!OperatingSystem.IsWindows() || hwnd == IntPtr.Zero) return;
        SetWindowPos(hwnd, topmost ? HWND_TOPMOST : HWND_NOTOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
    }

    public void RegisterPreLoginHotKeys(IntPtr hwnd)
    {
        if (!OperatingSystem.IsWindows() || hwnd == IntPtr.Zero) return;
        RegisterHotKey(hwnd, HotKeyAltTab, MOD_ALT | MOD_NOREPEAT, VK_TAB);
        RegisterHotKey(hwnd, HotKeyAltEsc, MOD_ALT | MOD_NOREPEAT, VK_ESCAPE);
        RegisterHotKey(hwnd, HotKeyLeftWin, MOD_NOREPEAT, VK_LWIN);
        RegisterHotKey(hwnd, HotKeyRightWin, MOD_NOREPEAT, VK_RWIN);
    }

    public void UnregisterPreLoginHotKeys(IntPtr hwnd)
    {
        if (!OperatingSystem.IsWindows() || hwnd == IntPtr.Zero) return;
        UnregisterHotKey(hwnd, HotKeyAltTab);
        UnregisterHotKey(hwnd, HotKeyAltEsc);
        UnregisterHotKey(hwnd, HotKeyLeftWin);
        UnregisterHotKey(hwnd, HotKeyRightWin);
    }

    public bool IsForegroundProcessCurrent()
    {
        if (!OperatingSystem.IsWindows()) return true;

        try
        {
            var hwnd = GetForegroundWindow();
            if (hwnd == IntPtr.Zero)
            {
                return false;
            }

            GetWindowThreadProcessId(hwnd, out var processId);
            return processId == Environment.ProcessId;
        }
        catch (Exception ex)
        {
            _logger?.Warn("Failed to inspect foreground window", ("message", ex.Message));
            return true;
        }
    }

    public void KillProcessByName(params string[] processNames)
    {
        if (!OperatingSystem.IsWindows() || processNames.Length == 0) return;

        foreach (var rawName in processNames)
        {
            var name = rawName?.Trim();
            if (string.IsNullOrWhiteSpace(name)) continue;

            try
            {
                foreach (var process in Process.GetProcessesByName(name))
                {
                    if (process.Id == Environment.ProcessId)
                    {
                        continue;
                    }

                    _logger?.Warn("Terminating blocked process", ("process", process.ProcessName), ("pid", process.Id.ToString()));
                    process.Kill(true);
                }
            }
            catch (Exception ex)
            {
                _logger?.Warn("Failed to terminate blocked process", ("process", name), ("message", ex.Message));
            }
        }
    }

    public string CreateHardeningSummary()
    {
        var builder = new StringBuilder();
        builder.AppendLine("App guard aktif:");
        builder.AppendLine("- fullscreen/topmost pre-login");
        builder.AppendLine("- hidden from taskbar pre-login");
        builder.AppendLine("- hotkey block: Alt+Tab, Alt+Esc, Win");
        builder.AppendLine("- shell/taskbar hide pre-login");
        builder.AppendLine("- focus reclaim + foreground check");
        builder.AppendLine("- best-effort Task Manager kill pre-login");
        builder.AppendLine("- auto relaunch on pre-login crash");
        builder.AppendLine("- startup fallback via Startup shortcut");
        return builder.ToString().TrimEnd();
    }

    public void ForceForeground(Window window)
    {
        if (!OperatingSystem.IsWindows()) return;

        try
        {
            if (PresentationSource.FromVisual(window) is not HwndSource source)
            {
                return;
            }

            var hwnd = source.Handle;
            if (hwnd == IntPtr.Zero)
            {
                return;
            }

            BringWindowToTop(hwnd);
            SetForegroundWindow(hwnd);
        }
        catch (Exception ex)
        {
            _logger?.Warn("Failed to force foreground window", ("message", ex.Message));
        }
    }

    private static void ToggleWindow(string className, bool visible)
    {
        var hwnd = FindWindow(className, null);
        if (hwnd != IntPtr.Zero)
        {
            ShowWindow(hwnd, visible ? SW_SHOW : SW_HIDE);
        }
    }
}
