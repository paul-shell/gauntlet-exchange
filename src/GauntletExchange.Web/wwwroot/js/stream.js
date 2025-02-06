// Singleton pattern to ensure we only have one instance
let observer = null;
let dotNetHelper = null;

export function onLoad(element, dotNetRef) {
    dotNetHelper = dotNetRef;

    // Disconnect any existing observer
    if (observer) {
        onDispose();
    }

    // Create new IntersectionObserver
    observer = new IntersectionObserver(
        (entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    dotNetHelper.invokeMethodAsync('OnIntersection');
                }
            });
        },
        {
            root: null,
            rootMargin: '0px',
            threshold: 0.1
        }
    );

    observer.observe(element);
}

export function onUpdate() {
    // Handle any updates if needed
}

export function onDispose() {
    if (observer) {
        observer.disconnect();
        observer = null;
    }
    if (dotNetHelper) {
        dotNetHelper = null;
    }
} 