using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json;
using PerpusBilling.WindowsClient.Models;

namespace PerpusBilling.WindowsClient;

public sealed class PerpusApiClient
{
    private readonly HttpClient _http;
    private readonly ClientConfig _config;
    private readonly JsonSerializerOptions _jsonOptions = new(JsonSerializerDefaults.Web);

    public PerpusApiClient(ClientConfig config)
    {
        _config = config;
        _http = new HttpClient
        {
            BaseAddress = new Uri(config.NormalizedServerUrl),
            Timeout = TimeSpan.FromSeconds(8)
        };
    }

    public async Task<SettingsResponse> GetSettingsAsync(CancellationToken cancellationToken = default)
    {
        return await GetAsync<SettingsResponse>("/api/settings", cancellationToken) ?? new SettingsResponse();
    }

    public async Task<HeartbeatResponse> HeartbeatAsync(CancellationToken cancellationToken = default)
    {
        var body = new { clientVersion = _config.ClientVersion };
        return await PostAsync<HeartbeatResponse>($"/api/computers/{Uri.EscapeDataString(_config.NormalizedComputerCode)}/heartbeat", body, cancellationToken)
               ?? new HeartbeatResponse();
    }

    public async Task<SessionResponse> StartSessionAsync(string username, string password, CancellationToken cancellationToken = default)
    {
        var body = new
        {
            username,
            password,
            computer_code = _config.NormalizedComputerCode
        };
        return await PostAsync<SessionResponse>("/api/sessions/start", body, cancellationToken)
               ?? throw new InvalidOperationException("Server tidak mengembalikan data session.");
    }

    public async Task StopSessionAsync(int sessionId, string note, CancellationToken cancellationToken = default)
    {
        var body = new { note };
        await PostAsync<JsonElement>($"/api/sessions/{sessionId}/stop", body, cancellationToken);
    }

    public async Task AckCommandAsync(int commandId, bool success, string note, CancellationToken cancellationToken = default)
    {
        var body = new { status = success ? "acknowledged" : "failed", note };
        await PostAsync<JsonElement>($"/api/client-commands/{commandId}/ack", body, cancellationToken);
    }

    private async Task<T?> GetAsync<T>(string path, CancellationToken cancellationToken)
    {
        using var response = await _http.GetAsync(path, cancellationToken);
        return await ReadResponseAsync<T>(response, cancellationToken);
    }

    private async Task<T?> PostAsync<T>(string path, object body, CancellationToken cancellationToken)
    {
        using var response = await _http.PostAsJsonAsync(path, body, _jsonOptions, cancellationToken);
        return await ReadResponseAsync<T>(response, cancellationToken);
    }

    private static async Task<T?> ReadResponseAsync<T>(HttpResponseMessage response, CancellationToken cancellationToken)
    {
        var raw = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            var message = ExtractError(raw) ?? $"Request gagal: {(int)response.StatusCode}";
            throw new InvalidOperationException(message);
        }

        if (string.IsNullOrWhiteSpace(raw)) return default;
        return JsonSerializer.Deserialize<T>(raw, new JsonSerializerOptions(JsonSerializerDefaults.Web));
    }

    private static string? ExtractError(string raw)
    {
        try
        {
            using var doc = JsonDocument.Parse(raw);
            if (doc.RootElement.TryGetProperty("error", out var error)) return error.GetString();
        }
        catch
        {
            // ignore invalid JSON response
        }
        return null;
    }
}
