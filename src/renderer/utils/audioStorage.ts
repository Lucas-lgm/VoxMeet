/// <reference path="../types/global.d.ts" />
import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { createLogger } from '../logger';

interface AudioChunk {
  recordingId: number;
  data: Int16Array;
  timestamp: number;
}

interface AudioChunkWithId extends AudioChunk {
  id: number;
}

interface AudioDB extends DBSchema {
  'audio-chunks': {
    key: number;
    value: AudioChunkWithId;
    indexes: {
      'by-recording': number;
    };
  };
  'recordings': {
    key: number;
    value: {
      id: number;
      name: string;
      duration: number;
      timestamp: number;
      sampleRate: number;
      channels: number;
      mode: string;
      totalChunks: number;
    };
  };
}

type Operation = () => Promise<any>;

const logger = createLogger('audioStorage');

export class AudioStorage {
  private db: IDBPDatabase<AudioDB> | null = null;
  private DB_NAME = 'example-audio-recorder-db';
  private readonly VERSION = 1;
  private chunkCounter: number = 0;
  private recordingCounter: number = 0;
  private operationQueue: Operation[] = [];
  private pendingSaveChunks: AudioChunk[] = [];
  private isProcessing: boolean = false;

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.operationQueue.length === 0) {
      return;
    }

    this.isProcessing = true;
    try {
      while (this.operationQueue.length > 0) {
        const operation = this.operationQueue.shift();
        if (operation) {
          await operation();
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async enqueueOperation<T>(operation: Operation): Promise<T> {
    return new Promise((resolve, reject) => {
      this.operationQueue.push(async () => {
        try {
          const result = await operation();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      this.processQueue();
    });
  }

  async initialize(): Promise<void> {
    return this.enqueueOperation(async () => {
      try {
        logger.info('Initializing audio storage');
        const isDevMode = await window.electronAPI.isDevelopment();
        if (isDevMode) {
          this.DB_NAME = `${this.DB_NAME}-dev`;
        }
        this.db = await openDB<AudioDB>(this.DB_NAME, this.VERSION, {
          upgrade(db) {
            // Create recording chunk store
            const audioChunksStore = db.createObjectStore('audio-chunks', {
              keyPath: 'id',
              autoIncrement: true
            });
            audioChunksStore.createIndex('by-recording', 'recordingId');

            // Create recording metadata store
            db.createObjectStore('recordings', {
              keyPath: 'id',
              autoIncrement: true
            });
          }
        });

        // Initialize counter
        const recordings = await this.db.getAll('recordings');
        const chunks = await this.db.getAll('audio-chunks');
        this.recordingCounter = recordings.length > 0 ? Math.max(...recordings.map(r => r.id)) : 0;
        this.chunkCounter = chunks.length > 0 ? Math.max(...chunks.map(c => c.id)) : 0;

        logger.info(`Audio storage initialized: Recordings: ${this.recordingCounter}, Audio chunks: ${this.chunkCounter}`);
      } catch (error) {
        logger.error(`Audio storage init failed: ${error}`);
        throw error;
      }
    });
  }

  private mergeChunks(chunks: AudioChunk[]): Int16Array {
    const mergedChunks = new Int16Array(chunks.reduce((acc, chunk) => acc + chunk.data.length, 0));
    let offset = 0;
    for (const chunk of chunks) {
      mergedChunks.set(chunk.data, offset);
      offset += chunk.data.length;
    } 
    return mergedChunks;
  }

  pushChunks(chunk: AudioChunk): void {
    this.pendingSaveChunks.push(chunk);
    if (this.pendingSaveChunks.length > 100) {
      // merge chunks
      const mergedChunks = this.mergeChunks(this.pendingSaveChunks);
      this.pendingSaveChunks = [];
      this.saveAudioChunk(chunk.recordingId, mergedChunks, chunk.timestamp).catch((error) => {
        logger.error(`Failed to save audio chunk`, error);
      });
    }
  }

  flushChunks(): void {
    logger.info(`Flushing audio chunks: ${this.pendingSaveChunks.length}`);
    if (this.pendingSaveChunks.length > 0) {
      const mergedChunks = this.mergeChunks(this.pendingSaveChunks);
      this.saveAudioChunk(this.pendingSaveChunks[0].recordingId, mergedChunks, this.pendingSaveChunks[0].timestamp).catch((error) => {
        logger.error(`Failed to save audio chunk`, error);
      }).finally(() => {
        this.pendingSaveChunks = [];
      });
    }
  }

  async saveRecordingMetadata(name: string, duration: number, mode: string, sampleRate: number, channels: number): Promise<number> {
    return this.enqueueOperation(async () => {
      if (!this.db) throw new Error('Database not initialized');

      this.recordingCounter++;
      const id = this.recordingCounter;

      await this.db.add('recordings', {
        id,
        name,
        duration,
        timestamp: Date.now(),
        sampleRate,
        channels,
        mode,
        totalChunks: 0
      });

      return id;
    });
  }

  async saveAudioChunk(recordingId: number, data: Int16Array, duration: number): Promise<void> {
    return this.enqueueOperation(async () => {
      if (!this.db) throw new Error('Database not initialized');

      this.chunkCounter++;
      const id = this.chunkCounter;

      await this.db.add('audio-chunks', {
        id,
        recordingId,
        data,
        timestamp: duration
      });

      // Update total chunks for recording
      const recording = await this.db.get('recordings', recordingId);
      if (recording) {
        recording.totalChunks = Math.max(recording.totalChunks, id);
        recording.duration = Math.max(recording.duration, duration);
        await this.db.put('recordings', recording);
      }
    });
  }

  async getAudioChunks(recordingId: number): Promise<Int16Array[]> {
    return this.enqueueOperation(async () => {
      if (!this.db) throw new Error('Database not initialized');

      const chunks = await this.db.getAllFromIndex('audio-chunks', 'by-recording', recordingId);
      return chunks.sort((a, b) => a.id - b.id).map(chunk => chunk.data);
    });
  }

  async getRecordingMetadata(recordingId: number): Promise<AudioDB['recordings']['value'] | undefined> {
    return this.enqueueOperation(async () => {
      if (!this.db) throw new Error('Database not initialized');
      return await this.db.get('recordings', recordingId);
    });
  }

  async getAllRecordings(): Promise<AudioDB['recordings']['value'][]> {
    return this.enqueueOperation(async () => {
      if (!this.db) throw new Error('Database not initialized');
      return await this.db.getAll('recordings');
    });
  }

  async deleteRecording(recordingId: number): Promise<void> {
    return this.enqueueOperation(async () => {
      if (!this.db) throw new Error('Database not initialized');
      logger.info(`Deleting recording: ${recordingId}`);
      const tx = this.db.transaction(['audio-chunks', 'recordings'], 'readwrite');
      const audioChunksStore = tx.objectStore('audio-chunks');
      const recordingsStore = tx.objectStore('recordings');

      // Delete all related audio chunks
      const chunks = await audioChunksStore.index('by-recording').getAll(recordingId);
      await Promise.all(chunks.map(chunk => audioChunksStore.delete(chunk.id!)));

      // Delete recording metadata
      await recordingsStore.delete(recordingId);

      await tx.done;
      logger.info(`Recording deleted: ${recordingId}`);
    });
  }

  async clearAll(): Promise<void> {
    return this.enqueueOperation(async () => {
      if (!this.db) throw new Error('Database not initialized');
      logger.info('Clearing all recordings');
      await this.db.clear('audio-chunks');
      await this.db.clear('recordings');
      logger.info('All recordings cleared');
    });
  }
} 