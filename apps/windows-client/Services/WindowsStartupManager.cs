using Microsoft.Win32;
using System.Diagnostics;

namespace PerpusBilling.WindowsClient;

public sealed class WindowsStartupManager
{
    private const string RunKeyPath = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string AppName = "PerpusBillingWindowsClient";

    public void EnsureStartup(bool enabled)
    {
        if (!OperatingSystem.IsWindows()) return;

        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(RunKeyPath, writable: true)
                         ?? Registry.CurrentUser.CreateSubKey(RunKeyPath, writable: true);
            if (key is null) return;

            if (!enabled)
            {
                key.DeleteValue(AppName, throwOnMissingValue: false);
                return;
            }

            var executablePath = Environment.ProcessPath;
            if (string.IsNullOrWhiteSpace(executablePath)) return;
            key.SetValue(AppName, Quote(executablePath));
        }
        catch
        {
            // best effort only; app tetap jalan normal walau gagal register startup
        }
    }

    public string? GetRegisteredCommand()
    {
        if (!OperatingSystem.IsWindows()) return null;
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(RunKeyPath, writable: false);
            return key?.GetValue(AppName) as string;
        }
        catch
        {
            return null;
        }
    }

    public bool TryLaunchCurrentExecutable(string reason)
    {
        if (!OperatingSystem.IsWindows()) return false;

        try
        {
            var executablePath = Environment.ProcessPath;
            if (string.IsNullOrWhiteSpace(executablePath)) return false;

            Process.Start(new ProcessStartInfo
            {
                FileName = executablePath,
                UseShellExecute = true,
                Arguments = $"--relaunch-reason={reason}"
            });

            return true;
        }
        catch
        {
            return false;
        }
    }

    private static string Quote(string path)
    {
        return path.Contains(' ') ? $"\"{path}\"" : path;
    }
}
