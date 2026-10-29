export type ReconnectFailure = 'network' | 'authentication' | 'revoked' | 'manual' | 'unsupported';
export class ReconnectError extends Error {
  constructor(readonly kind: ReconnectFailure, message: string) { super(message); this.name = 'ReconnectError'; }
}
export interface ReconnectOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  attemptTimeoutMs?: number;
  onAttempt?(attempt: number): void;
}
const CANCELLED = Symbol('cancelled');
/** Nothing starts until start() is explicitly called. A cancelled generation can never retry. */
export class Reconnector {
  private current: AbortController | null = null;
  private generation = 0;
  cancel(): void { this.generation++; this.current?.abort(); this.current = null; }
  get active(): boolean { return !!this.current; }
  async start(attempt: (signal: AbortSignal, attempt: number) => Promise<void>, options: ReconnectOptions = {}): Promise<boolean> {
    this.cancel();
    const maxAttempts = options.maxAttempts ?? 4;
    const initial = options.initialDelayMs ?? 500;
    const maximum = options.maxDelayMs ?? 8000;
    const timeout = options.attemptTimeoutMs ?? 15000;
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 8 || !Number.isFinite(initial) || initial < 1 || !Number.isFinite(maximum) || maximum < initial || maximum > 30000 || !Number.isFinite(timeout) || timeout < 1 || timeout > 60000) throw new Error('Invalid reconnection limits.');
    const generation = this.generation;
    const controller = new AbortController(); this.current = controller;
    try {
      for (let index = 1; index <= maxAttempts; index++) {
        if (controller.signal.aborted || generation !== this.generation) return false;
        if (index > 1 && !await this.delay(Math.min(maximum, initial * 2 ** (index - 2)), controller.signal)) return false;
        options.onAttempt?.(index);
        if (controller.signal.aborted || generation !== this.generation) return false;
        try {
          const result = await this.runAttempt(attempt, index, controller.signal, timeout);
          if (result === CANCELLED || controller.signal.aborted || generation !== this.generation) return false;
          return true;
        } catch (error) {
          if (controller.signal.aborted || generation !== this.generation) return false;
          if (!(error instanceof ReconnectError) || error.kind !== 'network' || index === maxAttempts) throw error;
        }
      }
      return false;
    } finally { if (this.current === controller) this.current = null; }
  }
  private delay(ms: number, signal: AbortSignal): Promise<boolean> {
    return new Promise(resolve => {
      const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); resolve(false); };
      const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(true); }, ms);
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
    });
  }
  private runAttempt(attempt: (signal: AbortSignal, attempt: number) => Promise<void>, index: number, signal: AbortSignal, timeoutMs: number): Promise<void | typeof CANCELLED> {
    return new Promise((resolve, reject) => {
      const child = new AbortController();
      let settled = false;
      const finish = (error?: unknown, cancelled = false) => {
        if (settled) return; settled = true;
        clearTimeout(timer); signal.removeEventListener('abort', abort);
        if (error) reject(error); else resolve(cancelled ? CANCELLED : undefined);
      };
      const abort = () => { child.abort(); finish(undefined, true); };
      const timer = setTimeout(() => { child.abort(); finish(new ReconnectError('network', 'Trusted connection timed out.')); }, timeoutMs);
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) { abort(); return; }
      Promise.resolve().then(() => { if (child.signal.aborted) return; return attempt(child.signal, index); }).then(() => finish(), error => finish(error));
    });
  }
}
