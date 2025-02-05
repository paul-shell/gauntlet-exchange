using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using Azure.Core;

namespace GauntletExchange.Upload.Services;

public class BlobStorageService : IBlobStorageService
{
    private readonly BlobServiceClient _blobServiceClient;
    private const string ContainerName = "videos";
    private const string OriginalFileName = "original.mp4";

    public BlobStorageService(IConfiguration configuration)
    {
        var connectionString = configuration["BlobStorage:ConnectionString"] 
            ?? throw new ArgumentNullException("BlobStorage:ConnectionString not configured");
        
        _blobServiceClient = new BlobServiceClient(connectionString);
    }

    public async Task<(string BlobUrl, string BlobPath)> UploadVideoAsync(Stream content, IProgress<long> progress)
    {
        var containerClient = _blobServiceClient.GetBlobContainerClient(ContainerName);
        await containerClient.CreateIfNotExistsAsync(publicAccessType: PublicAccessType.Blob);

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
        return (blobClient.Uri.ToString(), blobPath);
    }
} 