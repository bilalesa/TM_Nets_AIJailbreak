import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * 1. The Tailwind Class Merger (Essential)
 * This prevents Tailwind classes from clashing when you pass custom styles 
 * into your components or trigger Framer Motion animations.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 2. The Game Timer Formatter
 * Converts raw seconds (e.g., 125) into a clean digital clock format (02:05) 
 * for your game UI and leaderboards.
 */
export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}