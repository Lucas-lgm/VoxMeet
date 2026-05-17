/// <reference path="../types/global.d.ts" />
import { ConsoleLogger, LogLevel } from "./ConsoleLogger";

export class Logger extends ConsoleLogger {
    constructor(namespace: string) {
        super(namespace);
    }

    private formatMessage(message: string, ...meta: any[]) {
        let metaStr = '';
        for (const item of meta) {
            if (item instanceof Error) {
                metaStr += ` ${item.message} ${item.stack}`;
            } else if (item instanceof Date) {
                metaStr += ` ${item.toISOString()}`;
            } else if (typeof item === 'object' && item !== null) {
                metaStr += ` ${JSON.stringify(item)}`;
            } else {
                metaStr += ` ${item}`;
            }
        }
        return `[${this.namespace}] ${message} ${metaStr}`;
    }

    private printLog(level: LogLevel, message: string, ...meta: any[]) {
        if (level < this.logLevel) {
            return;
        }
        if (level === LogLevel.DEBUG) {
            super.debug(message, ...meta);
            window.electronAPI.logger.debug(this.formatMessage(message, ...meta));
        } else if (level === LogLevel.INFO) {
            super.info(message, ...meta);
            window.electronAPI.logger.info(this.formatMessage(message, ...meta));
        } else if (level === LogLevel.WARN) {
            super.warn(message, ...meta);
            window.electronAPI.logger.warn(this.formatMessage(message, ...meta));
        } else if (level === LogLevel.ERROR) {
            super.error(message, ...meta);
            window.electronAPI.logger.error(this.formatMessage(message, ...meta));
        }
    }

    override info(message: string, ...meta: any[]) {
        this.printLog(LogLevel.INFO, message, ...meta);
    }

    override error(message: string, ...meta: any[]) {
        this.printLog(LogLevel.ERROR, message, ...meta);
    }
    
    override warn(message: string, ...meta: any[]) {
        this.printLog(LogLevel.WARN, message, ...meta);
    }

    override debug(message: string, ...meta: any[]) {
        this.printLog(LogLevel.DEBUG, message, ...meta);
    }
}

export function createLogger(namespace: string) {
    const logger = new Logger(namespace);
    logger.setLogLevel(window.__DEV__ ? LogLevel.DEBUG : LogLevel.INFO);
    return logger;
}