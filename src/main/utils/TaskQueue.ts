import { createLogger } from './logger';

const logger = createLogger('task-queue');

export class TaskQueue {
  private static instance: TaskQueue;
  private taskQueue: Promise<any> = Promise.resolve();
  private isProcessing = false;
  private queueName: string;

  private constructor(queueName: string) {
    this.queueName = queueName;
  }

  public static getInstance(queueName: string = 'default'): TaskQueue {
    if (!TaskQueue.instance) {
      TaskQueue.instance = new TaskQueue(queueName);
    }
    return TaskQueue.instance;
  }

  public async enqueue<T>(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.taskQueue = this.taskQueue.then(async () => {
        if (this.isProcessing) {
          logger.debug(`[${this.queueName}] Waiting for previous task`);
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        this.isProcessing = true;
        try {
          logger.debug(`[${this.queueName}] Starting task`);
          const result = await task();
          logger.debug(`[${this.queueName}] Task completed`);
          resolve(result);
        } catch (error) {
          logger.error(`[${this.queueName}] Task failed:`, error);
          reject(error);
        } finally {
          this.isProcessing = false;
        }
      }).catch(reject);
    });
  }

  public isQueueEmpty(): boolean {
    return !this.isProcessing;
  }

  public clearQueue(): void {
    this.taskQueue = Promise.resolve();
    this.isProcessing = false;
    logger.debug(`[${this.queueName}] Queue cleared`);
  }
} 