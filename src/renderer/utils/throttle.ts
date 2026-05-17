/**
 * Throttle function
 * @param fn Function to execute
 * @param delay Delay time (ms)
 */
export function throttle<T extends (...args: any[]) => any>(fn: T, delay: number): (...args: Parameters<T>) => void {
    let lastTime = 0;
    let timeoutId: NodeJS.Timeout | null = null;

    return function(this: any, ...args: Parameters<T>) {
        const now = Date.now();
        const remaining = delay - (now - lastTime);

        if (remaining <= 0) {
            if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }
            lastTime = now;
            fn.apply(this, args);
        } else if (!timeoutId) {
            timeoutId = setTimeout(() => {
                lastTime = Date.now();
                timeoutId = null;
                fn.apply(this, args);
            }, remaining);
        }
    };
}

/**
 * Debounce function
 * @param fn Function to execute
 * @param delay Delay time (ms)
 */
export function debounce<T extends (...args: any[]) => any>(fn: T, delay: number): (...args: Parameters<T>) => void {
    let timeoutId: NodeJS.Timeout | null = null;

    return function(this: any, ...args: Parameters<T>) {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }

        timeoutId = setTimeout(() => {
            fn.apply(this, args);
            timeoutId = null;
        }, delay);
    };
} 