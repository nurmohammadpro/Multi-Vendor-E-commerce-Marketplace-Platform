/**
 * Print Queue Manager - Manages print jobs and device communication
 * Handles queuing, retries, and status tracking
 */

import type { HardwareDevice, PrintJob } from '@mvp/types';
import { TSPLPrinter, sendUSBCommand, connectUSBDevice } from './usb-hid.js';

export interface PrintQueueItem {
  jobId: string;
  deviceId: string;
  priority: 'low' | 'normal' | 'high';
  retryCount: number;
  maxRetries: number;
  createdAt: Date;
  lastRetryAt?: Date;
}

export class PrintQueueManager {
  private queue: PrintQueueItem[] = [];
  private isProcessing = false;
  private processIntervalId: NodeJS.Timeout | null = null;
  private listeners: Array<(status: PrintQueueStatus) => void> = [];
  private storeId: string;
  private connectedDevices: Map<string, any> = new Map();

  constructor(storeId: string) {
    this.storeId = storeId;
  }

  /**
   * Start processing print queue
   */
  startProcessing(intervalMs: number = 1000): void {
    if (this.isProcessing) return;

    this.isProcessing = true;
    console.log('[v0] Print queue processing started');

    this.processIntervalId = setInterval(() => {
      this.processPrintQueue().catch(err => {
        console.error('[v0] Error processing print queue:', err);
      });
    }, intervalMs);
  }

  /**
   * Stop processing print queue
   */
  stopProcessing(): void {
    if (this.processIntervalId) {
      clearInterval(this.processIntervalId);
      this.processIntervalId = null;
    }

    this.isProcessing = false;
    console.log('[v0] Print queue processing stopped');
  }

  /**
   * Add print job to queue
   */
  async addPrintJob(
    job: PrintJob,
    device: HardwareDevice,
    priority: 'low' | 'normal' | 'high' = 'normal'
  ): Promise<void> {
    const queueItem: PrintQueueItem = {
      jobId: job.id,
      deviceId: device.id,
      priority,
      retryCount: 0,
      maxRetries: 3,
      createdAt: new Date(),
    };

    // Insert in order by priority
    if (priority === 'high') {
      this.queue.unshift(queueItem);
    } else if (priority === 'low') {
      this.queue.push(queueItem);
    } else {
      // Insert before low priority items
      const lowPriorityIndex = this.queue.findIndex(q => q.priority === 'low');
      if (lowPriorityIndex >= 0) {
        this.queue.splice(lowPriorityIndex, 0, queueItem);
      } else {
        this.queue.push(queueItem);
      }
    }

    console.log('[v0] Print job added to queue:', job.id, `Priority: ${priority}`);
    this.notifyListeners();
  }

  /**
   * Process next print job in queue
   */
  private async processPrintQueue(): Promise<void> {
    if (this.queue.length === 0) return;

    const queueItem = this.queue[0];

    try {
      // Fetch job details from API
      const jobResponse = await fetch(
        `/api/v1/pos/hardware/print-jobs?jobId=${queueItem.jobId}`,
        {
          headers: { 'x-store-id': this.storeId },
        }
      );

      if (!jobResponse.ok) {
        throw new Error('Failed to fetch job details');
      }

      const job = await jobResponse.json();

      // Get device details
      const deviceResponse = await fetch(
        `/api/v1/pos/hardware/devices/${queueItem.deviceId}`,
        {
          headers: { 'x-store-id': this.storeId },
        }
      );

      if (!deviceResponse.ok) {
        throw new Error('Failed to fetch device details');
      }

      const device = await deviceResponse.json();

      // Print
      await this.printJob(job, device);

      // Update job status
      await this.updateJobStatus(queueItem.jobId, 'completed');

      // Remove from queue
      this.queue.shift();
      console.log('[v0] Print job completed:', queueItem.jobId);
    } catch (error) {
      queueItem.retryCount++;
      queueItem.lastRetryAt = new Date();

      if (queueItem.retryCount >= queueItem.maxRetries) {
        // Max retries exceeded
        await this.updateJobStatus(queueItem.jobId, 'failed', (error as Error).message);
        this.queue.shift();
        console.error('[v0] Print job failed (max retries):', queueItem.jobId, error);
      } else {
        // Retry later
        console.warn('[v0] Print job failed, retrying:', queueItem.jobId, error);
      }
    }

    this.notifyListeners();
  }

