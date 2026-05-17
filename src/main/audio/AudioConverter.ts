import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { app } from 'electron';
import { join } from 'path';
import { promises as fs } from 'fs';
import { createLogger } from '../utils/logger';

const logger = createLogger('audio-converter');

export class AudioConverter {
  private static instance: AudioConverter;
  private initialized = false;
  private ffmpegPath: string | null = null;

  private constructor() {
    logger.debug('Creating AudioConverter instance');
  }

  public static getInstance(): AudioConverter {
    if (!AudioConverter.instance) {
      AudioConverter.instance = new AudioConverter();
    }
    return AudioConverter.instance;
  }

  private getPlatformSpecificPath(): string {
    const platform = process.platform;
    const arch = process.arch;

    // Use ffmpeg-installer path in dev environment
    if (!app.isPackaged) {
      return ffmpegInstaller.path;
    }

    // In packaged env, select correct binary for platform/arch
    const resourcesPath = process.resourcesPath;
    let binaryName: string;

    if (platform === 'darwin') {
      binaryName = arch === 'arm64' ? 'ffmpeg-darwin-arm64' : 'ffmpeg-darwin-x64';
    } else if (platform === 'win32') {
      binaryName = 'ffmpeg-win32-x64.exe';
    } else {
      throw new Error(`Unsupported platform: ${platform}`);
    }

    return join(resourcesPath, binaryName);
  }

  private async ensureFFmpegBinary(): Promise<string> {
    if (this.ffmpegPath) {
      return this.ffmpegPath;
    }

    const binaryPath = this.getPlatformSpecificPath();
    logger.debug('FFmpeg binary path:', binaryPath);

    try {
      await fs.access(binaryPath);
      this.ffmpegPath = binaryPath;
      logger.debug('FFmpeg binary available:', binaryPath);
      return this.ffmpegPath;
    } catch (error) {
      logger.error('Cannot access FFmpeg binary:', { path: binaryPath, error });
      throw new Error(`FFmpeg binary not found: ${binaryPath}`);
    }
  }

  public async initialize(): Promise<void> {
    if (this.initialized) {
      logger.debug('AudioConverter already initialized');
      return;
    }

    try {
      const ffmpegPath = await this.ensureFFmpegBinary();
      logger.info('Initializing FFmpeg, path:', ffmpegPath);
      ffmpeg.setFfmpegPath(ffmpegPath);
      this.initialized = true;
      logger.info('AudioConverter initialized');
    } catch (error) {
      logger.error('AudioConverter initialization failed:', error);
      throw error;
    }
  }

