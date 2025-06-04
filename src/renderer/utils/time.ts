// Format time
export function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Start timer
export function startTimer(
    startTime: number,
    updateCallback: (time: string) => void
): NodeJS.Timeout {
    return setInterval((): void => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        updateCallback(formatTime(elapsed));
    }, 1000);
}

// Stop timer
export function stopTimer(timer: NodeJS.Timeout | null): void {
    if (timer) {
        clearInterval(timer);
    }
} 