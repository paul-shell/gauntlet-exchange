// Singleton pattern to ensure we only have one instance
let scrollObserver = null;
let dotNetHelper = null;
let isLoading = false;
let isAnyVideoPlaying = false;
let pendingPlays = new Set();
let _videoObservers = new Map();

function setupPlayerEvents(player) {
    player.ready(() => {
        // Check if this video should start playing when it's ready
        const container = player.el().closest('.video-container');
        if (container) {
            const rect = container.getBoundingClientRect();
            const isVisible = rect.top < window.innerHeight && rect.bottom > 0;
            if (isVisible && isAnyVideoPlaying) {
                player.play().catch(() => {});
            }
        }
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
        isAnyVideoPlaying = Object.values(window._videoJsPlayers).some(p => 
            p && !p.paused()
        );
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
            const playerId = element.querySelector('video-js').id;
            
            if (entry.isIntersecting) {
                if (isAnyVideoPlaying) {
                    const player = window._videoJsPlayers[playerId];
                    if (player) {
                        player.play().catch(() => {});
                    }
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

window.playVideoIfActive = function(playerId) {
    const player = window._videoJsPlayers[playerId];
    if (!player) {
        // Player not ready yet, mark it for playing when ready
        pendingPlays.add(playerId);
        return;
    }
    
    if (player && isAnyVideoPlaying) {
        player.play().catch(() => {});
    }
};

window.pauseVideo = function(playerId) {
    const player = window._videoJsPlayers[playerId];
    if (player) {
        pendingPlays.delete(playerId);
        player.pause();
    }
};

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

    // Clean up existing player if any
    if (window._videoJsPlayers?.[elementId]) {
        window._videoJsPlayers[elementId].dispose();
    }

    const player = videojs(elementId, options);
    player.hlsQualitySelector({ displayCurrentQuality: true });
    
    window._videoJsPlayers = window._videoJsPlayers || {};
    window._videoJsPlayers[elementId] = player;
    
    setupPlayerEvents(player);
}; 