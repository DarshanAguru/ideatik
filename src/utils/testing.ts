/**
 * Testing utilities and performance monitoring
 */

export interface PerformanceMetric {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  metadata?: Record<string, any>;
}

class PerformanceMonitorClass {
  private metrics: Map<string, PerformanceMetric> = new Map();
  private enabled = __DEV__; // Only in development

  startMeasure(name: string, metadata?: Record<string, any>): void {
    if (!this.enabled) return;

    this.metrics.set(name, {
      name,
      startTime: Date.now(),
      metadata,
    });
  }

  endMeasure(name: string): PerformanceMetric | null {
    if (!this.enabled) return null;

    const metric = this.metrics.get(name);
    if (!metric) {
      console.warn(`Performance metric "${name}" was not started`);
      return null;
    }

    metric.endTime = Date.now();
    metric.duration = metric.endTime - metric.startTime;

    if (metric.duration > 1000) {
      console.warn(`⏱️  SLOW: ${name} took ${metric.duration}ms`, metric.metadata);
    } else {
      console.log(`✓ ${name} took ${metric.duration}ms`);
    }

    return metric;
  }

  getAllMetrics(): PerformanceMetric[] {
    return Array.from(this.metrics.values());
  }

  clearMetrics(): void {
    this.metrics.clear();
  }

  reportMetrics(): void {
    if (!this.enabled) return;

    const metrics = this.getAllMetrics();
    if (metrics.length === 0) {
      console.log('No metrics recorded');
      return;
    }

    console.log('\n=== Performance Report ===');
    metrics.forEach((m) => {
      if (m.duration) {
        const status = m.duration > 1000 ? '⚠️' : '✓';
        console.log(`${status} ${m.name}: ${m.duration}ms`);
      }
    });
    console.log('========================\n');
  }
}

export const PerformanceMonitor = new PerformanceMonitorClass();

/**
 * Safe async wrapper with timeout
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = 30000,
  name: string = 'Operation'
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${name} timed out after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}

/**
 * Retry utility with exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000,
  name: string = 'Operation'
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      const waitTime = delayMs * Math.pow(2, attempt);
      console.warn(
        `${name} failed (attempt ${attempt + 1}/${maxRetries}), retrying in ${waitTime}ms...`,
        lastError
      );
      await new Promise<void>((resolve) => setTimeout(() => resolve(), waitTime));
    }
  }

  throw lastError || new Error(`${name} failed after ${maxRetries} attempts`);
}

/**
 * Deep equality checker for objects
 */
export function deepEqual(obj1: any, obj2: any): boolean {
  if (obj1 === obj2) return true;
  if (obj1 == null || obj2 == null) return obj1 === obj2;
  if (typeof obj1 !== 'object' || typeof obj2 !== 'object') return false;

  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);

  if (keys1.length !== keys2.length) return false;

  return keys1.every((key) => deepEqual(obj1[key], obj2[key]));
}

/**
 * Safe JSON parse with fallback
 */
export function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

/**
 * Safe JSON stringify with fallback
 */
export function safeJsonStringify(obj: any, fallback: string = '{}'): string {
  try {
    return JSON.stringify(obj);
  } catch {
    return fallback;
  }
}
