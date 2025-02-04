let videoObserver;
let intersectionObserver;
let currentPlayingId = null;
let dotNetHelper = null;
let isTransitioning = false;
let feedContainer = null;
let hasUserInteraction = false;

// Add document-wide click handler to enable autoplay
document.addEventListener('click', () => {
    if (!hasUserInteraction) {
        hasUserInteraction = true;
        playVisibleVideo();
    }
}, { once: true });

/**
 * Pause and reset all videos except the one with the given id.
 */
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

/**
 * In a lazy‑loading approach, attach a <source> element if not already attached.
 */
function attachSourceIfNeeded(video) {
    if (!video.querySelector('source')) {
        let src = video.getAttribute("data-src");
        if (src) {
            const source = document.createElement('source');
            source.src = src;
            // Allow a custom type via a data-type attribute (defaults to video/mp4)
            source.type = video.getAttribute("data-type") || "video/mp4";
            video.appendChild(source);
            // Remove the data-src so we know the source is attached.
            video.removeAttribute("data-src");
        }
    }
}

/**
 * Play the video in the container from the beginning. If the video isn't sufficiently loaded,
 * attach the source (if needed), call load(), and wait for the canplay event.
 */
async function playVideo(video, container, videoId) {
    try {
        container.classList.add('placeholder'); // show placeholder until ready
        container.classList.remove('playing'); // ensure playing class is removed while loading
        container.classList.add('paused'); // show pause overlay while loading

        // Attach the <source> element only when needed.
        attachSourceIfNeeded(video);
        
        // Always load and wait for canplay
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
        // Reset the video to start from the beginning.
        video.currentTime = 0;
        video.muted = true; // start muted to enable autoplay
        video.playsInline = true;
        
        // Try to play with a few retries
        let attempts = 0;
        while (attempts < 3) {
            try {
                await video.play();
                // Only add playing class after successful play
                container.classList.add('playing');
                container.classList.remove('paused');
                break;
            } catch (e) {
                attempts++;
                if (attempts === 3) throw e;
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        // Unmute after a short delay if this video is still active and not user‑paused.
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

/**
 * Resume a video from its current playback position (without resetting currentTime).
 */
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

/**
 * Called when the user clicks a video container.
 * If the video is currently paused and was manually paused (with progress), resume it;
 * otherwise, start playback from the beginning.
 */
window.togglePlayPause = async (videoId) => {
    if (isTransitioning) return;
    
    const container = document.getElementById(`player-${videoId}`);
    if (!container) return;
    const video = container.querySelector('video');
    if (!video) return;
    
    if (video.paused) {
        // If the video was manually paused and already has some progress, resume without resetting.
        if (container.getAttribute("data-userpaused") === "true" && video.currentTime > 0) {
            container.removeAttribute("data-userpaused");
            container.classList.remove("paused");
            container.classList.add("playing");
            await resumeVideo(video, container, videoId);
        } else {
            // Otherwise, start the video from the beginning.
            pauseAllVideos(videoId);
            await playVideo(video, container, videoId);
        }
    } else {
        // User is pausing the video.
        video.pause();
        container.classList.remove("playing");
        container.classList.add("paused");
        container.setAttribute("data-userpaused", "true");
    }
};

/**
 * Initialize video handling: create an IntersectionObserver for video containers,
 * reset state, and start observing.
 */
window.initializeVideoHandling = () => {
    isTransitioning = false;
    currentPlayingId = null;
    pauseAllVideos();
    feedContainer = document.querySelector('.tiktok-feed');
    if (feedContainer) {
        feedContainer.addEventListener('scroll', handleScroll);
        // Only try to autoplay if we already have user interaction
        if (hasUserInteraction) {
            playVisibleVideo();
        }
    }
};

function handleScroll() {
    if (isTransitioning) return;
    playVisibleVideo();
}

window.playVisibleVideo = function() {
    if (!feedContainer) return;
    
    // Get all video containers
    const containers = document.querySelectorAll('.video-content');
    const containerHeight = window.innerHeight;
    const scrollTop = feedContainer.scrollTop;
    
    // If we're at the top, force play the first video
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
    
    // Find which video should be playing based on scroll position
    containers.forEach(container => {
        const rect = container.getBoundingClientRect();
        const videoId = container.id.replace('player-', '');
        const video = container.querySelector('video');
        
        if (!video) return;
        
        // If this container is mostly in view and not manually paused
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

window.refreshVideoElements = () => {
    pauseAllVideos();
    document.querySelectorAll('.video-content').forEach(container => {
        container.classList.remove('paused');
        container.classList.add('placeholder');
    });
    playVisibleVideo();
};

window.disconnectObserver = () => {
    if (intersectionObserver) intersectionObserver.disconnect();
    if (feedContainer) {
        feedContainer.removeEventListener('scroll', handleScroll);
    }
    pauseAllVideos();
    currentPlayingId = null;
    dotNetHelper = null;
    isTransitioning = false;
    feedContainer = null;
};

/**
 * Observe an element for infinite scrolling. When the element (e.g. the feed container)
 * is at least 50% visible, notify .NET to load more videos.
 */
window.observeIntersection = (element, helper) => {
    dotNetHelper = helper;
    if (intersectionObserver) {
        intersectionObserver.disconnect();
    }
    intersectionObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                dotNetHelper.invokeMethodAsync('OnIntersection');
            }
        });
    }, { threshold: 0.5 });
    intersectionObserver.observe(element);
};
