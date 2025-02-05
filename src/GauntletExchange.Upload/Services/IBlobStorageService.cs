namespace GauntletExchange.Upload.Services;

public interface IBlobStorageService
{
    Task<(string BlobUrl, string BlobPath)> UploadVideoAsync(Stream content, IProgress<long> progress);
} 