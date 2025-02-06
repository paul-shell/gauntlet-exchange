using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using Azure.Core;
using Azure.Storage.Queues;
using System.Text.Json;

namespace GauntletExchange.Upload.Services;

public class BlobStorageService : IBlobStorageService
{
    private readonly BlobServiceClient _blobServiceClient;
    private readonly QueueClient _queueClient;
    private const string ContainerName = "videos";
    private const string QueueName = "videoprocessing";
    private const string OriginalFileName = "original.mp4";

    public BlobStorageService(IConfiguration configuration)
    {
        var connectionString = configuration["BlobStorage:ConnectionString"] 
            ?? throw new ArgumentNullException("BlobStorage:ConnectionString not configured");
        
        _blobServiceClient = new BlobServiceClient(connectionString);
        _queueClient = new QueueClient(connectionString, QueueName);
    }

    public async Task<(string BlobUrl, string BlobPath)> UploadVideoAsync(Stream content, IProgress<long> progress)
    {
        var containerClient = _blobServiceClient.GetBlobContainerClient(ContainerName);
        await containerClient.CreateIfNotExistsAsync(publicAccessType: PublicAccessType.Blob);
        await _queueClient.CreateIfNotExistsAsync();

        // Create a sequential, time-based GUID using .NET 9's new feature
        var folderName = Guid.CreateVersion7().ToString();
        var blobPath = $"{folderName}/{OriginalFileName}";
        var blobClient = containerClient.GetBlobClient(blobPath);

        var options = new BlobUploadOptions
        {
            HttpHeaders = new BlobHttpHeaders
            {
                ContentType = "video/mp4",
                CacheControl = "public, max-age=31536000"
            },
            ProgressHandler = new Progress<long>(progress.Report),
            TransferOptions = new Azure.Storage.StorageTransferOptions
            {
                MaximumConcurrency = 8,
                InitialTransferSize = 1024 * 1024, // 1MB
                MaximumTransferSize = 4 * 1024 * 1024 // 4MB
            }
        };

        await blobClient.UploadAsync(content, options);

        // Queue the video ID for processing
        var message = new { VideoId = folderName };
        await _queueClient.SendMessageAsync(JsonSerializer.Serialize(message));

        // Return CDN URL instead of direct blob storage URL
        var cdnUrl = $"https://cdn.gauntletai.io/videos/{folderName}/{OriginalFileName}";
        return (cdnUrl, blobPath);
    }
} 