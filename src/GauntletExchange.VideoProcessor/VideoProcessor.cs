using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using System.Diagnostics;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

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
                Arguments = $"-progress pipe:1 -nostats {arguments}",
                RedirectStandardError = true,
                RedirectStandardOutput = true,
                UseShellExecute = false,
                CreateNoWindow = true
            }
        };

        var progressRegex = new Regex(@"time=(\d+:\d+:\d+\.\d+)");
        var lastProgressLog = DateTime.MinValue;

        process.ErrorDataReceived += (sender, e) =>
        {
            if (!string.IsNullOrEmpty(e.Data))
            {
                _logger.LogDebug("FFmpeg: {message}", e.Data);
            }
        };

        process.OutputDataReceived += (sender, e) =>
        {
            if (!string.IsNullOrEmpty(e.Data))
            {
                var match = progressRegex.Match(e.Data);
                if (match.Success && DateTime.Now - lastProgressLog > TimeSpan.FromSeconds(5))
                {
                    _logger.LogInformation("Progress: {time}", match.Groups[1].Value);
                    lastProgressLog = DateTime.Now;
                }
            }
        };

        process.Start();
        process.BeginErrorReadLine();
        process.BeginOutputReadLine();
        
        var error = new StringBuilder();
        process.ErrorDataReceived += (sender, e) =>
        {
            if (!string.IsNullOrEmpty(e.Data))
            {
                error.AppendLine(e.Data);
            }
        };

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

    private async Task ExtractAndUploadAudioAsync(string inputPath, string videoId, string tempPath, CancellationToken cancellationToken)
    {
        _logger.LogInformation("Extracting and uploading audio from video {id}", videoId);
        var audioPath = Path.Combine(tempPath, "audio.wav");
        try
        {
            await RunFfmpegAsync($"-i \"{inputPath}\" -vn -acodec pcm_s16le -ar 16000 -ac 1 \"{audioPath}\"", cancellationToken);
            await UploadFileAsync(audioPath, $"{videoId}/audio.wav", "audio/wav", cancellationToken);
        }
        finally
        {
            await DeleteFileAsync(audioPath, $"audio file for {videoId}");
        }
    }

    private async Task ProcessAndUploadQualityAsync(string inputPath, string videoId, string outputDir, 
        (string quality, string resolution, string bitrate) qualityInfo, CancellationToken cancellationToken)
    {
        var (quality, resolution, bitrate) = qualityInfo;
        var playlistPath = Path.Combine(outputDir, $"{quality}.m3u8");

        try
        {
            _logger.LogInformation("Starting {quality} quality stream generation ({resolution}p)", quality, resolution);
            await RunFfmpegAsync(
                $"-i \"{inputPath}\" -vf scale=-2:{resolution} " +
                $"-c:v libx264 -b:v {bitrate} -c:a aac -ac 2 -ar 48000 " +
                $"-hls_time 10 -hls_list_size 0 -f hls \"{playlistPath}\"", 
                cancellationToken);
            _logger.LogInformation("Completed {quality} quality stream generation", quality);

            _logger.LogInformation("Starting upload for {quality} quality files", quality);
            await UploadQualityFilesAsync(outputDir, videoId, quality, cancellationToken);
            _logger.LogInformation("Completed upload for {quality} quality files", quality);
        }
        finally
        {
            await DeleteFileAsync(playlistPath, $"{quality} playlist for {videoId}");
            // Clean up all TS files for this quality
            foreach (var segment in Directory.GetFiles(outputDir, $"{quality}*.ts"))
            {
                await DeleteFileAsync(segment, $"segment {Path.GetFileName(segment)} for {videoId}");
            }
        }
    }

    private async Task UploadQualityFilesAsync(string outputDir, string videoId, string quality, CancellationToken cancellationToken)
    {
        var segmentCount = Directory.GetFiles(outputDir, $"{quality}*.ts").Length;
        var uploadedSegments = 0;

        // Upload playlist
        _logger.LogInformation("Uploading {quality} quality playlist", quality);
        await UploadFileAsync(
            Path.Combine(outputDir, $"{quality}.m3u8"),
            $"{videoId}/{quality}.m3u8",
            "application/vnd.apple.mpegurl",
            cancellationToken);

        // Upload segments
        _logger.LogInformation("Uploading {quality} quality segments (0/{count} segments)", quality, segmentCount);
        foreach (var segment in Directory.GetFiles(outputDir, $"{quality}*.ts"))
        {
            var segmentName = Path.GetFileName(segment);
            await UploadFileAsync(
                segment,
                $"{videoId}/{segmentName}",
                "video/mp2t",
                cancellationToken);
            
            uploadedSegments++;
            if (uploadedSegments % 5 == 0 || uploadedSegments == segmentCount)
            {
                _logger.LogInformation("Uploading {quality} quality segments ({current}/{count} segments)", 
                    quality, uploadedSegments, segmentCount);
            }
        }
    }

    private async Task GenerateAndUploadThumbnailAsync(string inputPath, string videoId, string outputDir, CancellationToken cancellationToken)
    {
        _logger.LogInformation("Generating thumbnail");
        var thumbnailPath = Path.Combine(outputDir, "thumbnail.jpg");
        try
        {
            await RunFfmpegAsync($"-ss 00:00:05 -i \"{inputPath}\" -frames:v 1 -q:v 2 \"{thumbnailPath}\"", cancellationToken);
            await UploadFileAsync(thumbnailPath, $"{videoId}/thumbnail.jpg", "image/jpeg", cancellationToken);
        }
        finally
        {
            await DeleteFileAsync(thumbnailPath, $"thumbnail for {videoId}");
        }
    }

    private async Task CreateAndUploadMasterPlaylistAsync(string videoId, string outputDir, CancellationToken cancellationToken)
    {
        _logger.LogInformation("Creating and uploading master playlist");
        var masterPlaylist = new StringBuilder();
        masterPlaylist.AppendLine("#EXTM3U");
        masterPlaylist.AppendLine("#EXT-X-VERSION:3");
        masterPlaylist.AppendLine("#EXT-X-STREAM-INF:BANDWIDTH=6000000,RESOLUTION=1920x1080");
        masterPlaylist.AppendLine($"high.m3u8");
        masterPlaylist.AppendLine("#EXT-X-STREAM-INF:BANDWIDTH=4000000,RESOLUTION=1280x720");
        masterPlaylist.AppendLine($"medium.m3u8");
        masterPlaylist.AppendLine("#EXT-X-STREAM-INF:BANDWIDTH=2000000,RESOLUTION=854x480");
        masterPlaylist.AppendLine($"low.m3u8");

        var masterPlaylistPath = Path.Combine(outputDir, "master.m3u8");
        try
        {
            await File.WriteAllTextAsync(masterPlaylistPath, masterPlaylist.ToString(), cancellationToken);
            await UploadFileAsync(
                masterPlaylistPath,
                $"{videoId}/master.m3u8",
                "application/vnd.apple.mpegurl",
                cancellationToken);
        }
        finally
        {
            await DeleteFileAsync(masterPlaylistPath, $"master playlist for {videoId}");
        }
    }

    private async Task UpdateAllVideosListAsync(string videoId)
    {
        _logger.LogInformation("Updating allvideos.json with new video {id}", videoId);
        try
        {
            var allVideosBlob = _blobContainer.GetBlobClient("allvideos.json");
            List<string> videos;

            try
            {
                using var stream = new MemoryStream();
                await allVideosBlob.DownloadToAsync(stream);
                stream.Position = 0;
                using var reader = new StreamReader(stream);
                var json = await reader.ReadToEndAsync();
                videos = JsonSerializer.Deserialize<List<string>>(json) ?? new List<string>();
            }
            catch (Azure.RequestFailedException)
            {
                videos = new List<string>();
            }

            if (!videos.Contains(videoId))
            {
                videos.Add(videoId);
                var updatedJson = JsonSerializer.Serialize(videos);
                using var ms = new MemoryStream(Encoding.UTF8.GetBytes(updatedJson));
                await allVideosBlob.UploadAsync(ms, new BlobUploadOptions
                {
                    HttpHeaders = new BlobHttpHeaders
                    {
                        ContentType = "application/json",
                        CacheControl = "no-cache"
                    }
                });
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to update allvideos.json for {id}", videoId);
        }
    }

    private async Task DeleteFileAsync(string path, string description)
    {
        if (File.Exists(path))
        {
            try
            {
                File.Delete(path);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to clean up {description}", description);
            }
        }
    }

    private async Task DeleteDirectoryAsync(string path, string description)
    {
        if (Directory.Exists(path))
        {
            try
            {
                Directory.Delete(path, true);
                _logger.LogInformation("Cleaned up {description}", description);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to clean up {description}", description);
            }
        }
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

            // Process each component
            await ExtractAndUploadAudioAsync(inputPath, videoId, tempPath, cancellationToken);

            var qualities = new[]
            {
                ("high", "1080", "6000k"),
                ("medium", "720", "4000k"),
                ("low", "480", "2000k")
            };

            foreach (var quality in qualities)
            {
                await ProcessAndUploadQualityAsync(inputPath, videoId, outputDir, quality, cancellationToken);
            }

            await GenerateAndUploadThumbnailAsync(inputPath, videoId, outputDir, cancellationToken);
            await CreateAndUploadMasterPlaylistAsync(videoId, outputDir, cancellationToken);
            await UpdateAllVideosListAsync(videoId);

            _logger.LogInformation("Successfully processed video {id}", videoId);
        }
        finally
        {
            await DeleteDirectoryAsync(tempPath, $"temp directory for {videoId}");
        }
    }
}
