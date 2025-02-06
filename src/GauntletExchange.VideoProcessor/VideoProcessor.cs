using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using System.Diagnostics;
using System.Text;

namespace GauntletExchange.VideoProcessor;

public interface IVideoProcessor
{
    Task ProcessVideoAsync(string videoId, CancellationToken cancellationToken);
}

public class VideoProcessor : IVideoProcessor
{
    private readonly ILogger<VideoProcessor> _logger;
    private readonly BlobContainerClient _blobContainer;

    public VideoProcessor(ILogger<VideoProcessor> logger, BlobContainerClient blobContainer)
    {
        _logger = logger;
        _blobContainer = blobContainer;
    }

    private async Task RunFfmpegAsync(string arguments, CancellationToken cancellationToken)
    {
        var process = new Process
        {
            StartInfo = new ProcessStartInfo
            {
                FileName = "ffmpeg",
                Arguments = arguments,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            }
        };

        process.Start();
        var error = await process.StandardError.ReadToEndAsync();
        await process.WaitForExitAsync(cancellationToken);

        if (process.ExitCode != 0)
        {
            throw new Exception($"FFmpeg failed with error: {error}");
        }
    }

    private async Task UploadFileAsync(string filePath, string blobPath, string contentType, CancellationToken cancellationToken)
    {
        var blob = _blobContainer.GetBlobClient(blobPath);
        await using var stream = File.OpenRead(filePath);
        await blob.UploadAsync(stream, new BlobUploadOptions
        {
            HttpHeaders = new BlobHttpHeaders
            {
                ContentType = contentType,
                CacheControl = "public, max-age=31536000"
            }
        }, cancellationToken);
    }

    public async Task ProcessVideoAsync(string videoId, CancellationToken cancellationToken)
    {
        var tempPath = Path.Combine(Path.GetTempPath(), videoId);
        Directory.CreateDirectory(tempPath);

        var inputPath = Path.Combine(tempPath, "original.mp4");
        var outputDir = Path.Combine(tempPath, "output");
        Directory.CreateDirectory(outputDir);

        try
        {
            _logger.LogInformation("Downloading video {id}", videoId);
            var originalBlob = _blobContainer.GetBlobClient($"{videoId}/original.mp4");
            await originalBlob.DownloadToAsync(inputPath, cancellationToken);

            _logger.LogInformation("Processing video {id}", videoId);

            // Generate HLS streams
            _logger.LogInformation("Generating high quality stream (1080p)");
            await RunFfmpegAsync($"-i \"{inputPath}\" -vf scale=-2:1080 -c:v libx264 -b:v 6000k -c:a aac -ac 2 -ar 48000 -hls_time 10 -hls_list_size 0 -f hls \"{outputDir}/high.m3u8\"", cancellationToken);

            _logger.LogInformation("Generating medium quality stream (720p)");
            await RunFfmpegAsync($"-i \"{inputPath}\" -vf scale=-2:720 -c:v libx264 -b:v 4000k -c:a aac -ac 2 -ar 48000 -hls_time 10 -hls_list_size 0 -f hls \"{outputDir}/medium.m3u8\"", cancellationToken);

            _logger.LogInformation("Generating low quality stream (480p)");
            await RunFfmpegAsync($"-i \"{inputPath}\" -vf scale=-2:480 -c:v libx264 -b:v 2000k -c:a aac -ac 2 -ar 48000 -hls_time 10 -hls_list_size 0 -f hls \"{outputDir}/low.m3u8\"", cancellationToken);

            // Generate thumbnail
            _logger.LogInformation("Generating thumbnail");
            await RunFfmpegAsync($"-ss 00:00:05 -i \"{inputPath}\" -frames:v 1 -q:v 2 \"{outputDir}/thumbnail.jpg\"", cancellationToken);

            // Create master playlist
            var masterPlaylist = new StringBuilder();
            masterPlaylist.AppendLine("#EXTM3U");
            masterPlaylist.AppendLine("#EXT-X-VERSION:3");
            masterPlaylist.AppendLine("#EXT-X-STREAM-INF:BANDWIDTH=6000000,RESOLUTION=1920x1080");
            masterPlaylist.AppendLine("high.m3u8");
            masterPlaylist.AppendLine("#EXT-X-STREAM-INF:BANDWIDTH=4000000,RESOLUTION=1280x720");
            masterPlaylist.AppendLine("medium.m3u8");
            masterPlaylist.AppendLine("#EXT-X-STREAM-INF:BANDWIDTH=2000000,RESOLUTION=854x480");
            masterPlaylist.AppendLine("low.m3u8");
            await File.WriteAllTextAsync(Path.Combine(outputDir, "master.m3u8"), masterPlaylist.ToString(), cancellationToken);

            // Upload all generated files
            _logger.LogInformation("Uploading processed files");

            // Upload thumbnail
            await UploadFileAsync(
                Path.Combine(outputDir, "thumbnail.jpg"),
                $"{videoId}/thumbnail.jpg",
                "image/jpeg",
                cancellationToken);

            // Upload master playlist
            await UploadFileAsync(
                Path.Combine(outputDir, "master.m3u8"),
                $"{videoId}/master.m3u8",
                "application/vnd.apple.mpegurl",
                cancellationToken);

            // Upload quality-specific playlists and segments
            foreach (var quality in new[] { "high", "medium", "low" })
            {
                // Upload playlist
                await UploadFileAsync(
                    Path.Combine(outputDir, $"{quality}.m3u8"),
                    $"{videoId}/{quality}.m3u8",
                    "application/vnd.apple.mpegurl",
                    cancellationToken);

                // Upload all TS segments
                foreach (var segment in Directory.GetFiles(outputDir, $"{quality}*.ts"))
                {
                    var segmentName = Path.GetFileName(segment);
                    await UploadFileAsync(
                        segment,
                        $"{videoId}/{segmentName}",
                        "video/mp2t",
                        cancellationToken);
                }
            }

            _logger.LogInformation("Successfully processed video {id}", videoId);
        }
        finally
        {
            // Clean up temp files
            if (Directory.Exists(tempPath))
            {
                try
                {
                    Directory.Delete(tempPath, true);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to clean up temp directory for {id}", videoId);
                }
            }
        }
    }
} 