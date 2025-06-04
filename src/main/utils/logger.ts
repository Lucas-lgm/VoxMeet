import winston from 'winston';
import path from 'path';
import { app } from 'electron';
import * as fs from 'fs';
import 'winston-daily-rotate-file';

// Define log level types
export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

// Define logger interface
export interface Logger {
  error(message: string, ...meta: any[]): void;
  warn(message: string, ...meta: any[]): void;
  info(message: string, ...meta: any[]): void;
  debug(message: string, ...meta: any[]): void;
}

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 4,
};

// Select log level based on environment
const level = () => {
  const env = process.env.NODE_ENV || 'development';
  return env === 'development' ? 'debug' : 'info';
};

// Define log colors
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

// Add color
winston.addColors(colors);

// Create log format factory function
const createLogFormat = () => {

  // Console format (with color)
  const consoleFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
    winston.format.colorize({ all: true }),
    winston.format.printf(
      (info) => {
        const { timestamp, level, message, ...meta } = info;
        const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
        return `${timestamp} ${level}: ${message} ${metaStr}`;
      }
    ),
  );

  // File format (no color)
  const fileFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
    winston.format.printf(
      (info) => {
        const { timestamp, level, message, ...meta } = info;
        const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
        return `[${timestamp}] ${level}: ${message} ${metaStr}`;
      }
    ),
  );

  return { consoleFormat, fileFormat };
};

if (process.env.NODE_ENV !== 'development') {
  process.env.RECORDER_LOG_DIR = path.join(app.getPath('userData'), 'logs')
} else {
  process.env.RECORDER_LOG_DIR = path.resolve(__dirname, '../../../logs')
}

process.env.RECORDER_APP_DATA = app.getPath('userData')
console.log(process.env.RECORDER_APP_DATA)

// Ensure log directory exists
const ensureLogDir = () => {
  let logDir = ''
  if (process.env.NODE_ENV !== 'development') {
    logDir = path.join(app.getPath('userData'), 'logs')
  } else {
    logDir = path.resolve(__dirname, '../../../logs')
  }
  
  try {
    fs.mkdirSync(logDir, { recursive: true });
  } catch (error) {
    // Ignore directory already exists error
    if (error instanceof Error && 'code' in error && error.code !== 'EEXIST') {
      throw error;
    }
  }
  return logDir;
};

const lastLogTime = { value: Date.now() };

// Create namespaced logger
export const createLogger = (namespace: string): Logger => {
  const { consoleFormat, fileFormat } = createLogFormat();

  // Define log output targets
  const createTransports = () => {
    const logDir = ensureLogDir();
    return [
      // Console output
      new winston.transports.Console({
        format: consoleFormat
      }),
      // File output
      new winston.transports.File({
        filename: path.join(logDir, 'error.log'),
        level: 'error',
        maxsize: 5242880 * 2, // 10MB
        maxFiles: 5,
        tailable: true,
        zippedArchive: true,
        format: fileFormat
      }),
      new winston.transports.DailyRotateFile({
        filename: path.join(logDir, 'all-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        maxSize: '10m',
        maxFiles: '14d',
        zippedArchive: true,
        format: fileFormat
      }),
    ];
  };

  // Create Winston instance
  const Logger = winston.createLogger({
    level: level(),
    levels,
    format: fileFormat,
    transports: createTransports(),
    exitOnError: false, // Prevent log errors from crashing the app
  });

  const formatMessage = (message: string, meta: any[] = []) => {
    let metaStr = '';
    for (const item of meta) {
      if (typeof item === 'object') {
        metaStr += ` ${JSON.stringify(item)}`;
      } else {
        metaStr += ` ${item}`;
      }
    }
    return `[${namespace}] ${message} ${metaStr}`;
  };

  // Wrap log methods to ensure correct time delta calculation
  const wrapLogMethod = (method: (message: string) => void) => {
    return (message: string, ...meta: any[]) => {
      const now = Date.now();
      const diff = now - lastLogTime.value;
      lastLogTime.value = now;
      
      // Calculate time delta
      let timeDiff = '';
      if (diff < 1000) {
        timeDiff = `+${diff}ms`;
      } else if (diff < 60000) {
        timeDiff = `+${(diff / 1000).toFixed(2)}s`;
      } else if (diff < 3600000) {
        const minutes = Math.floor(diff / 60000);
        const seconds = ((diff % 60000) / 1000).toFixed(2);
        timeDiff = `+${minutes}m${seconds}s`;
      } else {
        const hours = Math.floor(diff / 3600000);
        const minutes = Math.floor((diff % 3600000) / 60000);
        const seconds = ((diff % 60000) / 1000).toFixed(2);
        timeDiff = `+${hours}h${minutes}m${seconds}s`;
      }
      
      method(`${formatMessage(message, meta)} (${timeDiff})`);
    };
  };

  return {
    error: wrapLogMethod(Logger.error.bind(Logger)),
    warn: wrapLogMethod(Logger.warn.bind(Logger)),
    info: wrapLogMethod(Logger.info.bind(Logger)),
    debug: wrapLogMethod(Logger.debug.bind(Logger)),
  };
};


export interface NativeLoggerModule extends Logger {
  setJsLogger(cb: (level: LogLevel, message: string) => void): void;
}

// const nativeLogger = createLogger('native');

// export const { Logger }: { Logger: NativeLoggerModule } = require('../../../native/modules/output/recorder');
// Logger.setJsLogger((level, message) => {
//   if (level === 'error') {
//     nativeLogger.error(message);
//   } else if (level === 'warn') {
//     nativeLogger.warn(message);
//   } else if (level === 'info') {
//     nativeLogger.info(message);
//   } else if (level === 'debug') {
//     nativeLogger.debug(message);
//   }
// });

// Export default logger
export default createLogger('app'); 