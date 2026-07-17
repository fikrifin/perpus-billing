using System.IO;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace PerpusBilling.WindowsClient;

public sealed record ClientConfig
{
    public string ServerUrl { get; init; } = "http://localhost:3478";
    public string ComputerCode { get; init; } = "PC-01";
    public string ClientVersion { get; init; } = "windows-client-0.1.0";
    public int HeartbeatFallbackSeconds { get; init; } = 5;
    public bool AutoStartOnLogin { get; init; } = true;
    public bool EnableTaskManagerGuard { get; init; } = true;
    public string[] BlockedProcessNames { get; init; } = ["Taskmgr"];
    public bool KeepShellHiddenDuringSession { get; init; } = false;
    public bool EnableStartupShortcutFallback { get; init; } = true;
    public bool EnableExplorerRecoveryOnAdminExit { get; init; } = true;
    public string AdminExitCode { get; init; } = "perpus-admin";

    public static string ConfigPath => Path.Combine(AppContext.BaseDirectory, "appsettings.json");

    public string NormalizedServerUrl => ServerUrl.TrimEnd('/');
    public string NormalizedComputerCode => ComputerCode.Trim().ToUpperInvariant();

    public ClientConfig WithConnection(string serverUrl, string computerCode)
    {
        var normalizedServerUrl = string.IsNullOrWhiteSpace(serverUrl) ? "http://localhost:3478" : serverUrl.Trim().TrimEnd('/');
        var normalizedComputerCode = string.IsNullOrWhiteSpace(computerCode) ? "PC-01" : computerCode.Trim().ToUpperInvariant();

        return this with
        {
            ServerUrl = normalizedServerUrl,
            ComputerCode = normalizedComputerCode
        };
    }

    public static bool LooksLikePlaceholderComputerCode(string? computerCode)
    {
        if (string.IsNullOrWhiteSpace(computerCode)) return true;
        var normalized = computerCode.Trim().ToUpperInvariant();
        return normalized == "PC-01" || Regex.IsMatch(normalized, @"^PC-0*1$");
    }

    public static async Task<ClientConfig> LoadAsync()
    {
        if (!File.Exists(ConfigPath))
        {
            var fresh = new ClientConfig();
            await fresh.SaveAsync();
            return fresh;
        }

        await using var stream = File.OpenRead(ConfigPath);
        var config = await JsonSerializer.DeserializeAsync<ClientConfig>(stream, JsonOptions()) ?? new ClientConfig();
        return config with
        {
            ServerUrl = string.IsNullOrWhiteSpace(config.ServerUrl) ? "http://localhost:3478" : config.ServerUrl.TrimEnd('/'),
            ComputerCode = string.IsNullOrWhiteSpace(config.ComputerCode) ? "PC-01" : config.ComputerCode.Trim().ToUpperInvariant(),
            ClientVersion = string.IsNullOrWhiteSpace(config.ClientVersion) ? "windows-client-0.1.0" : config.ClientVersion,
            HeartbeatFallbackSeconds = config.HeartbeatFallbackSeconds <= 0 ? 5 : config.HeartbeatFallbackSeconds,
            AutoStartOnLogin = config.AutoStartOnLogin,
            EnableTaskManagerGuard = config.EnableTaskManagerGuard,
            BlockedProcessNames = NormalizeBlockedProcesses(config.BlockedProcessNames),
            KeepShellHiddenDuringSession = config.KeepShellHiddenDuringSession,
            EnableStartupShortcutFallback = config.EnableStartupShortcutFallback,
            EnableExplorerRecoveryOnAdminExit = config.EnableExplorerRecoveryOnAdminExit,
            AdminExitCode = string.IsNullOrWhiteSpace(config.AdminExitCode) ? "perpus-admin" : config.AdminExitCode
        };
    }

    public async Task SaveAsync()
    {
        var json = JsonSerializer.Serialize(this, JsonOptions());
        await File.WriteAllTextAsync(ConfigPath, json);
    }

    private static string[] NormalizeBlockedProcesses(string[]? processNames)
    {
        var normalized = (processNames ?? [])
            .Select(name => name?.Trim())
            .Where(name => !string.IsNullOrWhiteSpace(name))
            .Select(name => name!.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) ? name[..^4] : name)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        return normalized.Length == 0 ? ["Taskmgr"] : normalized;
    }

    private static JsonSerializerOptions JsonOptions() => new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true,
        PropertyNameCaseInsensitive = true
    };
}
