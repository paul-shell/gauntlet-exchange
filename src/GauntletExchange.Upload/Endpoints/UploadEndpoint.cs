using GauntletExchange.Upload.Services;
using Microsoft.AspNetCore.Http.HttpResults;

namespace GauntletExchange.Upload.Endpoints;

public static class UploadEndpoint
{
    private const long MaxFileSize = 100 * 1024 * 1024; // 100MB

    public static IEndpointRouteBuilder MapUploadEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/videos", async Task<Results<Ok<UploadResult>, BadRequest<string>>> (HttpRequest request, IBlobStorageService blobStorage) =>
        {
            if (!request.HasFormContentType || request.Form.Files.Count == 0)
            {
                return TypedResults.BadRequest("No file uploaded");
            }

            var file = request.Form.Files[0];
            if (file.Length > MaxFileSize)
            {
                return TypedResults.BadRequest("File too large");
            }

            if (!file.FileName.EndsWith(".mp4", StringComparison.OrdinalIgnoreCase))
            {
                return TypedResults.BadRequest("Only MP4 files are supported");
            }

            var progress = new Progress<long>(_ => { }); // No progress reporting for API
            using var stream = file.OpenReadStream();
            var result = await blobStorage.UploadVideoAsync(stream, progress);

            return TypedResults.Ok(new UploadResult 
            { 
                Url = result.BlobUrl,
                Id = result.BlobPath.Split('/')[0] // First part of path is the GUID
            });
        })
        .DisableAntiforgery()
        .WithName("UploadVideo");

        return app;
    }
}

public class UploadResult
{
    public required string Url { get; set; }
    public required string Id { get; set; }
} 