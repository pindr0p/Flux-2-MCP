export class ConcurrencyLimiter {
  private activeCount = 0;
  private readonly waitQueue: Array<() => void> = [];

  constructor(private readonly maxConcurrent: number) {
    if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1) {
      throw new Error("ConcurrencyLimiter requires a positive integer limit.");
    }
  }

  async run<T>(operation: () => Promise<T>): Promise<T> {
    await this.acquire();

    try {
      return await operation();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.activeCount < this.maxConcurrent) {
      this.activeCount += 1;
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.waitQueue.push(() => {
        this.activeCount += 1;
        resolve();
      });
    });
  }

  private release(): void {
    this.activeCount -= 1;
    const next = this.waitQueue.shift();
    next?.();
  }
}