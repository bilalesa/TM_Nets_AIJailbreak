'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send,
  HelpCircle,
  KeyRound,
  Lightbulb,
  Timer,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SERVER_STAGE_CONFIGS } from '@/lib/stageConfig';
import { useStopwatch } from '@/hooks/useStopwatch';
import Sidebar from '@/components/game/Sidebar';
import EnterCodeModal from '@/components/game/EnterCodeModal';
import StageCompleteModal from '@/components/game/StageCompleteModal';
import HowToPlayModal from '@/components/game/HowToPlayModal';
import type { Message } from '@/types/game';

// ─── Unique ID helper ─────────────────────────────────────────────────────────
function uid() {
  return Math.random().toString(36).slice(2, 10);
}

async function parseJsonSafe(response: Response): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function mapApiErrorToPlayerMessage(status: number, rawError?: string, retryable?: boolean): string {
  const error = (rawError || '').trim();

  if (retryable) {
    return 'The AI agent may be overloaded right now. Please try sending your prompt again in a few seconds.';
  }

  if (status === 401) {
    return 'Your session has expired. Please sign in again.';
  }

  if (status === 403) {
    return 'This stage is currently locked. Complete previous stages first.';
  }

  if (status === 404) {
    return 'We could not find this request result. Please send your prompt again.';
  }

  if (status === 429) {
    return 'High traffic right now. Please wait a few seconds and send again.';
  }

  if (status === 503 || status === 502 || status === 504 || status === 500) {
    return 'The AI agent may be overloaded right now. Please try sending your prompt again in a few seconds.';
  }

  return error || 'Unable to process your message right now. Please try again.';
}


// ─── Player state interface ───────────────────────────────────────────────────
interface PlayerState {
  username: string;
  totalScore: number;
  completedStages: number[];
}

