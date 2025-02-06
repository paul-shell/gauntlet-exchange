# Build stage
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /source
COPY ["GauntletExchange.VideoProcessor.csproj", "./"]
RUN dotnet restore
COPY . .
RUN dotnet publish -c Release -o /app/publish

# Final stage
FROM ubuntu:22.04

# Avoid prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install FFmpeg and .NET prerequisites
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    ffmpeg \
    wget \
    apt-transport-https \
    software-properties-common \
    ca-certificates && \
    # Verify FFmpeg installation
    ffmpeg -version && \
    # Install Microsoft package repository
    wget https://packages.microsoft.com/config/ubuntu/22.04/packages-microsoft-prod.deb -O /tmp/packages-microsoft-prod.deb && \
    dpkg -i /tmp/packages-microsoft-prod.deb && \
    rm /tmp/packages-microsoft-prod.deb && \
    # Install .NET Runtime
    apt-get update && \
    apt-get install -y --no-install-recommends aspnetcore-runtime-9.0 && \
    # Verify .NET installation
    dotnet --info && \
    # Cleanup
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy the published app from build stage
COPY --from=build /app/publish .

# Set the entry point to run the app
ENTRYPOINT ["dotnet", "GauntletExchange.VideoProcessor.dll"]
