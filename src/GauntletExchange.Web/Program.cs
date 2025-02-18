using GauntletExchange.Web.Components;

using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.Google;
using Microsoft.AspNetCore.HttpOverrides;

var builder = WebApplication.CreateBuilder(args);

// Add Razor Components (Blazor SSR) services.
builder.Services.AddRazorComponents()
    .AddInteractiveServerComponents();

// Configure Forwarded Headers Middleware so the app sees the original HTTPS scheme behind proxies.
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    // Clear default known networks/proxies to trust forwarded headers.
    options.KnownNetworks.Clear();
    options.KnownProxies.Clear();
});

builder.Services.AddCascadingAuthenticationState();

// Configure authentication with cookies and Google.
builder.Services.AddAuthentication(options =>
{
    options.DefaultScheme = CookieAuthenticationDefaults.AuthenticationScheme;
    options.DefaultSignInScheme = CookieAuthenticationDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = GoogleDefaults.AuthenticationScheme;
})
.AddCookie(options =>
{
    options.LoginPath = "/authentication/login";
    options.LogoutPath = "/authentication/logout";
    options.ExpireTimeSpan = TimeSpan.FromDays(30);
    options.SlidingExpiration = true;
})
.AddGoogle(options =>
{
    var clientId = builder.Configuration["Google:ClientId"]
                   ?? throw new InvalidOperationException("Google ClientId configuration is missing");
    var clientSecret = builder.Configuration["Google:ClientSecret"]
                       ?? throw new InvalidOperationException("Google ClientSecret configuration is missing");
    options.ClientId = clientId;
    options.ClientSecret = clientSecret;
    options.CallbackPath = "/signin-google";
    options.SaveTokens = true;
    // Remove custom redirect URI override – let the middleware use the current request's host and port.
});

builder.Services.AddAuthorization();
builder.Services.AddHttpClient();

var app = builder.Build();

// Use forwarded headers early so that HTTPS is correctly preserved.
app.UseForwardedHeaders();

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error", createScopeForErrors: true);
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseAuthentication();
app.UseAuthorization();
app.UseAntiforgery();
app.MapStaticAssets();

// Authentication endpoints
app.MapGet("/authentication/login", async (HttpContext context) =>
{
    await context.ChallengeAsync(GoogleDefaults.AuthenticationScheme, new AuthenticationProperties
    {
        RedirectUri = "/",
        IsPersistent = true,
        AllowRefresh = true
    });
});

app.MapGet("/authentication/logout", async (HttpContext context) =>
{
    await context.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
    context.Response.Redirect("/");
});

// Map Blazor components (the main app) last.
app.MapRazorComponents<GauntletExchange.Web.Components.App>()
    .AddInteractiveServerRenderMode();

app.Run();
