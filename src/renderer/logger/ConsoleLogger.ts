/// <reference path="../types/global.d.ts" />

export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
}

export class ConsoleLogger {
    protected logLevel: LogLevel = LogLevel.DEBUG;
    constructor(protected namespace: string) {
    }
    private format(level: LogLevel, message: string) {
        return `[${this.namespace}] ${message}`;
    }

    private log(level: LogLevel, message: string, ...meta: any[]) {
        if (level < this.logLevel || !window.__DEV__) {
            return;
        }
        if (level === LogLevel.DEBUG) {
            console.debug(this.format(level, message), ...meta);
        } else if (level === LogLevel.INFO) {
            console.log(this.format(level, message), ...meta);
        } else if (level === LogLevel.WARN) {
            console.warn(this.format(level, message), ...meta);
        } else if (level === LogLevel.ERROR) {
            console.error(this.format(level, message), ...meta);
        }
    }

    setLogLevel(level: LogLevel) {
        this.logLevel = level;
    }

    info(message: string, ...meta: any[]) {
        this.log(LogLevel.INFO, message, ...meta);
    }

    error(message: string, ...meta: any[]) {
        this.log(LogLevel.ERROR, message, ...meta);
    }
    
    warn(message: string, ...meta: any[]) {
        this.log(LogLevel.WARN, message, ...meta);
    }

    debug(message: string, ...meta: any[]) {
        this.log(LogLevel.DEBUG, message, ...meta);
    }
}