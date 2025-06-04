import { spawn, ChildProcess } from 'child_process';
import { app } from 'electron';
import path from 'path';
import { createLogger } from '../utils/logger';
import { EventEmitter } from 'events';

interface MicStatus {
  timestamp: number;
  status: 'ON' | 'OFF';
  appName: string;
  bundleId: string;
  processName: string;
  pid: string;
  path: string;
  category: string;
  outputStatus: string;
  isSystemProcess: boolean;
}

interface ProcessStatus {
  pid: string;
  status: 'ON' | 'OFF';
  timestamp: number;
  appName: string;
  bundleId: string;
  processName: string;
  path: string;
  category: string;
  outputStatus: string;
  isSystemProcess: boolean;
}

class MicMonitorDaemon extends EventEmitter {
  private appProcesses: Map<string, Map<string, ProcessStatus>> = new Map();
  private activeApps: Map<string, MicStatus> = new Map();
  private ignoreBundleIds: string[] = ["com.github.Electron", "com.voxmeet.app"];
  private monitorProcess: ChildProcess | null = null;
  private isRunning: boolean = false;
  private scriptPath: string;
  private logger = createLogger('mic-monitor-daemon');
  private restartAttempts: number = 0;
  private buffer: string = '';

  constructor() {
    super();
    this.scriptPath = path.join(app.getAppPath(), 'native', 'modules', 'output', 'mic_monitor');
    this.logger.info('MicMonitorDaemon initialized');
  }

  public start(): void {
    if (this.isRunning) {
      this.logger.warn('MicMonitorDaemon is already running');
      return;
    }

    this.startMonitoring();
  }

  private startMonitoring(): void {
    try {
      this.logger.info('Starting MicMonitorDaemon...');

      if (!app.isPackaged) {
        this.scriptPath = path.join(app.getAppPath(), 'native', 'modules', 'output', 'mic_monitor');
      } else {
        this.scriptPath = path.join(process.resourcesPath, 'mic_monitor');
      }

      // Start the monitoring process
      this.monitorProcess = spawn(this.scriptPath);
      this.isRunning = true;
      this.restartAttempts = 0;
      this.logger.info('Monitoring process started');

      this.monitorProcess.stdout?.on('data', (data: Buffer) => {
        this.buffer += data.toString().trim();
        this.parseOutput();
      });

      this.monitorProcess.stderr?.on('data', (data: Buffer) => {
        // this.logger.warn(data.toString());
      });

      this.monitorProcess?.on('error', (error) => {
        this.logger.error('Monitor process error', { error });
      });

      this.monitorProcess?.on('exit', (code) => {
        this.logger.warn('Monitor process exited', { code });
        if (this.isRunning) {
          this.startMonitoring();
        }
      });
    } catch (error) {
      this.logger.error('Failed to start mic monitor', { error });
    }
  }

  private parseOutput(): void {
    const startMarker = '###JSON_START###';
    const endMarker = '###JSON_END###';
    
    let startIndex = this.buffer.indexOf(startMarker);
    let endIndex = this.buffer.indexOf(endMarker);
    
    while (startIndex !== -1 && endIndex !== -1) {
      try {
        // Extract full JSON string (excluding markers)
        const jsonStr = this.buffer.substring(
          startIndex + startMarker.length,
          endIndex
        );
        
        const data = JSON.parse(jsonStr);
        
        if (data.type === 'mic_status' && data.app && data.status) {
          const status: MicStatus = {
            timestamp: new Date(data.timestamp).getTime(),
            status: data.status,
            appName: data.app.name,
            bundleId: data.app.bundleId,
            processName: data.app.process,
            pid: data.app.pid.toString(),
            path: data.app.path,
            isSystemProcess: data.app.isSystemProcess,
            category: data.audio?.category || '',
            outputStatus: data.audio?.outputRunning ? 'true' : 'false'
          };
          
          this.updateStatus(status);
        }
      } catch (e) {
        this.logger.error('Failed to parse JSON', { 
          output: this.buffer.substring(startIndex, endIndex + endMarker.length),
          error: e 
        });
      }
      
      // Continue searching for next JSON object
      startIndex = this.buffer.indexOf(startMarker, endIndex + endMarker.length);
      endIndex = this.buffer.indexOf(endMarker, startIndex);
    }
    
    // Clean up processed data
    if (endIndex !== -1) {
      this.buffer = this.buffer.substring(endIndex + endMarker.length);
    }
  }

  private updateStatus(status: MicStatus): void {
    // Check if this status should be ignored
    if (status.bundleId && this.ignoreBundleIds.includes(status.bundleId)) {
      // this.logger.debug('Ignoring mic status change', { status });
      return;
    }

    if (status.isSystemProcess) {
      this.logger.warn("status", status);
      return;
    }

    // Get or create process map for app
    let appProcesses = this.appProcesses.get(status.bundleId);
    if (!appProcesses) {
      appProcesses = new Map();
      this.appProcesses.set(status.bundleId, appProcesses);
    }

    // Update process status
    appProcesses.set(status.pid, {
      pid: status.pid,
      status: status.status,
      timestamp: status.timestamp,
      appName: status.appName,
      bundleId: status.bundleId,
      processName: status.processName,
      path: status.path,
      category: status.category,
      outputStatus: status.outputStatus,
      isSystemProcess: status.isSystemProcess
    });

    setTimeout(() => {
      // Check if app has any active processes
      let appProcesses = this.appProcesses.get(status.bundleId);
      if (!appProcesses) {
        return;
      }
      const activeProcesses = Array.from(appProcesses.values()).filter(
        proc => proc.status === 'ON'
      );
      const hasActiveProcess = activeProcesses.length > 0;

      this.logger.debug('Process status update', {
        bundleId: status.bundleId,
        pid: status.pid,
        status: this.activeApps.has(status.bundleId) ? 'ON' : 'OFF',
        activeProcesses: activeProcesses.map(p => p.pid)
      });

      if (hasActiveProcess) {
        this.logger.info('Mic usage detected', {
          app: status.appName,
          bundleId: status.bundleId,
          activeProcesses: activeProcesses.map(p => p.pid)
        });
        this.activeApps.set(status.bundleId, status);
        this.emit('statusChange', {...status, status: 'ON'});
      } else {
        // Only update status when app is currently active and has no active processes
        if (this.activeApps.has(status.bundleId)) {
          this.logger.info('Mic usage stopped', {
            app: status.appName,
            bundleId: status.bundleId,
            lastActiveProcess: status.pid
          });
          this.activeApps.delete(status.bundleId);
          this.emit('statusChange', { ...status, status: 'OFF' });
        }
      }
    }, 3000);
  }

  public stop(): void {
    this.isRunning = false;
    if (this.monitorProcess) {
      this.monitorProcess.kill();
      this.monitorProcess = null;
    }
    this.activeApps.clear();
    this.appProcesses.clear();
  }

  public getActiveApps(): MicStatus[] {
    return Array.from(this.activeApps.values());
  }

  public clearActiveApps(): void {
    this.activeApps.clear();
    this.logger.info('Cleared active apps');
  }

  public setIgnoreBundleIds(bundleIds: string[]): void {
    this.ignoreBundleIds = bundleIds;
  }
}

// Create singleton instance
const daemon = new MicMonitorDaemon();

// Export singleton
export default daemon; 