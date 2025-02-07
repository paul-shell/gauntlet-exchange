// Singleton pattern to ensure we only have one instance
let scrollObserver = null;
let dotNetHelper = null;
let isLoading = false;
let isAnyVideoPlaying = false;
let _videoObservers = new Map();

function setupPlayerEvents(player) {
    player.ready(() => {
        // Only check visibility on ready, don't auto-play
        console.log('Player ready:', player.id());
    });

    player.on('play', () => {
        isAnyVideoPlaying = true;
        // Pause all other players
        Object.values(window._videoJsPlayers).forEach(p => {
            if (p && p !== player && !p.paused()) {
                p.pause();
            }
        });
    });
    
    player.on('pause', () => {
        // Small delay to let other players update first
        setTimeout(() => {
            isAnyVideoPlaying = Object.values(window._videoJsPlayers).some(p => 
                p && !p.paused()
            );
        }, 50);
    });
}

function cleanupFarVideos(currentPlayerId) {
    const currentPlayer = window._videoJsPlayers[currentPlayerId];
    if (!currentPlayer) return;

    const currentContainer = currentPlayer.el().closest('.video-container');
    if (!currentContainer) return;

    const currentRect = currentContainer.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const keepAliveDistance = viewportHeight * 2; // Keep 2 screens worth

    Object.entries(window._videoJsPlayers).forEach(([id, player]) => {
        if (id === currentPlayerId) return;

        const container = player.el()?.closest('.video-container');
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const distance = Math.abs(rect.top - currentRect.top);

        if (distance > keepAliveDistance) {
            console.log(`Cleaning up player ${id}`);
            try {
                const wasPlaying = !player.paused();
                player.pause();
                player.reset(); // Reset instead of dispose
                if (wasPlaying) {
                    isAnyVideoPlaying = true; // Maintain play state
                }
            } catch (e) {
                console.error('Error cleaning up player:', e);
            }
        }
    });
}

export function initObserver(element, dotNetRef) {
    dotNetHelper = dotNetRef;

    if (scrollObserver) {
        scrollObserver.disconnect();
    }

    scrollObserver = new IntersectionObserver(
        async (entries) => {
            if (entries[0].isIntersecting && !isLoading) {
                isLoading = true;
                try {
                    await dotNetRef.invokeMethodAsync('OnScroll');
                } finally {
                    // Ensure isLoading is reset even if there's an error
                    isLoading = false;
                }
            }
        },
        {
            rootMargin: '2000px 0px',
            threshold: 0
        }
    );

    // Re-observe the sentinel whenever we initialize
    const sentinel = element.querySelector('.scroll-sentinel');
    if (sentinel) {
        scrollObserver.observe(sentinel);
    }

    return () => scrollObserver.disconnect();
}

export function onUpdate() {
    // Re-observe the sentinel after updates
    if (scrollObserver && dotNetHelper) {
        const element = document.querySelector('.stream-feed');
        const sentinel = element?.querySelector('.scroll-sentinel');
        if (sentinel) {
            scrollObserver.observe(sentinel);
        }
    }
}

export function onDispose() {
    if (scrollObserver) {
        scrollObserver.disconnect();
        scrollObserver = null;
    }
    if (dotNetHelper) {
        dotNetHelper = null;
    }
    isLoading = false;
}

export function observeVideoVisibility(element, dotNetRef) {
    const observer = new IntersectionObserver(
        entries => {
            const [entry] = entries;
            const videoElement = element.querySelector('video-js');
            const playerId = videoElement?.id;
            if (!playerId) return;
            
            if (entry.isIntersecting) {
                let player = window._videoJsPlayers[playerId];
                
                if (!player && videoElement) {
                    window.initializePlayer(playerId, {
                        preload: "metadata",
                        loadingSpinner: false,
                        controls: true,
                        controlBar: {
                            fullscreenToggle: false,
                            pictureInPictureToggle: false
                        }
                    });
                    player = window._videoJsPlayers[playerId];
                }

                if (player && isAnyVideoPlaying) {
                    setTimeout(() => {
                        player.play().catch(() => {});
                    }, 100); // Small delay to let player initialize
                }
            } else {
                const player = window._videoJsPlayers[playerId];
                if (player) {
                    player.pause();
                }
            }
        },
        { threshold: 0.5 }
    );

    observer.observe(element);
    _videoObservers.set(element, observer);
    
    return () => {
        observer.disconnect();
        _videoObservers.delete(element);
    };
}

window.toggleVideo = function(playerId) {
    const player = window._videoJsPlayers[playerId];
    if (player) {
        if (player.paused()) {
            player.play().catch(() => {});
        } else {
            player.pause();
        }
    }
};

window.initializePlayer = function(elementId, options) {
    if (typeof videojs === "undefined") {
        setTimeout(() => window.initializePlayer(elementId, options), 50);
        return;
    }

    const element = document.getElementById(elementId);
    if (!element) {
        console.log('Video element not found:', elementId);
        return;
    }

    // If player exists, just reset it
    if (window._videoJsPlayers?.[elementId]) {
        try {
            window._videoJsPlayers[elementId].reset();
            return;
        } catch (e) {
            console.error('Error resetting player:', e);
        }
    }

    try {
        const player = videojs(element, options);
        player.hlsQualitySelector({ displayCurrentQuality: true });
        
        window._videoJsPlayers = window._videoJsPlayers || {};
        window._videoJsPlayers[elementId] = player;
        
        setupPlayerEvents(player);
    } catch (e) {
        console.error('Error initializing player:', e);
    }
};

window.hasPlayer = function(playerId) {
    return !!window._videoJsPlayers[playerId];
}; 