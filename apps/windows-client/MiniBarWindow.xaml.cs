using System.Windows;
using System.Windows.Media;
using System.Windows.Threading;

namespace PerpusBilling.WindowsClient;

public partial class MiniBarWindow : Window
{
    private readonly DispatcherTimer _blinkTimer = new();
    private bool _blinkOn;

    public event EventHandler? ExitRequested;

    public MiniBarWindow()
    {
        InitializeComponent();
        Loaded += (_, _) => PositionAtTopCenter();
        SizeChanged += (_, _) => PositionAtTopCenter();

        _blinkTimer.Interval = TimeSpan.FromMilliseconds(450);
        _blinkTimer.Tick += (_, _) => ToggleBlink();
    }

    public void UpdateDisplay(string computerCode, string username, string remainingText)
    {
        StopWarning();
        MiniTitleText.Text = computerCode;
        MiniRemainingText.Text = remainingText;
        RootBorder.ToolTip = $"{username} · {computerCode}";
        MiniExitButton.ToolTip = $"Akhiri session {username}";
        PositionAtTopCenter();
    }

    public void ShowWarning(string computerCode, string username, string action, string remainingText)
    {
        MiniTitleText.Text = action == "restart" ? $"{computerCode} · restart" : $"{computerCode} · shutdown";
        MiniRemainingText.Text = remainingText;
        RootBorder.ToolTip = $"{username} · {computerCode}";
        MiniExitButton.ToolTip = $"Akhiri session {username}";
        if (!_blinkTimer.IsEnabled)
        {
            _blinkOn = false;
            _blinkTimer.Start();
        }
        ToggleBlink();
        PositionAtTopCenter();
    }

    public void ShowOffline(string computerCode, string username, string remainingText)
    {
        _blinkTimer.Stop();
        MiniTitleText.Text = $"{computerCode} · offline";
        MiniRemainingText.Text = remainingText;
        RootBorder.ToolTip = $"Server offline · {username} · {computerCode}";
        MiniExitButton.ToolTip = $"Akhiri session {username}";
        RootBorder.Background = Brush("#FFF7ED");
        RootBorder.BorderBrush = Brush("#FB923C");
        StatusDot.Background = Brush("#FB923C");
        MiniTitleText.Foreground = Brush("#9A3412");
        MiniRemainingText.Foreground = Brush("#9A3412");
        MiniExitButton.Background = Brush("#33FB923C");
        MiniExitButton.Foreground = Brush("#9A3412");
        MiniExitButton.BorderBrush = Brush("#66FB923C");
        PositionAtTopCenter();
    }

    public void StopWarning()
    {
        _blinkTimer.Stop();
        _blinkOn = false;
        RootBorder.Background = Brush("#E0192024");
        RootBorder.BorderBrush = Brush("#5536C98A");
        StatusDot.Background = Brush("#36C98A");
        MiniTitleText.Foreground = Brush("#D7F5E4");
        MiniRemainingText.Foreground = Brushes.White;
        MiniExitButton.Background = Brush("#22FFFFFF");
        MiniExitButton.Foreground = Brushes.White;
        MiniExitButton.BorderBrush = Brush("#33FFFFFF");
    }

    public void PositionAtTopCenter()
    {
        var area = SystemParameters.WorkArea;
        Left = area.Left + (area.Width - Width) / 2;
        Top = area.Top + 8;
    }

    private void MiniExitButton_Click(object sender, RoutedEventArgs e)
    {
        ExitRequested?.Invoke(this, EventArgs.Empty);
    }

    private void ToggleBlink()
    {
        _blinkOn = !_blinkOn;
        if (_blinkOn)
        {
            RootBorder.Background = Brush("#FFF4CC");
            RootBorder.BorderBrush = Brush("#F59E0B");
            StatusDot.Background = Brush("#F59E0B");
            MiniTitleText.Foreground = Brush("#7A4B00");
            MiniRemainingText.Foreground = Brush("#7A4B00");
            MiniExitButton.Background = Brush("#33F59E0B");
            MiniExitButton.Foreground = Brush("#7A4B00");
            MiniExitButton.BorderBrush = Brush("#66F59E0B");
        }
        else
        {
            RootBorder.Background = Brush("#FEE4E2");
            RootBorder.BorderBrush = Brush("#D92D20");
            StatusDot.Background = Brush("#D92D20");
            MiniTitleText.Foreground = Brush("#912018");
            MiniRemainingText.Foreground = Brush("#912018");
            MiniExitButton.Background = Brush("#33D92D20");
            MiniExitButton.Foreground = Brush("#912018");
            MiniExitButton.BorderBrush = Brush("#66D92D20");
        }
    }

    private static SolidColorBrush Brush(string hex)
    {
        return (SolidColorBrush)new BrushConverter().ConvertFromString(hex)!;
    }
}
