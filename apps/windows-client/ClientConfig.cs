using System.IO;
using System.Text.Json;

namespace PerpusBilling.WindowsClient;

public sealed record ClientConfig
{
    public string ServerUrl { get; init; } = "http://localhost:3478";
    public string ComputerCode { get; init; } = "PC-01";
    public string ClientVersion { get; init; } = "windows-client-0.1.0";
    public int HeartbeatFallbackSeconds { get; init; } = 5;

    public static string ConfigPath => Path.Combine(AppContext.BaseDirectory, "appsettings.json");

    public string NormalizedServerUrl => ServerUrl.TrimEnd('/');
    public string NormalizedComputerCode => ComputerCode.Trim().ToUpperInvariant();

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
            HeartbeatFallbackSeconds = config.HeartbeatFallbackSeconds <= 0 ? 5 : config.HeartbeatFallbackSeconds
        };
    }

    public async Task SaveAsync()
    {
        var json = JsonSerializer.Serialize(this, JsonOptions());
        await File.WriteAllTextAsync(ConfigPath, json);
    }

    private static JsonSerializerOptions JsonOptions() => new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true,
        PropertyNameCaseInsensitive = true
    };
}
