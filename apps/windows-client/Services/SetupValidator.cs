using System.Net;
using PerpusBilling.WindowsClient.Models;

namespace PerpusBilling.WindowsClient;

public static class SetupValidator
{
    public static SetupState Evaluate(ClientConfig config)
    {
        var issues = new List<string>();
        var suggestions = new List<string>();
        var canTryConnection = false;

        if (string.IsNullOrWhiteSpace(config.ServerUrl) || !Uri.TryCreate(config.NormalizedServerUrl, UriKind.Absolute, out var serverUri))
        {
            issues.Add("Server URL belum valid.");
        }
        else
        {
            if (serverUri.Scheme is not ("http" or "https"))
            {
                issues.Add("Server URL harus memakai http:// atau https://.");
            }
            else
            {
                canTryConnection = true;
            }

            if (string.Equals(serverUri.Host, "localhost", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(serverUri.Host, "127.0.0.1") ||
                string.Equals(serverUri.Host, "::1"))
            {
                issues.Add("Server URL masih localhost. Ganti ke IP server/operator supaya client LAN bisa terhubung.");
            }
            else if (IPAddress.TryParse(serverUri.Host, out _))
            {
                suggestions.Add("Pastikan IP server ini bisa diakses dari jaringan client/UTM.");
            }
            else
            {
                suggestions.Add("Kalau pakai hostname/domain, pastikan DNS di client bisa resolve dengan benar.");
            }

            if (serverUri.IsDefaultPort)
            {
                suggestions.Add("Kalau backend pakai port custom, pastikan port juga ikut ditulis di Server URL.");
            }
        }

        if (string.IsNullOrWhiteSpace(config.ComputerCode) || config.NormalizedComputerCode.Length < 2)
        {
            issues.Add("Kode komputer belum valid.");
        }
        else if (ClientConfig.LooksLikePlaceholderComputerCode(config.ComputerCode))
        {
            suggestions.Add("Kode komputer masih terlihat seperti placeholder default. Cocokkan dengan data komputer di dashboard admin.");
        }

        return new SetupState
        {
            NeedsConfiguration = issues.Count > 0,
            Issues = issues.ToArray(),
            Suggestions = suggestions.Distinct().ToArray(),
            CanTryConnection = canTryConnection
        };
    }
}
