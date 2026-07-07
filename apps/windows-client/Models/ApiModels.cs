using System.Text.Json.Serialization;

namespace PerpusBilling.WindowsClient.Models;

public sealed record SettingsResponse
{
    [JsonPropertyName("business_name")] public string BusinessName { get; init; } = "Perpustakaan Daerah";
    [JsonPropertyName("default_expire_action")] public string DefaultExpireAction { get; init; } = "shutdown";
    [JsonPropertyName("shutdown_warning_seconds")] public string ShutdownWarningSeconds { get; init; } = "60";
    [JsonPropertyName("heartbeat_interval_seconds")] public string HeartbeatIntervalSeconds { get; init; } = "5";
}

public sealed record ComputerResponse
{
    [JsonPropertyName("id")] public int Id { get; init; }
    [JsonPropertyName("code")] public string Code { get; init; } = "";
    [JsonPropertyName("status")] public string Status { get; init; } = "offline";
}

public sealed record SessionResponse
{
    [JsonPropertyName("id")] public int Id { get; init; }
    [JsonPropertyName("username")] public string Username { get; init; } = "";
    [JsonPropertyName("computer_code")] public string ComputerCode { get; init; } = "";
    [JsonPropertyName("start_time")] public DateTimeOffset StartTime { get; init; }
    [JsonPropertyName("end_time")] public DateTimeOffset EndTime { get; init; }
    [JsonPropertyName("duration_minutes")] public int DurationMinutes { get; init; }
    [JsonPropertyName("extended_minutes")] public int ExtendedMinutes { get; init; }
    [JsonPropertyName("status")] public string Status { get; init; } = "active";
}

public sealed record CommandResponse
{
    [JsonPropertyName("id")] public int Id { get; init; }
    [JsonPropertyName("computer_code")] public string ComputerCode { get; init; } = "";
    [JsonPropertyName("command")] public string Command { get; init; } = "";
    [JsonPropertyName("note")] public string? Note { get; init; }
}

public sealed record HeartbeatResponse
{
    [JsonPropertyName("computer")] public ComputerResponse? Computer { get; init; }
    [JsonPropertyName("activeSession")] public SessionResponse? ActiveSession { get; init; }
    [JsonPropertyName("commands")] public List<CommandResponse> Commands { get; init; } = [];
}
