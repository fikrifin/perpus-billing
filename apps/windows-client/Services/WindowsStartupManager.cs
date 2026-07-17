using IWshRuntimeLibrary;
using Microsoft.Win32;
using System.Diagnostics;
using System.IO;

namespace PerpusBilling.WindowsClient;

public sealed class WindowsStartupManager
{
    private const string RunKeyPath = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string AppName = "PerpusBillingWindowsClient";

    public bool EnsureStartup(bool enabled, bool enableShortcutFallback = true)
    {
        if (!OperatingSystem.IsWindows()) return false;

        var registered = false;

        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(RunKeyPath, writable: true)
                         ?? Registry.CurrentUser.CreateSubKey(RunKeyPath, writable: true);
            if (key is not null)
            {
                if (!enabled)
                {
                    key.DeleteValue(AppName, throwOnMissingValue: false);
                }
                else
                {
                    var executablePath = Environment.ProcessPath;
                    if (!string.IsNullOrWhiteSpace(executablePath))
                    {
                        key.SetValue(AppName, Quote(executablePath));
                        registered = true;
                    }
                }
            }
        }
        catch
        {
            // lanjut ke fallback di bawah bila diizinkan
        }

        if (!enabled)
        {
            TryRemoveStartupShortcut();
            return registered;
        }

        if (!registered && enableShortcutFallback)
        {
            registered = TryCreateStartupShortcut();
        }

        return registered;
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

    public string? GetStartupFolderShortcutPath()
    {
        if (!OperatingSystem.IsWindows()) return null;
        var startupFolder = Environment.GetFolderPath(Environment.SpecialFolder.Startup);
        if (string.IsNullOrWhiteSpace(startupFolder)) return null;
        return Path.Combine(startupFolder, $"{AppName}.lnk");
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

    public bool TryCreateStartupShortcut()
    {
        if (!OperatingSystem.IsWindows()) return false;

        try
        {
            var executablePath = Environment.ProcessPath;
            var shortcutPath = GetStartupFolderShortcutPath();
            if (string.IsNullOrWhiteSpace(executablePath) || string.IsNullOrWhiteSpace(shortcutPath)) return false;

            var shell = new WshShell();
            var shortcut = (IWshShortcut)shell.CreateShortcut(shortcutPath);
            shortcut.TargetPath = executablePath;
            shortcut.WorkingDirectory = Path.GetDirectoryName(executablePath);
            shortcut.Description = "Perpus Billing Windows Client startup";
            shortcut.Save();
            return true;
        }
        catch
        {
            return false;
        }
    }

    public void TryRemoveStartupShortcut()
    {
        if (!OperatingSystem.IsWindows()) return;

        try
        {
            var shortcutPath = GetStartupFolderShortcutPath();
            if (!string.IsNullOrWhiteSpace(shortcutPath) && File.Exists(shortcutPath))
            {
                File.Delete(shortcutPath);
            }
        }
        catch
        {
            // best effort cleanup
        }
    }

    private static string Quote(string path)
    {
        return path.Contains(' ') ? $"\"{path}\"" : path;
    }
}
