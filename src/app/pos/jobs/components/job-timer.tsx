'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Pause, Play } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { posFetch } from '../../lib/pos-fetch';

interface JobTimerProps {
  jobId: string;
  /** Accumulated seconds stored in DB */
  timerSeconds: number;
  /** When work started (running segment) — null if paused */
  workStartedAt: string | null;
  /** When timer was paused — null if running */
  timerPausedAt: string | null;
  /** Called after pause/resume succeeds with updated job data */
  onUpdate: (job: Record<string, unknown>) => void;
}

function formatTimer(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function JobTimer({
  jobId,
  timerSeconds,
  workStartedAt,
  timerPausedAt,
  onUpdate,
}: JobTimerProps) {
  const [displaySeconds, setDisplaySeconds] = useState(0);
  const [toggling, setToggling] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isPaused = !!timerPausedAt;
  const isRunning = !!workStartedAt && !timerPausedAt;

  // Compute display time
  const computeDisplay = useCallback(() => {
    if (isPaused) {
      return timerSeconds;
    }
    if (workStartedAt) {
      const started = new Date(workStartedAt).getTime();
      const elapsed = Math.floor((Date.now() - started) / 1000);
      return timerSeconds + elapsed;
    }
    return timerSeconds;
  }, [timerSeconds, workStartedAt, isPaused]);

  useEffect(() => {
    setDisplaySeconds(computeDisplay());

    if (isRunning) {
      intervalRef.current = setInterval(() => {
        setDisplaySeconds(computeDisplay());
      }, 1000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isRunning, computeDisplay]);

  async function handleToggle() {
    setToggling(true);
    try {
      const action = isPaused ? 'resume' : 'pause';
      const res = await posFetch(`/api/pos/jobs/${jobId}/timer`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        const { data } = await res.json();
        onUpdate(data);
      }
    } catch (err) {
      console.error('Timer toggle error:', err);
    } finally {
      setToggling(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <div
        className={cn(
          'flex items-center gap-2 rounded-lg px-3 py-1.5',
          isPaused && 'animate-pulse bg-yellow-50',
          isRunning && 'bg-green-50'
        )}
      >
        <span
          className={cn(
            'font-mono text-lg font-semibold tabular-nums',
            isPaused ? 'text-yellow-700' : 'text-green-700'
          )}
        >
          {formatTimer(displaySeconds)}
        </span>
        {isPaused && (
          <span className="text-xs font-medium uppercase text-yellow-600">Paused</span>
        )}
      </div>
      <button
        onClick={handleToggle}
        disabled={toggling}
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-full transition-colors disabled:opacity-50',
          isPaused
            ? 'bg-green-100 text-green-700 hover:bg-green-200'
            : 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
        )}
        title={isPaused ? 'Resume timer' : 'Pause timer'}
      >
        {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
      </button>
    </div>
  );
}
