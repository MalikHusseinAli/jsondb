"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FifoQueue = void 0;
class FifoQueue {
    queue = [];
    processing = false;
    sequence = 0;
    enqueue(taskFn, metadata = {}) {
        const ticket = {
            id: ++this.sequence,
            enqueuedAt: new Date().toISOString(),
            timestampNs: process.hrtime.bigint().toString(),
            metadata
        };
        return new Promise((resolve, reject) => {
            const item = {
                ticket,
                taskFn,
                resolve,
                reject
            };
            this.queue.push(item);
            this.processNext();
        });
    }
    async processNext() {
        if (this.processing || this.queue.length === 0) {
            return;
        }
        this.processing = true;
        const item = this.queue.shift();
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
        }
        catch (error) {
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
        }
        finally {
            this.processing = false;
            this.processNext();
        }
    }
    size() {
        return this.queue.length;
    }
}
exports.FifoQueue = FifoQueue;
