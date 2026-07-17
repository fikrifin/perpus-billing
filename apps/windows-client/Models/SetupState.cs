namespace PerpusBilling.WindowsClient.Models;

public sealed record SetupState
{
    public bool NeedsConfiguration { get; init; }
    public string[] Issues { get; init; } = [];
    public string[] Suggestions { get; init; } = [];
    public bool CanTryConnection { get; init; }
    public string Summary
    {
        get
        {
            var parts = new List<string>();
            if (Issues.Length > 0) parts.Add(string.Join(" ", Issues));
            if (Suggestions.Length > 0) parts.Add(string.Join(" ", Suggestions));
            return parts.Count == 0 ? "Konfigurasi client siap dipakai." : string.Join(" ", parts);
        }
    }
}
