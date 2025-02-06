using Microsoft.Extensions.Hosting;
using Azure.Storage.Queues;
using System.Text.Json;

namespace GauntletExchange.VideoProcessor;

public class QueueWorker : BackgroundService
{
    private readonly ILogger<QueueWorker> _logger;
    private readonly QueueClient _queueClient;
    private readonly IVideoProcessor _videoProcessor;
    private const int ThrottleDelayMs = 1000;

    public QueueWorker(ILogger<QueueWorker> logger, QueueClient queueClient, IVideoProcessor videoProcessor)
    {
        _logger = logger;
        _queueClient = queueClient;
        _videoProcessor = videoProcessor;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var messages = await _queueClient.ReceiveMessagesAsync(
                    maxMessages: 1,
                    visibilityTimeout: TimeSpan.FromMinutes(30),
                    cancellationToken: stoppingToken);
                
                foreach (var message in messages.Value)
                {
                    _logger.LogInformation("Processing message: {text}", message.MessageText);
                    try 
                    {
                        var videoMessage = JsonSerializer.Deserialize<VideoMessage>(message.MessageText);
                        if (videoMessage?.VideoId == null)
                        {
                            _logger.LogError("Invalid message format: {text}", message.MessageText);
                            await _queueClient.DeleteMessageAsync(message.MessageId, message.PopReceipt);
                            continue;
                        }

                        await _videoProcessor.ProcessVideoAsync(videoMessage.VideoId, stoppingToken);
                        await _queueClient.DeleteMessageAsync(message.MessageId, message.PopReceipt);
                        _logger.LogInformation("Successfully processed video {id}", videoMessage.VideoId);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Failed to process video from message: {text}", message.MessageText);
                        // Don't delete the message - it will become visible again after the visibility timeout
                        throw;
                    }
                }

                if (messages.Value.Length == 0)
                {
                    await Task.Delay(ThrottleDelayMs, stoppingToken);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error processing messages");
                await Task.Delay(ThrottleDelayMs, stoppingToken);
            }
        }
    }
}

public class VideoMessage
{
    public string? VideoId { get; set; }
}