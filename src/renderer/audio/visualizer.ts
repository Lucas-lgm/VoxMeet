export class AudioVisualizer {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private analyser: AnalyserNode | null = null;
    private dataArray: Uint8Array | null = null;
    private animationId: number | null = null;
    private isRecording: boolean = false;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        const context = canvas.getContext('2d');
        if (!context) {
            throw new Error('Cannot get canvas context');
        }
        this.ctx = context;
    }

    // Set audio stream
    setupVisualizer(stream: MediaStream): void {
        const audioContext = new AudioContext();
        const analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(stream);

        // Adjust analyzer parameters
        analyser.fftSize = 256;
        
        console.log('Audio analyzer settings:', {
            context: audioContext.state,
            analyser: {
                fftSize: analyser.fftSize,
                frequencyBinCount: analyser.frequencyBinCount,
                minDecibels: analyser.minDecibels,
                maxDecibels: analyser.maxDecibels
            }
        });
        
        source.connect(analyser);
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        
        this.analyser = analyser;
        this.dataArray = dataArray;
        this.isRecording = true;
        
        this.draw();
    }

    // Draw spectrum
    private draw(): void {
        if (!this.isRecording || !this.analyser || !this.dataArray) {
            if (this.animationId !== null) {
                cancelAnimationFrame(this.animationId);
                this.animationId = null;
            }
            return;
        }
        
        this.animationId = requestAnimationFrame(() => this.draw());
        this.analyser.getByteFrequencyData(this.dataArray);
        
        // Check if data is valid
        const hasData = this.dataArray.some(value => value > 0);
        if (!hasData) {
            console.log('No audio data detected');
            return;
        }
        
        // Clear canvas
        this.ctx.fillStyle = '#f8f9fa';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Calculate width of each frequency band
        const barWidth = (this.canvas.width / this.dataArray.length) * 2.5;
        let x = 0;
        
        // Draw spectrum
        for (let i = 0; i < this.dataArray.length; i++) {
            // Calculate height, use log scaling to make small values more visible
            const barHeight = (this.dataArray[i] / 255) * this.canvas.height * 0.8;
            
            // Create gradient color
            const gradient = this.ctx.createLinearGradient(0, this.canvas.height - barHeight, 0, this.canvas.height);
            gradient.addColorStop(0, '#667eea');
            gradient.addColorStop(1, '#764ba2');
            
            this.ctx.fillStyle = gradient;
            this.ctx.fillRect(x, this.canvas.height - barHeight, barWidth, barHeight);
            
            x += barWidth + 1;
            
            if (x >= this.canvas.width) break;
        }
    }

    // Stop visualization
    stop(): void {
        this.isRecording = false;
        if (this.animationId !== null) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        this.analyser = null;
        this.dataArray = null;
    }
} 