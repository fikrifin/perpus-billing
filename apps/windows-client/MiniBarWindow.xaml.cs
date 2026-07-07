using System.Windows;
using System.Windows.Media;
using System.Windows.Threading;

namespace PerpusBilling.WindowsClient;

public partial class MiniBarWindow : Window
{
    private readonly DispatcherTimer _blinkTimer = new();
    private bool _blinkOn;

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
        PositionAtTopCenter();
    }

    public void ShowWarning(string computerCode, string username, string action, string remainingText)
    {
        MiniTitleText.Text = action == "restart" ? $"{computerCode} · restart" : $"{computerCode} · shutdown";
        MiniRemainingText.Text = remainingText;
        RootBorder.ToolTip = $"{username} · {computerCode}";
        if (!_blinkTimer.IsEnabled)
        {
            _blinkOn = false;
            _blinkTimer.Start();
        }
        ToggleBlink();
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
    }

    public void PositionAtTopCenter()
    {
        var area = SystemParameters.WorkArea;
        Left = area.Left + (area.Width - Width) / 2;
        Top = area.Top + 10;
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
        }
        else
        {
            RootBorder.Background = Brush("#FEE4E2");
            RootBorder.BorderBrush = Brush("#D92D20");
            StatusDot.Background = Brush("#D92D20");
            MiniTitleText.Foreground = Brush("#912018");
            MiniRemainingText.Foreground = Brush("#912018");
        }
    }

    private static SolidColorBrush Brush(string hex)
    {
        return (SolidColorBrush)new BrushConverter().ConvertFromString(hex)!;
    }
}
