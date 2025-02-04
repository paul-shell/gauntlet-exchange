let observer;
let videoObserver;
let players = {};
let currentPlayingId = null;
let retryAttempts = {};
const MAX_RETRIES = 3;

// Load YouTube IFrame API
if (!window.YT) {
    const tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api";
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
}

window.onYouTubeIframeAPIReady = function() {
    console.log('YouTube API Ready');
    initializeVideoHandling();
};

window.observeIntersection = (element, dotNetHelper) => {
    observer?.disconnect();
    observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                dotNetHelper.invokeMethodAsync('OnIntersection');
            }
        });
    }, { threshold: 0.5 });

    observer.observe(element);
};

function pauseAllPlayers(exceptId = null) {
    Object.entries(players).forEach(([id, player]) => {
        if (id !== exceptId && player?.pauseVideo) {
            try {
                player.pauseVideo();
            } catch (error) {
                console.warn(`Error pausing player ${id}:`, error);
                cleanupPlayer(id);
            }
        }
    });
}

function cleanupPlayer(videoId) {
    if (players[videoId]?.destroy) {
        try {
            players[videoId].destroy();
        } catch (error) {
            console.warn(`Error destroying player ${videoId}:`, error);
        }
    }
    delete players[videoId];
    if (currentPlayingId === videoId) {
        currentPlayingId = null;
    }
}

function createPlayer(container, videoId, iframe) {
    if (!iframe || !videoId) return null;
    
    retryAttempts[videoId] = retryAttempts[videoId] || 0;
    
    return new YT.Player(iframe, {
        events: {
            'onReady': (event) => {
                try {
                    event.target.mute();
                    if (currentPlayingId === videoId) {
                        event.target.playVideo();
                    }
                } catch (error) {
                    console.warn(`Error in onReady for ${videoId}:`, error);
                }
            },
            'onStateChange': (event) => {
                try {
                    if (event.data === YT.PlayerState.PLAYING) {
                        currentPlayingId = videoId;
                        pauseAllPlayers(videoId);
                    } else if (event.data === YT.PlayerState.ENDED) {
                        event.target.playVideo();
                    } else if (event.data === YT.PlayerState.UNSTARTED) {
                        // Handle unstarted state - might need to reinitialize
                        if (!players[videoId]?.playVideo) {
                            cleanupPlayer(videoId);
                        }
                    }
                } catch (error) {
                    console.warn(`Error in onStateChange for ${videoId}:`, error);
                    cleanupPlayer(videoId);
                }
            },
            'onError': (event) => {
                console.warn(`Player error for ${videoId}:`, event.data);
                
                // Handle specific error codes
                if (event.data === 150 || event.data === 101) {
                    // Video unavailable / Playback on other websites disabled
                    if (retryAttempts[videoId] < MAX_RETRIES) {
                        retryAttempts[videoId]++;
                        console.log(`Retrying player ${videoId}, attempt ${retryAttempts[videoId]}`);
                        
                        cleanupPlayer(videoId);
                        setTimeout(() => {
                            if (container.querySelector('iframe')) {
                                players[videoId] = createPlayer(container, videoId, container.querySelector('iframe'));
                            }
                        }, 1000 * retryAttempts[videoId]); // Exponential backoff
                    } else {
                        console.warn(`Max retries reached for ${videoId}`);
                        cleanupPlayer(videoId);
                    }
                }
            }
        }
    });
}

window.initializeVideoHandling = () => {
    videoObserver?.disconnect();
    videoObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const container = entry.target;
            const videoId = container.id.replace('player-', '');
            
            if (entry.isIntersecting) {
                if (!players[videoId]) {
                    const iframe = container.querySelector('iframe');
                    if (iframe) {
                        players[videoId] = createPlayer(container, videoId, iframe);
                    }
                } else if (players[videoId]?.playVideo) {
                    try {
                        currentPlayingId = videoId;
                        pauseAllPlayers(videoId);
                        players[videoId].playVideo();
                    } catch (error) {
                        console.warn(`Error playing video ${videoId}:`, error);
                        cleanupPlayer(videoId);
                    }
                }
            } else if (players[videoId]?.pauseVideo) {
                try {
                    players[videoId].pauseVideo();
                    if (currentPlayingId === videoId) {
                        currentPlayingId = null;
                    }
                } catch (error) {
                    console.warn(`Error pausing video ${videoId}:`, error);
                    cleanupPlayer(videoId);
                }
            }
        });
    }, { 
        threshold: 0.5,
        rootMargin: '100px 0px'
    });

    refreshVideoElements();
};

window.refreshVideoElements = () => {
    document.querySelectorAll('.video-content').forEach(container => {
        videoObserver?.observe(container);
    });
};

window.disconnectObserver = () => {
    observer?.disconnect();
    videoObserver?.disconnect();
    
    Object.entries(players).forEach(([id, player]) => {
        cleanupPlayer(id);
    });
    players = {};
    currentPlayingId = null;
    retryAttempts = {};
}; 