  /**
   * Print a single job
   */
  private async printJob(job: PrintJob, device: HardwareDevice): Promise<void> {
    // Ensure device is connected
    let usbDevice = this.connectedDevices.get(device.id);

    if (!usbDevice) {
      // Device not connected, skip for now (would need WebUSB request)
      console.warn('[v0] Device not connected:', device.id);
      throw new Error(`Device not connected: ${device.deviceName}`);
    }

    // Build TSPL commands based on job type
    let tsplCommand = job.tsplCommand;

    if (!tsplCommand) {
      tsplCommand = this.buildTsplCommand(job);
    }

    // Send to printer
    const encoder = new TextEncoder();
    const data = encoder.encode(tsplCommand);

    await sendUSBCommand(usbDevice, data);
    console.log('[v0] Print job sent to device:', device.deviceName);
  }

  /**
   * Build TSPL command from job content
   */
  private buildTsplCommand(job: PrintJob): string {
    const commands: string[] = [];

    commands.push('CLS');
    commands.push('SIZE 80mm,100mm');

    if (job.jobType === 'receipt') {
      // Receipt template
      commands.push('TEXT 50,50,"A",0,1,1,"Receipt"');

      if (job.contentJson.orderNumber) {
        commands.push(`TEXT 50,80,"A",0,1,1,"Order: ${job.contentJson.orderNumber}"`);
      }

      if (job.contentJson.items && Array.isArray(job.contentJson.items)) {
        let yPos = 120;
        for (const item of job.contentJson.items) {
          commands.push(`TEXT 50,${yPos},"A",0,1,1,"${item.description}"`);
          yPos += 20;
          commands.push(`TEXT 50,${yPos},"A",0,1,1,"${item.quantity}x $${item.total}"`);
          yPos += 20;
        }
      }

      if (job.contentJson.total) {
        commands.push(`TEXT 50,300,"A",0,2,2,"Total: $${job.contentJson.total}"`);
      }

      if (job.contentJson.deviceSerial) {
        commands.push(`BARCODE 50,350,"CODE128",60,1,0,2,"${job.contentJson.deviceSerial}"`);
      }
    } else if (job.jobType === 'label') {
      // Label template
      commands.push(`TEXT 50,50,"A",0,2,2,"${job.contentJson.deviceModel}"`);

      if (job.contentJson.serialNumber) {
        commands.push(`TEXT 50,100,"A",0,1,1,"Serial: ${job.contentJson.serialNumber}"`);
        commands.push(`BARCODE 50,130,"CODE128",60,1,0,2,"${job.contentJson.serialNumber}"`);
      }

      if (job.contentJson.warrantyNumber) {
        commands.push(`TEXT 50,220,"A",0,1,1,"Warranty: ${job.contentJson.warrantyNumber}"`);
      }
    }

    commands.push('PRINT 1');

    return commands.join('\n') + '\n';
  }

  /**
   * Update job status via API
   */
  private async updateJobStatus(
    jobId: string,
    status: string,
    errorMessage?: string
  ): Promise<void> {
    await fetch(`/api/v1/pos/hardware/print-jobs/${jobId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-store-id': this.storeId,
      },
      body: JSON.stringify({ status, errorMessage }),
    });
  }

  /**
   * Register a connected USB device
   */
  registerConnectedDevice(deviceId: string, usbDevice: any): void {
    this.connectedDevices.set(deviceId, usbDevice);
    console.log('[v0] USB device registered:', deviceId);
  }

  /**
   * Unregister a USB device
   */
  unregisterDevice(deviceId: string): void {
    this.connectedDevices.delete(deviceId);
    console.log('[v0] USB device unregistered:', deviceId);
  }

  /**
   * Get queue status
   */
  getQueueStatus(): PrintQueueStatus {
    return {
      queueLength: this.queue.length,
      isProcessing: this.isProcessing,
      connectedDevices: this.connectedDevices.size,
      queue: this.queue,
    };
  }

  /**
   * Listen for queue status changes
   */
  onStatusChange(callback: (status: PrintQueueStatus) => void): void {
    this.listeners.push(callback);
  }

  /**
   * Notify all listeners
   */
  private notifyListeners(): void {
    const status = this.getQueueStatus();
    this.listeners.forEach(listener => listener(status));
  }

  /**
   * Clear queue
   */
  clearQueue(): void {
    this.queue = [];
    console.log('[v0] Print queue cleared');
    this.notifyListeners();
  }

  /**
   * Get queue items
   */
  getQueueItems(): PrintQueueItem[] {
    return [...this.queue];
  }
}

export interface PrintQueueStatus {
  queueLength: number;
  isProcessing: boolean;
  connectedDevices: number;
  queue: PrintQueueItem[];
}
