// frontend/src/types/game.ts

export interface Player {
  id: string;
  username: string;
  total_score: number;
  session_active: boolean;
  last_active_at: string;
  created_at: string;
}

export interface Stage {
  id: number;
  name: string;
  subtitle: string;
  base_xp: number;
  hint: string;
  scenario_description: string; // shown to user as flavour text
  is_locked: boolean;
  is_completed: boolean;
}

export interface StageCompletion {
  id: string;
  player_id: string;
  stage_number: number;
  score_awarded: number;
  time_taken_seconds: number;
  completed_at: string;
}

export interface Message {
  id: string;
  role: 'bot' | 'user';
  content: string;
  timestamp: number;
}

export interface ChatSession {
  stageNumber: number;
  messages: Message[];
  startTime: number | null; // epoch ms when timer started
  elapsedSeconds: number;
  isCompleted: boolean;
}

export type StageStatus = 'locked' | 'unlocked' | 'completed';