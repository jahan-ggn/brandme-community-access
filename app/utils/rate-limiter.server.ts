type Task = () => Promise<void>;

class ConcurrencyLimiter {
  private active = 0;
  private queue: Task[] = [];

  constructor(private maxConcurrent: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const execute = async () => {
        this.active++;
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          this.active--;
          this.drain();
        }
      };

      if (this.active < this.maxConcurrent) {
        execute();
      } else {
        this.queue.push(execute);
      }
    });
  }

  private drain(): void {
    if (this.queue.length > 0 && this.active < this.maxConcurrent) {
      const next = this.queue.shift();
      if (next) next();
    }
  }
}

const limiters = new Map<string, ConcurrencyLimiter>();
const MAX_CONCURRENT_PER_COMMUNITY = 5;

export function getLimiter(discourseUrl: string): ConcurrencyLimiter {
  let limiter = limiters.get(discourseUrl);
  if (!limiter) {
    limiter = new ConcurrencyLimiter(MAX_CONCURRENT_PER_COMMUNITY);
    limiters.set(discourseUrl, limiter);
  }
  return limiter;
}
