using Microsoft.Extensions.Logging;
using Microsoft.Maui.Handlers;

namespace GauntletExchange.Clients;

public static class MauiProgram
{
    public static MauiApp CreateMauiApp()
    {
        var builder = MauiApp.CreateBuilder();
        builder
            .UseMauiApp<App>()
            .ConfigureFonts(fonts =>
            {
                fonts.AddFont("OpenSans-Regular.ttf", "OpenSansRegular");
            });

        builder.Services.AddMauiBlazorWebView();

#if DEBUG
        builder.Services.AddBlazorWebViewDeveloperTools();
        builder.Logging.AddDebug();
#endif

        Microsoft.Maui.Handlers.WebViewHandler.Mapper.AppendToMapping("WebViewCustomization", (handler, view) =>
        {
#if WINDOWS
            handler.PlatformView?.EnsureCoreWebView2Async();
#endif
        });

        return builder.Build();
    }
}