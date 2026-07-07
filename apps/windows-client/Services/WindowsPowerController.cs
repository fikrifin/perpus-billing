using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Windows;

namespace PerpusBilling.WindowsClient;

public sealed class WindowsPowerController
{
    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool LockWorkStation();

    public void Lock()
    {
        if (!OperatingSystem.IsWindows()) return;
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

    private static void RunShutdownCommand(string arguments)
    {
        if (!OperatingSystem.IsWindows()) return;
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
}
