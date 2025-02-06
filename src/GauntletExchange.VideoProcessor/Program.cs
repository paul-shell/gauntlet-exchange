using GauntletExchange.VideoProcessor;
using Azure.Storage.Queues;
using Azure.Storage.Blobs;

IHost host = Host.CreateDefaultBuilder(args)
    .ConfigureServices((context, services) =>
    {
        var connectionString = context.Configuration["BlobStorage:ConnectionString"];
        services.AddHostedService<QueueWorker>();
        services.AddSingleton(new QueueClient(connectionString, "videoprocessing"));
        services.AddSingleton(x => new BlobContainerClient(connectionString, "videos"));
        services.AddSingleton<IVideoProcessor, VideoProcessor>();
    })
    .Build();

host.Run();
