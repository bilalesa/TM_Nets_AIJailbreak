// frontend/src/hooks/useStopwatch.ts
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

export function useStopwatch(autoStart = false) {
  const [elapsed, setElapsed] = useState(0); // seconds
  const [running, setRunning] = useState(autoStart);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const accumulatedRef = useRef(0);

  const tick = useCallback(() => {
    if (startTimeRef.current !== null) {
      const delta = Math.floor((Date.now() - startTimeRef.current) / 1000);
      setElapsed(accumulatedRef.current + delta);
    }
  }, []);

  useEffect(() => {
    if (running) {
      startTimeRef.current = Date.now();
      intervalRef.current = setInterval(tick, 500);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (startTimeRef.current !== null) {
        accumulatedRef.current += Math.floor(
          (Date.now() - startTimeRef.current) / 1000
        );
        startTimeRef.current = null;
      }
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running, tick]);

  const start = useCallback(() => setRunning(true), []);
  const stop = useCallback(() => setRunning(false), []);
  const reset = useCallback(() => {
    setRunning(false);
    setElapsed(0);
    accumulatedRef.current = 0;
    startTimeRef.current = null;
  }, []);

  // Format as HH:MM:SS
  const formatted = [
    String(Math.floor(elapsed / 3600)).padStart(2, '0'),
    String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0'),
    String(elapsed % 60).padStart(2, '0'),
  ].join(' : ');

  return { elapsed, formatted, running, start, stop, reset };
}