export interface QueueTicket {
  id: number;
  enqueuedAt: string;
  timestampNs: string;
  metadata: Record<string, unknown>;
}

export interface QueueAudit extends QueueTicket {
  startedAt: string;
  finishedAt: string;
}

export interface QueueResult<T> {
  audit: QueueAudit;
  data: T;
}

export type QueueTask<T> = (ticket: QueueTicket) => Promise<T>;

interface QueueItem<T> {
  ticket: QueueTicket;
  taskFn: QueueTask<T>;
  resolve: (value: QueueResult<T>) => void;
  reject: (reason?: unknown) => void;
}

export class FifoQueue {
  private queue: QueueItem<unknown>[] = [];
  private processing: boolean = false;
  private sequence: number = 0;

  public enqueue<T>(
    taskFn: QueueTask<T>,
    metadata: Record<string, unknown> = {}
  ): Promise<QueueResult<T>> {
    const ticket: QueueTicket = {
      id: ++this.sequence,
      enqueuedAt: new Date().toISOString(),
      timestampNs: process.hrtime.bigint().toString(),
      metadata
    };

    return new Promise<QueueResult<T>>((resolve, reject) => {
      const item: QueueItem<T> = {
        ticket,
        taskFn,
        resolve,
        reject
      };

      this.queue.push(item as QueueItem<unknown>);
      this.processNext();
    });
  }

  private async processNext(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;
    const item = this.queue.shift()!;
    const startedAt = new Date().toISOString();

    try {
      const result = await item.taskFn(item.ticket);
      const finishedAt = new Date().toISOString();

      item.resolve({
        audit: {
          ...item.ticket,
          startedAt,
          finishedAt
        },
        data: result
      });
    } catch (error) {
      if (error instanceof Error) {
        Object.assign(error, {
          audit: {
            ...item.ticket,
            startedAt,
            failedAt: new Date().toISOString()
          }
        });
      }
      item.reject(error);
    } finally {
      this.processing = false;
      this.processNext();
    }
  }

  public size(): number {
    return this.queue.length;
  }
}