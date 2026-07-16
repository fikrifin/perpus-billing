using System.IO;
using System.Text;

namespace PerpusBilling.WindowsClient;

public sealed class WindowsClientLogger
{
    private readonly object _sync = new();

    public string LogDirectory { get; }

    public WindowsClientLogger()
    {
        LogDirectory = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "PerpusBilling",
            "WindowsClient",
            "logs");
    }

    public void Info(string message, params (string Key, object? Value)[] fields)
    {
        Write("INFO", message, null, fields);
    }

    public void Warn(string message, params (string Key, object? Value)[] fields)
    {
        Write("WARN", message, null, fields);
    }

    public void Error(string message, Exception exception, params (string Key, object? Value)[] fields)
    {
        Write("ERROR", message, exception, fields);
    }

    private void Write(string level, string message, Exception? exception, params (string Key, object? Value)[] fields)
    {
        try
        {
            Directory.CreateDirectory(LogDirectory);
            var path = Path.Combine(LogDirectory, $"client-{DateTime.Now:yyyyMMdd}.log");
            var builder = new StringBuilder();
            builder.Append('[').Append(DateTimeOffset.Now.ToString("O")).Append("] ");
            builder.Append(level).Append(' ').Append(message);

            foreach (var (key, value) in fields)
            {
                builder.Append(' ').Append(key).Append('=').Append(FormatValue(value));
            }

            if (exception is not null)
            {
                builder.AppendLine();
                builder.Append(exception);
            }

            builder.AppendLine();

            lock (_sync)
            {
                File.AppendAllText(path, builder.ToString(), Encoding.UTF8);
            }
        }
        catch
        {
            // Logging tidak boleh bikin client ikut crash.
        }
    }

    private static string FormatValue(object? value)
    {
        if (value is null) return "null";
        var text = value.ToString() ?? "";
        return text.Any(char.IsWhiteSpace) ? $"\"{text.Replace("\"", "'")}\"" : text;
    }
}
