using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Input;

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

    private const int HotKeyAltTab = 0xB101;
    private const int HotKeyAltEsc = 0xB102;

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
    }

    public void SetShellVisibility(bool visible)
    {
        if (!OperatingSystem.IsWindows()) return;

        ToggleWindow("Shell_TrayWnd", visible);
        ToggleWindow("Button", visible);
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
    }

    public void UnregisterPreLoginHotKeys(IntPtr hwnd)
    {
        if (!OperatingSystem.IsWindows() || hwnd == IntPtr.Zero) return;
        UnregisterHotKey(hwnd, HotKeyAltTab);
        UnregisterHotKey(hwnd, HotKeyAltEsc);
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
