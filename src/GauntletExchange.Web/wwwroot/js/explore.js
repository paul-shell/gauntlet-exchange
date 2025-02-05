let videoObserver;
let intersectionObserver;
let currentPlayingId = null;
let dotNetHelper = null;
let isTransitioning = false;
let feedContainer = null;
let hasUserInteraction = false;

// Enable autoplay on first user interaction.
document.addEventListener('click', () => {
    if (!hasUserInteraction) {
        hasUserInteraction = true;
        playVisibleVideo();
    }
}, { once: true });

function pauseAllVideos(exceptId = null) {
    document.querySelectorAll('.video-content video').forEach(video => {
        const container = video.closest('.video-content');
        const videoId = container?.id.replace('player-', '');
        if (videoId && videoId !== exceptId) {
            video.pause();
            video.currentTime = 0;
            video.muted = true;
            container?.classList.add('placeholder');
            container?.classList.remove('paused');
            container?.removeAttribute("data-userpaused");
        }
    });
}

function attachSourceIfNeeded(video) {
    if (!video.querySelector('source')) {
        let src = video.getAttribute("data-src");
        if (src) {
            const source = document.createElement('source');
            source.src = src;
            source.type = video.getAttribute("data-type") || "video/mp4";
            video.appendChild(source);
            video.removeAttribute("data-src");
        }
    }
}

async function playVideo(video, container, videoId) {
    try {
        container.classList.add('placeholder');
        container.classList.remove('playing');
        container.classList.add('paused');

        attachSourceIfNeeded(video);
        video.load();

        await new Promise((resolve, reject) => {
            const onCanPlay = () => {
                video.removeEventListener('error', onError);
                resolve();
            };
            const onError = (e) => {
                video.removeEventListener('canplay', onCanPlay);
                reject(e);
            };
            video.addEventListener('canplay', onCanPlay, { once: true });
            video.addEventListener('error', onError, { once: true });
        });

        container.classList.remove('placeholder');
        video.currentTime = 0;
        video.muted = true;
        video.playsInline = true;

        let attempts = 0;
        while (attempts < 3) {
            try {
                await video.play();
                container.classList.add('playing');
                container.classList.remove('paused');
                break;
            } catch (e) {
                attempts++;
                if (attempts === 3) throw e;
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        setTimeout(() => {
            if (currentPlayingId === videoId && !container.hasAttribute("data-userpaused")) {
                video.muted = false;
            }
        }, 100);
        currentPlayingId = videoId;
        if (dotNetHelper) {
            dotNetHelper.invokeMethodAsync('UpdateCurrentPlayingId', videoId);
        }
        return true;
    } catch (error) {
        console.error(`Error playing video ${videoId}:`, error);
        container.classList.remove('placeholder');
        container.classList.remove('playing');
        container.classList.add('paused');
        return false;
    }
}

async function resumeVideo(video, container, videoId) {
    try {
        await video.play();
        setTimeout(() => {
            if (currentPlayingId === videoId && !container.hasAttribute("data-userpaused")) {
                video.muted = false;
            }
        }, 100);
        currentPlayingId = videoId;
        if (dotNetHelper) {
            dotNetHelper.invokeMethodAsync('UpdateCurrentPlayingId', videoId);
        }
        return true;
    } catch (error) {
        console.error(`Error resuming video ${videoId}:`, error);
        return false;
    }
}

export function onLoad(dotNetRef) {
    dotNetHelper = dotNetRef;
    isTransitioning = false;
    currentPlayingId = null;
    pauseAllVideos();
    feedContainer = document.querySelector('.tiktok-feed');
    if (feedContainer) {
        feedContainer.addEventListener('scroll', handleScroll);
        if (hasUserInteraction) {
            playVisibleVideo();
        }
    }
}

export function onUpdate() {
    // Handle updates if needed.
}

export function onDispose() {
    if (feedContainer) {
        feedContainer.removeEventListener('scroll', handleScroll);
    }
    pauseAllVideos();
    currentPlayingId = null;
    dotNetHelper = null;
    isTransitioning = false;
    feedContainer = null;
}

function handleScroll() {
    if (isTransitioning) return;
    playVisibleVideo();
}

export function playVisibleVideo() {
    if (!feedContainer) return;
    
    const containers = document.querySelectorAll('.video-content');
    const containerHeight = window.innerHeight;
    const scrollTop = feedContainer.scrollTop;
    
    if (scrollTop === 0 && containers.length > 0) {
        const firstContainer = containers[0];
        const video = firstContainer.querySelector('video');
        const videoId = firstContainer.id.replace('player-', '');
        if (video && videoId && currentPlayingId !== videoId) {
            isTransitioning = true;
            pauseAllVideos(videoId);
            playVideo(video, firstContainer, videoId).then(() => {
                isTransitioning = false;
            });
            return;
        }
    }
    
    containers.forEach(container => {
        const rect = container.getBoundingClientRect();
        const videoId = container.id.replace('player-', '');
        const video = container.querySelector('video');
        if (!video) return;
        
        if (Math.abs(rect.top) < containerHeight / 2 && !container.hasAttribute("data-userpaused")) {
            if (currentPlayingId !== videoId) {
                isTransitioning = true;
                pauseAllVideos(videoId);
                playVideo(video, container, videoId).then(() => {
                    isTransitioning = false;
                });
            }
        }
    });
}

export function togglePlayPause(videoId) {
    if (isTransitioning) return;
    
    const container = document.getElementById(`player-${videoId}`);
    if (!container) return;
    const video = container.querySelector('video');
    if (!video) return;
    
    if (video.paused) {
        if (container.getAttribute("data-userpaused") === "true" && video.currentTime > 0) {
            container.removeAttribute("data-userpaused");
            container.classList.remove("paused");
            container.classList.add("playing");
            resumeVideo(video, container, videoId);
        } else {
            pauseAllVideos(videoId);
            playVideo(video, container, videoId);
        }
    } else {
        video.pause();
        container.classList.remove("playing");
        container.classList.add("paused");
        container.setAttribute("data-userpaused", "true");
    }
}

export function refreshVideoElements() {
    pauseAllVideos();
    document.querySelectorAll('.video-content').forEach(container => {
        container.classList.remove('paused');
        container.classList.add('placeholder');
    });
    playVisibleVideo();
} 