import { ipcMain } from 'electron';
import { AudioConverter } from '../audio/AudioConverter';
import { TaskQueue } from '../utils/TaskQueue';
import { createLogger } from '../utils/logger';

const logger = createLogger('audio-converter-ipc');

// Register IPC handlers
export function setupAudioConverterIPC() {
  const converter = AudioConverter.getInstance();
  const taskQueue = TaskQueue.getInstance('audio-converter-ipc');
  
  converter.initialize();

  ipcMain.handle('audio-converter:convert-pcm-to-mp3', async (_, pcmData: Buffer, sampleRate: number, channels: number) => {
    return taskQueue.enqueue(async () => {
      try {
        logger.debug('Processing PCM to MP3 request');
        const result = await converter.convertPcmToMp3(pcmData, sampleRate, channels);
        logger.debug('PCM to MP3 request processed');
        return result;
      } catch (error) {
        logger.error('PCM to MP3 failed:', error);
        throw error;
      }
    });
  });

  ipcMain.handle('audio-converter:convert-pcm-to-webm', async (_, pcmData: Buffer, sampleRate: number, channels: number) => {
    return taskQueue.enqueue(async () => {
      try {
        logger.debug('Processing PCM to WebM request');
        const result = await converter.convertPcmToWebM(pcmData, sampleRate, channels);
        logger.debug('PCM to WebM request processed');
        return result;
      } catch (error) {
        logger.error('PCM to WebM failed:', error);
        throw error;
      }
    });
  });

  ipcMain.handle('audio-converter:convert-wav-to-mp3', async (_, wavPath: string) => {
    return taskQueue.enqueue(async () => {
      try {
        logger.debug('Processing WAV to MP3 request')
        const result = await converter.convertWavToMp3(wavPath)
        logger.debug('WAV to MP3 request processed')
        return result
      } catch (error) {
        logger.error('WAV to MP3 failed:', error)
        throw error
      }
    })
  })

  ipcMain.handle('audio-converter:get-supported-formats', async () => {
    return taskQueue.enqueue(async () => {
      try {
        logger.debug('Getting supported formats');
        const formats = await converter.getSupportedFormats();
        logger.debug('Supported formats check done', { formats });
        return formats;
      } catch (error) {
        logger.error('Failed to get supported formats:', error);
        throw error;
      }
    });
  });

  return () => {}
} 