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
import { STAGE_CONFIGS } from '@/lib/stageConfig';
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
  const stageConfig = STAGE_CONFIGS[stageId - 1];
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
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [timerStarted, setTimerStarted] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ── Stopwatch ─────────────────────────────────────────────────────────────
  const { elapsed, formatted, running, start: startTimer, stop: stopTimer } =
    useStopwatch(false, `stage-${stageId}-timer`);
  // Redirect invalid stage ids after hooks are initialized.
  useEffect(() => {
    if (invalidStage) {
      router.replace('/dashboard');
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
  } | null>(null);

  // ── Stage already completed? ──────────────────────────────────────────────
  const isStageCompleted = player?.completedStages.includes(stageId) ?? false;

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
          router.replace('/dashboard');
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

    // Seed opening message if no saved messages or parsing failed
    setMessages([
      {
        id: uid(),
        role: 'bot',
        content: stageConfig.openingMessage,
        timestamp: Date.now(),
      },
    ]);
  }, [stageId, stageConfig]);

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
    if (!text || isSending || isStageCompleted) return;

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
      .map((m) => ({
        role: m.role === 'bot' ? ('assistant' as const) : ('user' as const),
        content: m.content,
      }));

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

      const data = await res.json();

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

      const botMsg: Message = {
        id: uid(),
        role: 'bot',
        content: data.response || 'No response received.',
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
  }, [input, isSending, isStageCompleted, timerStarted, startTimer, messages, stageId]);

  // ── 5. Handle stage success ───────────────────────────────────────────────
  const handleCodeSuccess = useCallback(
    (scoreAwarded: number, timeBonus: number, baseXP: number) => {
      stopTimer();
      setStageResult({ scoreAwarded, timeBonus, baseXP });
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

  // ── Handle hint click ─────────────────────────────────────────────────────
  const handleHint = () => {
    if (!stageConfig) return;
    const hint = stageConfig.hint;
    setMessages((prev) => [
      ...prev,
      {
        id: uid(),
        role: 'bot',
        content: `💡 Hint: ${hint}`,
        timestamp: Date.now(),
      },
    ]);
  };

  // ── Loading state ─────────────────────────────────────────────────────────
  if (invalidStage || playerLoading || !player || !stageConfig) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-50 to-red-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-[#C0392B] border-t-transparent animate-spin" />
          <p className="text-sm text-gray-500 font-medium">Loading stage…</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* ── Background ── */}
      <div className="fixed inset-0 z-0">
        <Image
          src="/images/bg.jpg"
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
                <h1 className="text-base sm:text-2xl font-semibold text-gray-900 tracking-tight">
                  Stage {stageId}:{' '}
                  <span className="text-[#C0392B]">{stageConfig.name}</span>
                </h1>
                <p className="text-xs text-gray-400 font-medium mt-1">
                  {stageConfig.subtitle}
                </p>
              </div>

              {/* XP badge */}
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#FDECEA] border border-[#C0392B]/15">
                <Zap className="w-3 h-3 text-[#C0392B]" />
                <span className="text-xs font-bold text-[#C0392B]">
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
                  <div className="px-2.5 py-1 rounded-full bg-emerald-50/70 border border-emerald-700/25">
                    <span className="text-xs font-semibold text-emerald-700">✓ Completed</span>
                  </div>
                </motion.div>
              )}
            </motion.div>

              {/* Timer */}
            <motion.div
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              className={cn(
                'flex items-center gap-2 px-2.5 py-1.5 sm:gap-2.5 sm:px-4 sm:py-2.5 rounded-2xl bg-white/45 backdrop-blur-sm border shadow-[0_1px_3px_rgba(0,0,0,0.05)]',
                running ? 'border-[#C0392B]/20' : 'border-gray-100',
              )}
            >
              <Timer
                className={cn(
                  'w-4 h-4 flex-shrink-0',
                  running ? 'text-[#C0392B] animate-pulse' : 'text-gray-400',
                )}
              />
              <span
                className={cn(
                  'font-mono font-bold text-base tabular-nums tracking-widest',
                  running ? 'text-gray-800' : 'text-gray-400',
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
                      <div className="relative flex-shrink-0 w-9 h-9 rounded-full overflow-hidden bg-[#EEF2FF] ring-2 ring-indigo-100 mt-0.5">
                        <Image
                          src={`https://api.dicebear.com/9.x/bottts/svg?seed=stage-${stageId}&backgroundColor=b6e3f4,c0aede,d1d4f9`}
                          alt="AI Bot"
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider pl-1">
                          BOT
                        </span>
                        <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-3 border border-gray-100/80">
                          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                            {msg.content}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* User message */}
                  {msg.role === 'user' && (
                    <div className="flex flex-col items-end gap-1 max-w-[84%] sm:max-w-[60%]">
                      <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider pr-1">
                        YOU
                      </span>
                      <div
                        className="px-4 py-3 rounded-2xl rounded-tr-sm text-white text-sm leading-relaxed"
                        style={{
                          background: 'linear-gradient(135deg, #C0392B, #922B21)',
                          boxShadow: '0 1px 6px rgba(192,57,43,0.15)',
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
                  <div className="relative w-9 h-9 rounded-full overflow-hidden bg-[#EEF2FF] ring-2 ring-indigo-100">
                    <Image
                      src={`https://api.dicebear.com/9.x/bottts/svg?seed=stage-${stageId}&backgroundColor=b6e3f4,c0aede,d1d4f9`}
                      alt="AI Bot"
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                  <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm border border-gray-100 flex items-center gap-1.5 h-10">
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
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mr-1">
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

              <QuickToolButton
                icon={<Lightbulb className="w-3.5 h-3.5" />}
                label="Give me a hint"
                onClick={handleHint}
                disabled={isStageCompleted}
              />
            </div>

            {/* Input box */}
            <div
              className={cn(
                'bg-white rounded-2xl border shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all duration-150',
                isStageCompleted
                  ? 'bg-white/75 border-gray-200 shadow-[0_1px_2px_rgba(0,0,0,0.04)]'
                  : 'border-gray-200/90 focus-within:border-[#C0392B]/20 focus-within:shadow-[0_1px_4px_rgba(0,0,0,0.05)]',
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
                    : 'Send a prompt…'
                }
                disabled={isStageCompleted || isSending}
                rows={2}
                className={cn(
                  'w-full px-4 pt-3 pb-1 bg-transparent resize-none text-base sm:text-sm outline-none leading-relaxed',
                  isStageCompleted
                    ? 'text-gray-500 placeholder:text-gray-400/90 cursor-not-allowed'
                    : 'text-gray-700 placeholder:text-gray-300',
                )}
              />
              <div className="flex items-center justify-end px-3 pb-3">
                <motion.button
                  onClick={sendMessage}
                  disabled={!input.trim() || isSending || isStageCompleted}
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all duration-150',
                    input.trim() && !isSending && !isStageCompleted
                      ? 'bg-[#C0392B] hover:bg-[#922B21]'
                      : 'bg-gray-300 text-gray-500 border border-gray-300 cursor-not-allowed',
                  )}
                  style={
                    input.trim() && !isSending
                      ? { boxShadow: '0 2px 6px rgba(192,57,43,0.10)' }
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
        elapsedSeconds={elapsed}

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
          ? 'bg-white/75 border-gray-300 text-gray-500 cursor-not-allowed shadow-[0_1px_2px_rgba(0,0,0,0.03)]'
          : 'border-[#C0392B]/40 text-[#C0392B] hover:bg-[#FDECEA] hover:border-[#C0392B]/60',
      )}
    >
      {icon}
      {label}
    </motion.button>
  );
}