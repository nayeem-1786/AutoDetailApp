/**
 * Voice agent performance timing utility.
 * Logs [VOICE-PERF] metrics for each tool call: total time, per-query time, payload size.
 * Intended for production profiling — remove or disable after optimization is complete.
 */

export function createPerfTimer(routeName: string) {
  const start = Date.now();
  const marks: Array<{ label: string; ms: number }> = [];

  return {
    /** Mark a named timing point (call AFTER the operation completes) */
    mark(label: string, startTime: number) {
      marks.push({ label, ms: Date.now() - startTime });
    },

    /** Get current timestamp for use with mark() */
    now: () => Date.now(),

    /** Log all timings + total + payload size */
    done(responseData?: unknown) {
      const total = Date.now() - start;
      const parts = marks.map((m) => `${m.label}=${m.ms}ms`).join(' ');
      const payloadSize = responseData ? JSON.stringify(responseData).length : 0;
      console.log(
        `[VOICE-PERF] ${routeName} total=${total}ms ${parts}${payloadSize ? ` payload=${payloadSize}b` : ''}`
      );
    },
  };
}