  private async safeUnlink(filePath: string): Promise<void> {
    try {
      await fs.access(filePath);
      await fs.unlink(filePath);
      logger.debug('Deleted temp file:', filePath);
    } catch (error) {
      // If file does not exist, ignore error
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.error('Failed to delete file:', { filePath, error });
      } else {
        logger.debug('File does not exist, no need to delete:', filePath);
      }
    }
  }

  public async checkCodec(codec: string): Promise<boolean> {
    if (!this.initialized) {
      logger.error('AudioConverter not initialized');
      throw new Error('AudioConverter not initialized');
    }

    logger.debug('Checking codec:', codec);
    return new Promise((resolve) => {
      ffmpeg.ffprobe(this.ffmpegPath!, (err) => {
        if (err) {
          logger.error('Codec check failed:', { codec, error: err });
          resolve(false);
          return;
        }
        logger.debug('Codec available:', codec);
        resolve(true);
      });
    });
  }

  public async convertPcmToMp3(pcmData: Buffer, sampleRate: number, channels: number): Promise<Buffer> {
    if (!this.initialized) {
      logger.error('AudioConverter not initialized');
      throw new Error('AudioConverter not initialized');
    }

    if (!pcmData || pcmData.length === 0) {
      logger.error('PCM data is empty');
      throw new Error('PCM data is empty');
    }

    logger.info('Converting PCM to MP3', { sampleRate, channels, dataSize: pcmData.length });

    const tempDir = app.getPath('temp');
    const inputPath = join(tempDir, 'input.pcm');
    const outputPath = join(tempDir, 'output.mp3');

    // Ensure temp directory exists
    await fs.mkdir(tempDir, { recursive: true });

    // Clean up any old files
    await Promise.all([
      this.safeUnlink(inputPath),
      this.safeUnlink(outputPath)
    ]);

    try {
      // Write input file
      await fs.writeFile(inputPath, pcmData);
      logger.debug('Writing temp PCM file:', inputPath);
      
      // Verify input file exists and is valid
      const inputStats = await fs.stat(inputPath);
      if (inputStats.size === 0) {
        throw new Error('Failed to write PCM file or file is empty');
      }

      // Wait briefly for filesystem sync
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify file exists again
      try {
        await fs.access(inputPath, fs.constants.F_OK);
      } catch (error) {
        throw new Error('PCM file inaccessible after write');
      }

      await new Promise<void>((resolve, reject) => {
        const command = ffmpeg()
          .input(inputPath)
          .inputOptions([
            `-f s16le`,
            `-ar ${sampleRate}`,
            `-ac ${channels}`
          ])
          .outputOptions([
            '-c:a libmp3lame',
            '-q:a 2',
            '-sample_fmt s16'
          ])
          .output(outputPath);

        command
          .on('start', (commandLine) => {
            logger.debug('FFmpeg command:', commandLine);
          })
          .on('progress', (progress) => {
            logger.debug('Conversion progress:', progress);
          })
          .on('end', async () => {
            try {
              // Wait briefly for filesystem sync
              await new Promise(resolve => setTimeout(resolve, 100));

              // Verify output file exists and is valid
              const outputStats = await fs.stat(outputPath);
              if (outputStats.size === 0) {
                reject(new Error('MP3 generation failed or empty'));
                return;
              }
              logger.debug('PCM to MP3 done');
              resolve();
            } catch (error) {
              reject(new Error('MP3 file generation failed'));
            }
          })
          .on('error', (err) => {
            logger.error('PCM to MP3 failed:', err);
            reject(err);
          })
          .run();
      });

      // Wait briefly for filesystem sync
      await new Promise(resolve => setTimeout(resolve, 100));

      // Read output file
      const outputData = await fs.readFile(outputPath);
      if (outputData.length === 0) {
        throw new Error('Failed to read MP3 file or file is empty');
      }

      logger.info('PCM to MP3 succeeded', { outputSize: outputData.length });
      return outputData;
    } catch (error) {
      logger.error('PCM to MP3 error:', error);
      throw error;
    } finally {
      logger.debug('Cleaning temp files');
      try {
        // Wait briefly for file operation to complete
        await new Promise(resolve => setTimeout(resolve, 100));
        await Promise.all([
          this.safeUnlink(inputPath),
          this.safeUnlink(outputPath)
        ]);
      } catch (error) {
        logger.error('Failed to clean temp files:', error);
      }
    }
  }

  public async convertPcmToWebM(pcmData: Buffer, sampleRate: number, channels: number): Promise<Buffer> {
    if (!this.initialized) {
      logger.error('AudioConverter not initialized');
      throw new Error('AudioConverter not initialized');
    }

    logger.info('Converting PCM to WebM', { sampleRate, channels, dataSize: pcmData.length });

    const tempDir = app.getPath('temp');
    const inputPath = join(tempDir, 'input.pcm');
    const outputPath = join(tempDir, 'output.webm');

    try {
      await fs.writeFile(inputPath, pcmData);
      logger.debug('Writing temp PCM file:', inputPath);
      
      await new Promise<void>((resolve, reject) => {
        const command = ffmpeg()
          .input(inputPath)
          .inputOptions([
            `-f s16le`,
            `-ar ${sampleRate}`,
            `-ac ${channels}`
          ])
          .outputOptions([
            '-c:a libopus',
            '-b:a 128k'
          ])
          .output(outputPath);

        command
          .on('start', (commandLine) => {
            logger.debug('FFmpeg command:', commandLine);
          })
          .on('progress', (progress) => {
            logger.debug('Conversion progress:', progress);
          })
          .on('end', () => {
            logger.debug('PCM to WebM done');
            resolve();
          })
          .on('error', (err) => {
            logger.error('PCM to WebM failed:', err);
            reject(err);
          })
          .run();
      });

      const outputData = await fs.readFile(outputPath);
      logger.info('PCM to WebM succeeded', { outputSize: outputData.length });
      return outputData;
    } catch (error) {
      logger.error('PCM to WebM error:', error);
      throw error;
    } finally {
      logger.debug('Cleaning temp files');
      await Promise.all([
        this.safeUnlink(inputPath),
        this.safeUnlink(outputPath)
      ]);
    }
  }

  public async convertWavToMp3(wavPath: string): Promise<Buffer> {
    if (!this.initialized) {
      throw new Error('AudioConverter not initialized');
    }

    const tempDir = app.getPath('temp');
    const outputPath = join(tempDir, `output-${Date.now()}.mp3`);

    try {
      await new Promise<void>((resolve, reject) => {
        ffmpeg()
          .input(wavPath)
          .outputOptions(['-c:a libmp3lame', '-q:a 2'])
          .output(outputPath)
          .on('end', () => resolve())
          .on('error', (err) => reject(err))
          .run();
      });

      const outputData = await fs.readFile(outputPath);
      return outputData;
    } catch (error) {
      logger.error('WAV to MP3 failed:', error);
      throw error;
    } finally {
      try { await fs.unlink(outputPath); } catch {}
    }
  }

  public async getSupportedFormats(): Promise<string[]> {
    if (!this.initialized) {
      logger.error('AudioConverter not initialized');
      throw new Error('AudioConverter not initialized');
    }

    logger.debug('Checking supported formats');
    const formats = ['mp3', 'webm'];
    const supportedFormats: string[] = [];

    for (const format of formats) {
      const codec = format === 'mp3' ? 'libmp3lame' : 'libopus';
      const isSupported = await this.checkCodec(codec);
      if (isSupported) {
        supportedFormats.push(format);
        logger.debug('Format supported:', format);
      } else {
        logger.debug('Format not supported:', format);
      }
    }

    logger.info('Supported formats check complete', { supportedFormats });
    return supportedFormats;
  }
} 