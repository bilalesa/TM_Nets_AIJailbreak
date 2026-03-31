// frontend/src/hooks/useStopwatch.ts
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

export function useStopwatch(autoStart = false, persistKey?: string) {
  const [elapsed, setElapsed] = useState(0); // seconds
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const accumulatedRef = useRef(0);
  const isInitializedRef = useRef(false);

  // Initialize from sessionStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (persistKey) {
        const stored = sessionStorage.getItem(persistKey);
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            accumulatedRef.current = parsed.accumulated || 0;
            if (parsed.running && parsed.startTime) {
              const delta = Math.floor((Date.now() - parsed.startTime) / 1000);
              accumulatedRef.current += delta;
              setRunning(true);
            } else {
              setRunning(false);
            }
            setElapsed(accumulatedRef.current);
          } catch (e) {
            console.error('Failed to parse stopwatch state:', e);
          }
        } else if (autoStart) {
          setRunning(true);
        }
      } else if (autoStart) {
        setRunning(true);
      }
      isInitializedRef.current = true;
    }
  }, [persistKey, autoStart]);

  // Persist state whenever it changes
  useEffect(() => {
    if (isInitializedRef.current && persistKey && typeof window !== 'undefined') {
      sessionStorage.setItem(
        persistKey,
        JSON.stringify({
          accumulated: accumulatedRef.current,
          startTime: startTimeRef.current,
          running,
        })
      );
    }
  }, [elapsed, running, persistKey]);

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