export default function StagePage() {
  const params = useParams();
  const router = useRouter();
  const stageId = Number(params.id);
  const stageConfig = SERVER_STAGE_CONFIGS[stageId - 1];
  const invalidStage = !stageConfig || Number.isNaN(stageId) || stageId < 1 || stageId > 5;

  // ── Player state (hydrated from API) ─────────────────────────────────────
  const [player, setPlayer] = useState<PlayerState | null>(null);
  const [playerLoading, setPlayerLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Keep sidebar collapsed by default on phones and track viewport changes.
  useEffect(() => {
    const updateViewport = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) {
        setSidebarCollapsed(true);
      }
    };

    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  // ── Chat state ────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<Message[]>([]);
  const [openingMessage, setOpeningMessage] = useState<string>(openingMessage);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [timerStarted, setTimerStarted] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ── Stage already completed? ──────────────────────────────────────────────
  const isStageCompleted = player?.completedStages.includes(stageId) ?? false;

  // ── Code extracted (AI revealed the code)? ────────────────────────────────
  const codeExtracted = messages.some((m) => m.role === 'bot' && m.content.includes('🔑 System bypassed'));

  // ── Stopwatch ─────────────────────────────────────────────────────────────
  const {
    elapsed,
    formatted,
    running,
    start: startTimer,
    stop: stopTimer,
    resume: resumeTimer,
  } = useStopwatch(false, `stage-${stageId}-timer`);
  // Redirect invalid stage ids after hooks are initialized.
  useEffect(() => {
    if (invalidStage) {
      router.replace('/stage');
    }
  }, [invalidStage, router]);


  // ── Modals ────────────────────────────────────────────────────────────────
  const [showEnterCode, setShowEnterCode] = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [showStageComplete, setShowStageComplete] = useState(false);
  const [stageResult, setStageResult] = useState<{
    scoreAwarded: number;
    timeBonus: number;
    baseXP: number;
    grossScore: number;
  } | null>(null);

  // ── 1. Load player on mount ───────────────────────────────────────────────
  useEffect(() => {
    async function loadPlayer() {
      try {
        const res = await fetch('/api/game/player');
        if (res.status === 401) {
          router.replace('/');
          return;
        }
        const data = await res.json();

        // Check if stage is locked
        const completed: number[] = data.completedStages ?? [];
        const isUnlocked =
          stageId === 1 || completed.includes(stageId - 1);

        if (!isUnlocked) {
          router.replace('/stage');
          return;
        }

        setPlayer({
          username: data.player.username,
          totalScore: data.player.total_score,
          completedStages: completed,
        });
      } catch {
        router.replace('/');
      } finally {
        setPlayerLoading(false);
      }
    }
    loadPlayer();
  }, [stageId, router]);

  // ── 2. Load or seed messages ──────────────────────────────────────
  // Hydration order:
  useEffect(() => {
    if (!stageConfig) return;

    if (typeof window !== 'undefined') {
      const savedMessages = sessionStorage.getItem(`stage-${stageId}-messages`);
      const savedTimerStarted = sessionStorage.getItem(`stage-${stageId}-timerStarted`);

      if (savedTimerStarted === 'true') {
        setTimerStarted(true);
      }

      if (savedMessages) {
        try {
          const parsed = JSON.parse(savedMessages);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setMessages(parsed);
            return;
          }
        } catch (e) {
          console.error('Failed to parse saved messages:', e);
        }
      }
    }

    // No sessionStorage hit — check the server for prior prompts.
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/game/stage-history?stage=${stageId}`, {
          cache: 'no-store',
        });
        if (!res.ok) throw new Error(`stage-history ${res.status}`);
        const data = (await res.json()) as { messages?: Message[] };
        if (cancelled) return;

        if (Array.isArray(data.messages) && data.messages.length > 0) {
          // Prepend the opening message so the conversation reads naturally.
          setMessages([
            {
              id: uid(),
              role: 'bot',
              content: openingMessage,
              timestamp: data.messages[0].timestamp - 1,
            },
            ...data.messages,
          ]);
          // The player already has prompts logged → timer is server-running.
          // Resume the displayed stopwatch from the first prompt's timestamp
          resumeTimer(data.messages[0].timestamp);
          setTimerStarted(true);
          return;
        }
      } catch (e) {
        console.error('Failed to rehydrate stage history from server:', e);
      }

      if (cancelled) return;
      setMessages([
        {
          id: uid(),
          role: 'bot',
          content: openingMessage,
          timestamp: Date.now(),
        },
      ]);
    })();

    return () => {
      cancelled = true;
    };
  }, [stageId, stageConfig, resumeTimer]);

  // Fetch opening message from DB (reflects admin panel changes)
  useEffect(() => {
    fetch(`/api/game/stage-config/${stageId}`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (data?.openingMessage) setOpeningMessage(data.openingMessage); })
      .catch(() => {});
  }, [stageId]);

  // Persist messages across reloads
  useEffect(() => {
    if (messages.length > 0 && typeof window !== 'undefined') {
      sessionStorage.setItem(`stage-${stageId}-messages`, JSON.stringify(messages));
    }
  }, [messages, stageId]);

  // Persist timer start state
  useEffect(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(`stage-${stageId}-timerStarted`, String(timerStarted));
    }
  }, [timerStarted, stageId]);

  // ── 3. Auto-scroll ────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── 4. Send message ───────────────────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isSending || isStageCompleted || codeExtracted) return;

    // Start timer on first message
    if (!timerStarted) {
      startTimer();
      setTimerStarted(true);
    }

    const userMsg: Message = {
      id: uid(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsSending(true);

    // Build history for API (exclude the seeded bot message from history)
    const history = messages
      .filter((m) => m.id !== messages[0]?.id || messages.length > 1)
      .filter((m) => !m.content.startsWith('💡'))
      .map((m) => ({
        role: m.role === 'bot' ? ('assistant' as const) : ('user' as const),
        content: m.content.split('\n\n🔑 System bypassed')[0].split('\n\n💡 Nice...')[0].trim(),
      }))
      .slice(-20);

    try {
      const res = await fetch('/api/game/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stageNumber: stageId,
          messages: history,
          userMessage: text,
        }),
      });

      const data = await parseJsonSafe(res);
      const errorText = typeof data.error === 'string' ? data.error : '';
      const retryable = typeof data.retryable === 'boolean' ? data.retryable : undefined;
      const directResponse = typeof data.response === 'string' ? data.response : '';
      const jobId =
        typeof data.jobId === 'string' || typeof data.jobId === 'number'
          ? String(data.jobId)
          : '';

      if (res.status === 429) {
        setMessages((prev) => [
          ...prev,
          {
            id: uid(),
            role: 'bot',
            content: '⚠️ Too many messages. Please wait a moment before sending again.',
            timestamp: Date.now(),
          },
        ]);
        return;
      }

      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          {
            id: uid(),
            role: 'bot',
            content: mapApiErrorToPlayerMessage(res.status, errorText, retryable),
            timestamp: Date.now(),
          },
        ]);
        return;
      }

      if (jobId) {
        const maxPollAttempts = 60;
        let polledResponse: string | null = null;
        const transientStatuses = new Set([429, 500, 502, 503, 504]);

        for (let attempt = 0; attempt < maxPollAttempts; attempt += 1) {
          const resultRes = await fetch(`/api/game/chat/result/${jobId}`, {
            method: 'GET',
            cache: 'no-store',
          });

          const resultData = await parseJsonSafe(resultRes);
          const status = typeof resultData.status === 'string' ? resultData.status : '';
          const responseText =
            typeof resultData.response === 'string' ? resultData.response : '';
          const errorText = typeof resultData.error === 'string' ? resultData.error : '';
          const retryable =
            typeof resultData.retryable === 'boolean' ? resultData.retryable : undefined;

          if (resultRes.ok && status === 'completed') {
            polledResponse = responseText || 'No response received.';
            break;
          }

          if (status === 'failed') {
            polledResponse = mapApiErrorToPlayerMessage(resultRes.status, errorText, retryable);
            break;
          }

          if (resultRes.status !== 202 && !transientStatuses.has(resultRes.status)) {
            polledResponse = mapApiErrorToPlayerMessage(resultRes.status, errorText, retryable);
            break;
          }

          // Retry transient errors while the queue or provider recovers.
          const pollDelayMs = Math.min(2200, 650 + attempt * 25);
          await new Promise((resolve) => setTimeout(resolve, pollDelayMs));
        }

        const botMsg: Message = {
          id: uid(),
          role: 'bot',
          content: polledResponse || 'AI is still thinking. Please send again in a moment.',
          timestamp: Date.now(),
        };

        setMessages((prev) => [...prev, botMsg]);
        return;
      }

      const botMsg: Message = {
        id: uid(),
        role: 'bot',
        content: directResponse || 'No response received.',
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: 'bot',
          content: 'Connection error. Please try again.',
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setIsSending(false);
      inputRef.current?.focus();
    }
  }, [input, isSending, isStageCompleted, codeExtracted, timerStarted, startTimer, messages, stageId]);

  // ── 5. Handle stage success ───────────────────────────────────────────────
  const handleCodeSuccess = useCallback(
    (scoreAwarded: number, timeBonus: number, baseXP: number, grossScore: number) => {
      stopTimer();
      setStageResult({ scoreAwarded, timeBonus, baseXP, grossScore });
      setShowStageComplete(true);

      // Update local player state
      setPlayer((prev) =>
        prev
          ? {
              ...prev,
              totalScore: prev.totalScore + scoreAwarded,
              completedStages: [...prev.completedStages, stageId],
            }
          : prev,
      );

      // Add completion message to chat
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: 'bot',
          content: `✅ ACCESS GRANTED. The code has been verified. Stage ${stageId} complete. Well done, challenger.`,
          timestamp: Date.now(),
        },
      ]);
    },
    [stopTimer, stageId],
  );

  // ── Loading state ─────────────────────────────────────────────────────────
  if (invalidStage || playerLoading || !player || !stageConfig) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-[#090C12] via-[#111522] to-[#1A0D10]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-[#D71920] border-t-transparent animate-spin" />
          <p className="text-sm text-gray-300 font-medium">Loading stage...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* ── Background ── */}
      <div className="fixed inset-0 z-0">
        <Image
          src="/images/background.jpg"
          alt="Background"
          fill
          sizes="100vw"
          priority
          className="object-cover"
          // Fallback gradient while image loads or if not set
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
        <div className="absolute inset-0 bg-black/55" />
      </div>

      {/* ── App Shell ── */}
      <div className="relative z-10 flex h-[100dvh] min-h-[100dvh] overflow-hidden">

        {/* ── Sidebar ── */}
        <Sidebar
          username={player.username}
          totalScore={player.totalScore}
          completedStages={player.completedStages}
          currentStage={stageId}
          isMobile={isMobile}
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((c) => !c)}
        />

        {/* ── Main content ── */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">

          {/* ── Top bar ── */}
          <header className="flex-shrink-0 flex flex-col items-start gap-2 px-3 pt-14 pb-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-6 sm:pt-5 sm:pb-4">
            {/* Stage title */}
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-wrap items-center gap-2 sm:gap-4"
            >
              {/* Title & subtitle */}
              <div className="min-w-0 px-2 py-1.5 sm:px-4 sm:py-3">
                <h1 className="text-base sm:text-2xl font-semibold text-gray-100 tracking-tight">
                  Stage {stageId}:{' '}
                  <span className="text-[#D71920] drop-shadow-[0_0_10px_rgba(215,25,32,0.2)]">{stageConfig.name}</span>
                </h1>
                <p className="text-xs text-gray-300/90 font-medium mt-1">
                  {stageConfig.subtitle}
                </p>
              </div>

              {/* XP badge */}
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#D71920]/18 border border-[#D71920]/45 backdrop-blur-sm">
                <Zap className="w-3 h-3 text-[#FFD4D6]" />
                <span className="text-xs font-bold text-[#FFE9EA]">
                  {stageConfig.baseXP} XP
                </span>
              </div>

              {/* Completed badge */}
              {isStageCompleted && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="w-full sm:w-auto flex justify-start"
                >
                  <div className="px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-300/35 backdrop-blur-sm">
                    <span className="text-xs font-semibold text-emerald-200">✓ Completed</span>
                  </div>
                </motion.div>
              )}
            </motion.div>

              {/* Timer */}
            <motion.div
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              className={cn(
                'flex items-center gap-2 px-2.5 py-1.5 sm:gap-2.5 sm:px-4 sm:py-2.5 rounded-2xl bg-white/10 backdrop-blur-md border shadow-[0_4px_18px_rgba(0,0,0,0.25)]',
                running ? 'border-[#D71920]/40' : 'border-white/20',
              )}
            >
              <Timer
                className={cn(
                  'w-4 h-4 flex-shrink-0',
                  running ? 'text-[#D71920] animate-pulse' : 'text-gray-300',
                )}
              />
              <span
                className={cn(
                  'font-mono font-bold text-base tabular-nums tracking-widest',
                  running ? 'text-gray-100' : 'text-gray-300',
                )}
              >
                {formatted}
              </span>
            </motion.div>
          </header>

          {/* ── Chat area ── */}
          <div className="flex-1 overflow-y-auto px-3 sm:px-6 pt-3 sm:pt-5 pb-2 space-y-3 sm:space-y-4 scroll-smooth">
            <AnimatePresence initial={false}>
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                  className={cn(
                    'flex',
                    msg.role === 'user' ? 'justify-end' : 'justify-start',
                  )}
                >
                  {/* Bot message */}
                  {msg.role === 'bot' && (
                    <div className="flex items-start gap-2.5 max-w-[88%] sm:max-w-[65%]">
                      {/* Bot avatar — DiceBear bottts style, matches user avatar style */}
                      <div className="relative flex-shrink-0 w-9 h-9 rounded-full overflow-hidden bg-white/15 ring-2 ring-white/30 mt-0.5">
                        <Image
                          src={`https://api.dicebear.com/9.x/bottts/svg?seed=stage-${stageId}&backgroundColor=b6e3f4,c0aede,d1d4f9`}
                          alt="AI Bot"
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-semibold text-gray-300 uppercase tracking-wider pl-1">
                          BOT
                        </span>
                        <div className="bg-white/10 backdrop-blur-md rounded-2xl rounded-tl-sm px-4 py-3 border border-white/25 shadow-[0_6px_20px_rgba(0,0,0,0.22)]">
                          <p className="text-sm text-gray-100 leading-relaxed whitespace-pre-wrap">
                            {msg.content}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* User message */}
                  {msg.role === 'user' && (
                    <div className="flex flex-col items-end gap-1 max-w-[84%] sm:max-w-[60%]">
                      <span className="text-[10px] font-semibold text-gray-300 uppercase tracking-wider pr-1">
                        YOU
                      </span>
                      <div
                        className="px-4 py-3 rounded-2xl rounded-tr-sm text-white text-sm leading-relaxed"
                        style={{
                          background: 'linear-gradient(135deg, #D71920, #A31318)',
                          boxShadow: '0 4px 16px rgba(215,25,32,0.35)',
                        }}
                      >
                        {msg.content}
                      </div>
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Typing indicator */}
            <AnimatePresence>
              {isSending && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  className="flex items-start gap-2.5"
                >
                  <div className="relative w-9 h-9 rounded-full overflow-hidden bg-white/15 ring-2 ring-white/30">
                    <Image
                      src={`https://api.dicebear.com/9.x/bottts/svg?seed=stage-${stageId}&backgroundColor=b6e3f4,c0aede,d1d4f9`}
                      alt="AI Bot"
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                  <div className="bg-white/10 backdrop-blur-md rounded-2xl rounded-tl-sm px-4 py-3 border border-white/25 flex items-center gap-1.5 h-10 shadow-[0_6px_20px_rgba(0,0,0,0.22)]">
                    {[0, 1, 2].map((i) => (
                      <motion.div
                        key={i}
                        className="w-1.5 h-1.5 rounded-full bg-gray-400"
                        animate={{ y: [0, -4, 0] }}
                        transition={{
                          duration: 0.6,
                          repeat: Infinity,
                          delay: i * 0.15,
                          ease: 'easeInOut',
                        }}
                      />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div ref={messagesEndRef} />
          </div>

          {/* ── Quick Tools + Input ── */}
          <div className="flex-shrink-0 px-3 sm:px-6 pb-3 sm:pb-4 pt-2">
            {/* Quick tools */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="text-[10px] font-bold text-gray-300 uppercase tracking-widest mr-1">
                Quick Tools
              </span>

              <QuickToolButton
                icon={<HelpCircle className="w-3.5 h-3.5" />}
                label="How to play?"
                onClick={() => setShowHowToPlay(true)}
              />

              <QuickToolButton
                icon={<KeyRound className="w-3.5 h-3.5" />}
                label="Enter the code"
                onClick={() => setShowEnterCode(true)}
                disabled={isStageCompleted}
              />
            </div>

            {/* Input box */}
            <div
              className={cn(
                'bg-white/10 backdrop-blur-xl rounded-2xl border shadow-[0_10px_30px_rgba(0,0,0,0.25)] transition-all duration-150',
                isStageCompleted || codeExtracted
                  ? 'bg-white/8 border-white/15 shadow-[0_6px_18px_rgba(0,0,0,0.2)]'
                  : 'border-white/20 focus-within:border-[#D71920]/50 focus-within:shadow-[0_10px_30px_rgba(0,0,0,0.25)]',
              )}
            >
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder={
                  isStageCompleted
                    ? 'Stage completed — move to the next challenge!'
                    : codeExtracted
                    ? 'Code extracted — enter it above to complete the stage!'
                    : 'Send a prompt…'
                }
                disabled={isStageCompleted || codeExtracted || isSending}
                rows={2}
                className={cn(
                  'w-full px-4 pt-3 pb-1 bg-transparent resize-none text-base sm:text-sm outline-none leading-relaxed',
                  isStageCompleted || codeExtracted
                    ? 'text-gray-400 placeholder:text-gray-500/90 cursor-not-allowed'
                    : 'text-gray-100 placeholder:text-gray-400',
                )}
              />
              <div className="flex items-center justify-end px-3 pb-3">
                <motion.button
                  onClick={sendMessage}
                  disabled={!input.trim() || isSending || isStageCompleted || codeExtracted}
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all duration-150',
                    input.trim() && !isSending && !isStageCompleted && !codeExtracted
                      ? 'bg-[#D71920] hover:bg-[#B1141A]'
                      : 'bg-gray-300 text-gray-500 border border-gray-300 cursor-not-allowed',
                  )}
                  style={
                    input.trim() && !isSending && !codeExtracted
                      ? { boxShadow: '0 6px 18px rgba(215,25,32,0.35)' }
                      : {}
                  }
                >
                  Send
                  <Send className="w-3.5 h-3.5" />
                </motion.button>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* ── Modals ── */}
      <EnterCodeModal
        isOpen={showEnterCode}
        onClose={() => setShowEnterCode(false)}
        stageNumber={stageId}
        onSuccess={handleCodeSuccess}
      />

      <HowToPlayModal
        isOpen={showHowToPlay}
        onClose={() => setShowHowToPlay(false)}
        stageName={`Stage ${stageId}: ${stageConfig.name}`}
      />

      <StageCompleteModal
        isOpen={showStageComplete}
        stageNumber={stageId}
        baseXP={stageResult?.baseXP ?? stageConfig.baseXP}
        timeBonus={stageResult?.timeBonus ?? 0}
        grossScore={stageResult?.grossScore ?? stageConfig.baseXP}
        totalAwarded={stageResult?.scoreAwarded ?? stageConfig.baseXP}
        elapsedSeconds={elapsed}
        isLastStage={stageId === 5}
        onNextStage={() => {
          setShowStageComplete(false);
          router.push(`/stage/${stageId + 1}`);
        }}
        onViewLeaderboard={() => {
          setShowStageComplete(false);
          router.push('/leaderboard');
        }}
      />
    </>
  );
}

// ─── QuickToolButton ──────────────────────────────────────────────────────────

function QuickToolButton({
  icon,
  label,
  onClick,
  disabled = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      whileHover={!disabled ? { scale: 1.03 } : {}}
      whileTap={!disabled ? { scale: 0.97 } : {}}
      className={cn(
        'flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all duration-150',
        disabled
          ? 'bg-white/10 border-white/20 text-gray-300 cursor-not-allowed shadow-[0_3px_10px_rgba(0,0,0,0.18)]'
          : 'border-[#D71920]/50 text-[#FFD4D6] bg-[#D71920]/12 hover:bg-[#D71920]/24 hover:border-[#D71920]/70',
      )}
    >
      {icon}
      {label}
    </motion.button>
  );
}