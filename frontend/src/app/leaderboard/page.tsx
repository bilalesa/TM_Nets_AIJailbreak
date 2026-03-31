'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Crown,
  Medal,
  Trophy,
  Users,
  Timer,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import Sidebar from '@/components/game/Sidebar';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';

const supabaseClient = getSupabaseBrowserClient();
// ── Types ──────────────────────────────────────────────────────────────────────

interface LeaderboardEntry {
  id: string;
  username: string;
  totalScore: number;
  stagesPassed: number;
  totalSeconds: number;
  totalTimeFormatted: string;
  isCurrentPlayer: boolean;
  rank: number;
}

interface CurrentPlayer {
  id: string;
  username: string;
  totalScore: number;
  stagesPassed: number;
  totalTimeFormatted: string;
  rank: number;
}

interface PlayerState {
  username: string;
  totalScore: number;
  completedStages: number[];
}

// ── Rank decorators ────────────────────────────────────────────────────────────

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <span className="inline-flex items-center justify-center">
        <Crown className="w-4 h-4 text-yellow-500 mr-1" />
        <span className="font-black text-yellow-600 text-sm">01</span>
      </span>
    );
  }

  if (rank === 2) {
    return (
      <span className="inline-flex items-center justify-center">
        <Medal className="w-4 h-4 text-slate-400 mr-1" />
        <span className="font-black text-slate-500 text-sm">02</span>
      </span>
    );
  }

  if (rank === 3) {
    return (
      <span className="inline-flex items-center justify-center">
        <Medal className="w-4 h-4 text-amber-600 mr-1" />
        <span className="font-black text-amber-700 text-sm">03</span>
      </span>
    );
  }

  return (
    <span className="font-semibold text-sm tabular-nums">
      {String(rank).padStart(2, '0')}
    </span>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function LeaderboardPage() {
  const router = useRouter();

  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [currentPlayer, setCurrentPlayer] = useState<CurrentPlayer | null>(null);
  const [totalPlayers, setTotalPlayers] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Sidebar player state
  const [sidebarPlayer, setSidebarPlayer] = useState<PlayerState | null>(null);

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

  // To be removed after verifying that env vars are correctly loaded in production (since the leaderboard won't load without them)
  useEffect(() => {
    if (process.env.NODE_ENV) {
      console.log('Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
    }
  }, []);

  // ── Fetch leaderboard ──────────────────────────────────────────────────────
  const fetchLeaderboard = useCallback(async (silent = false) => {
      if (!silent) setIsRefreshing(true);
      try {
        const res = await fetch('/api/game/leaderboard');
        if (res.status === 401) {
          router.replace('/');
          return;
        }
        const data = await res.json();
        setLeaderboard(data.leaderboard ?? []);
        setCurrentPlayer(data.currentPlayer ?? null);
        setTotalPlayers(data.totalPlayers ?? 0);
      } catch (err) {
        console.error('[leaderboard fetch]', err);
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    }, [router]);

  // ── Fetch sidebar player info ──────────────────────────────────────────────
  useEffect(() => {
    async function loadSidebarPlayer() {
      try {
        const res = await fetch('/api/game/player');
        if (!res.ok) return;
        const data = await res.json();
        setSidebarPlayer({
          username: data.player.username,
          totalScore: data.player.total_score,
          completedStages: data.completedStages ?? [],
        });
      } catch {}
    }
    loadSidebarPlayer();
  }, []);

  // ── Initial load + polling ─────────────────────────────────────────────────
  useEffect(() => {
    fetchLeaderboard(false);
 
    const channel = supabaseClient
      .channel('leaderboard-updates')
      .on('broadcast', { event: 'score_updated' }, () => {
        fetchLeaderboard(true);
      })
      .on('broadcast', { event: 'player_joined' }, () => {
        fetchLeaderboard(true);
      })
      .subscribe();
 
    return () => {
      supabaseClient.removeChannel(channel);
    };
  }, [fetchLeaderboard]);

  // ── Skeleton rows ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-50 to-red-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-[#C0392B] border-t-transparent animate-spin" />
          <p className="text-sm text-gray-500 font-medium">Loading leaderboard…</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Background */}
      <div className="fixed inset-0 z-0">
        <Image
          src="/images/bg.jpg"
          alt=""
          fill
          className="object-cover"
          onError={(e) =>
            ((e.target as HTMLImageElement).style.display = 'none')
          }
        />
      </div>

      <div className="relative z-10 flex min-h-[100dvh] overflow-x-hidden">

        {/* Sidebar */}
        {sidebarPlayer && (
          <Sidebar
            username={sidebarPlayer.username}
            totalScore={sidebarPlayer.totalScore}
            completedStages={sidebarPlayer.completedStages}
            currentStage={-1} // no active stage on leaderboard
            isMobile={isMobile}
            collapsed={sidebarCollapsed}
            onToggle={() => setSidebarCollapsed((c) => !c)}
          />
        )}

        {/* Main */}
        <main className="flex-1 flex flex-col min-w-0 px-4 py-6 sm:px-6 sm:py-8 lg:px-10">

          {/* ── Hero stats cards ── */}
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6"
          >
            {/* Stats card (red) */}
            <div className="relative w-full min-h-[140px] rounded-[20px] overflow-hidden isolate">
              <div className="absolute inset-0 rounded-[20px] overflow-hidden">
                <Image
                  src="/images/rank-bg.svg"
                  alt=""
                  fill
                  loading="eager"
                  className="object-cover"
                  onError={(e) =>
                    ((e.target as HTMLImageElement).style.display = 'none')
                  }
                />
              </div>

              <div className="relative z-10 flex items-center justify-around h-full px-6 py-5">
                <Stat
                  label="RANK"
                  value={currentPlayer ? `#${String(currentPlayer.rank).padStart(2, '0')}` : '—'}
                  large
                />
                <div className="h-12 w-px bg-white/20" />
                <Stat
                  label="STAGES PASSED"
                  value={currentPlayer ? `${currentPlayer.stagesPassed}/5` : '—'}
                  large
                />
                <div className="h-12 w-px bg-white/20" />
                <Stat
                  label="POINTS SCORED"
                  value={currentPlayer ? `${currentPlayer.totalScore} XP` : '—'}
                  large
                />
              </div>
            </div>

            <div className="relative w-full min-h-[140px] rounded-[20px] overflow-hidden isolate">
              <div className="absolute inset-0 rounded-[20px] overflow-hidden">
                <Image
                  src="/images/timer-bg.svg"
                  alt=""
                  fill
                  className="object-cover"
                  onError={(e) =>
                    ((e.target as HTMLImageElement).style.display = 'none')
                  }
                />
              </div>

              <div className="relative z-10 flex items-center justify-center h-full px-6 py-5">
                <div className="flex items-center justify-center gap-5 text-center">
                  <Timer className="w-14 h-14 text-[#1D4ED8]" strokeWidth={1.9} />
                  <div className="flex flex-col items-center justify-center text-center">
                  <span className="text-[#1D4ED8] font-bold text-xs tracking-widest uppercase">
                    Your Total Time
                  </span>
                  <p className="font-black text-[#1D4ED8] text-3xl sm:text-4xl tracking-widest tabular-nums leading-none mt-1">
                    {currentPlayer?.totalTimeFormatted ?? '— : — : —'}
                  </p>
                </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* ── Leaderboard table ── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-100 overflow-hidden shadow-[0_2px_16px_rgba(0,0,0,0.05)]"
          >
            {/* Table header bar */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <Trophy className="w-5 h-5 text-[#C0392B]" />
                <h2 className="font-semibold text-gray-900 text-lg tracking-tight">
                  Leaderboard
                </h2>
              </div>
              <div className="flex items-center gap-3">
                {/* Live refresh indicator */}
                <motion.button
                  onClick={() => fetchLeaderboard(false)}
                  whileTap={{ scale: 0.92 }}
                  className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                  title="Refresh now"
                >
                  <RefreshCw
                    className={cn(
                      'w-3.5 h-3.5',
                      isRefreshing && 'animate-spin',
                    )}
                  />
                </motion.button>

                {/* Player count */}
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#FDECEA] border border-[#C0392B]/15">
                  <Users className="w-3.5 h-3.5 text-[#C0392B]" />
                  <span className="text-xs font-bold text-[#C0392B]">
                    {totalPlayers} PLAYERS
                  </span>
                </div>
              </div>
            </div>

            {/* Column headers */}
            <div className="grid grid-cols-4 px-3 sm:px-6 py-3 bg-gray-50/70 border-b border-gray-100">
              {['RANK', 'USERNAME', 'SCORE', 'COMPLETION TIME'].map((col) => (
                <span
                  key={col}
                  className={cn(
                    'px-1 text-[10px] sm:text-[11px] font-bold text-[#C0392B] tracking-widest uppercase',
                    col === 'COMPLETION TIME' ? 'leading-tight whitespace-normal sm:whitespace-nowrap' : 'whitespace-nowrap',
                  )}
                >
                  {col === 'COMPLETION TIME' ? (
                    <>
                      <span className="sm:hidden">Completion<br />Time</span>
                      <span className="hidden sm:inline">{col}</span>
                    </>
                  ) : (
                    col
                  )}
                </span>
              ))}
            </div>

            {/* Rows */}
            <div className="divide-y divide-gray-50">
              <AnimatePresence initial={false}>
                {leaderboard.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
                    <Trophy className="w-10 h-10 opacity-20" />
                    <p className="text-sm font-medium">No players yet. Be the first!</p>
                  </div>
                ) : (
                  leaderboard.map((entry, index) => (
                    <motion.div
                      key={entry.id}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{
                        duration: 0.35,
                        delay: index * 0.04,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                      className={cn(
                        'grid grid-cols-4 px-3 sm:px-6 py-4 items-center transition-colors',
                        !entry.isCurrentPlayer && 'hover:bg-gray-50/50',
                      )}
                    >
                      {/* Rank */}
                      <div
                        className={cn(
                          'px-1',
                          entry.isCurrentPlayer ? 'text-[#C0392B]' : 'text-gray-500',
                        )}
                      >
                        <RankBadge rank={entry.rank} />
                      </div>

                      {/* Username */}
                      <span
                        className={cn(
                          'px-1 text-sm font-medium truncate',
                          entry.isCurrentPlayer
                            ? 'text-[#C0392B] font-semibold'
                            : 'text-gray-700',
                        )}
                      >
                        {entry.username}
                      </span>

                      {/* Score */}
                      <span
                        className={cn(
                          'px-1 text-sm font-semibold tabular-nums',
                          entry.isCurrentPlayer ? 'text-[#C0392B]' : 'text-gray-700',
                        )}
                      >
                        {entry.totalScore.toLocaleString()}
                      </span>

                      {/* Time */}
                      <span
                        className={cn(
                          'px-1 text-[11px] sm:text-sm leading-tight font-mono tabular-nums whitespace-nowrap',
                          entry.isCurrentPlayer ? 'text-[#C0392B]' : 'text-gray-500',
                        )}
                      >
                        {entry.stagesPassed > 0
                          ? entry.totalTimeFormatted
                          : '—'}
                      </span>
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </main>
      </div>
    </>
  );
}

// ── Stat sub-component for hero card ──────────────────────────────────────────

function Stat({
  label,
  value,
  large = false,
}: {
  label: string;
  value: string;
  large?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <span className="text-white/60 text-[10px] font-bold tracking-widest uppercase">
        {label}
      </span>
      <span
        className={cn(
          'font-black text-white leading-tight',
          large ? 'text-3xl sm:text-4xl' : 'text-xl',
        )}
      >
        {value}
      </span>
    </div>
  );
}