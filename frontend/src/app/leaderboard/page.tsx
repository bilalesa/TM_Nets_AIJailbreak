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
import type { SupabaseClient } from '@supabase/supabase-js';
import { cn } from '@/lib/utils';
import Sidebar from '@/components/game/Sidebar';
import { getSupabaseBrowserClient } from '@/lib/supabaseClient';

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

// ── Utils ──────────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(' : ');
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

  // ── States ────────────────────────────────────────────────────────────────
  const [supabaseClient, setSupabaseClient] = useState<SupabaseClient | null>(null);
  const [currentPlayerId, setCurrentPlayerId] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [currentPlayer, setCurrentPlayer] = useState<CurrentPlayer | null>(null);
  const [totalPlayers, setTotalPlayers] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarPlayer, setSidebarPlayer] = useState<PlayerState | null>(null);

  // ── Initialize Supabase browser client ─────────────────────────────────────
  useEffect(() => {
    try {
      setSupabaseClient(getSupabaseBrowserClient());
    } catch (err) {
      console.error('Supabase init failed:', err);
    }
  }, []);

  // ── Track viewport for sidebar ─────────────────────────────────────────────
  useEffect(() => {
    const updateViewport = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) setSidebarCollapsed(true);
    };
    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  // ── Load current player profile (also gives us the id for highlighting) ───
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/game/player');
        if (res.status === 401) {
          router.replace('/');
          return;
        }
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setCurrentPlayerId(data.player.id);
        setSidebarPlayer({
          username: data.player.username,
          totalScore: data.player.total_score,
          completedStages: data.completedStages ?? [],
        });
      } catch (err) {
        console.error('[leaderboard /api/game/player]', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  // ── Fetch leaderboard directly from Supabase ──────────────────────────────
  const fetchLeaderboard = useCallback(
    async (silent = false) => {
      if (!supabaseClient) return;
      if (!silent) setIsRefreshing(true);
      try {
        const { data: players, error: playersError } = await supabaseClient
          .from('players')
          .select('id, username, total_score')
          .eq('session_active', true)
          .eq('is_banned', false)
          .order('total_score', { ascending: false });

        if (playersError) throw playersError;

        if (!players || players.length === 0) {
          setLeaderboard([]);
          setCurrentPlayer(null);
          setTotalPlayers(0);
          return;
        }

        const playerIds = players.map((p) => p.id);
        const { data: completions, error: completionsError } = await supabaseClient
          .from('stage_completions')
          .select('player_id, time_taken_seconds')
          .in('player_id', playerIds);

        if (completionsError) throw completionsError;

        const completionMap = new Map<
          string,
          { stagesPassed: number; totalSeconds: number }
        >();
        for (const c of completions ?? []) {
          const existing = completionMap.get(c.player_id) ?? {
            stagesPassed: 0,
            totalSeconds: 0,
          };
          completionMap.set(c.player_id, {
            stagesPassed: existing.stagesPassed + 1,
            totalSeconds: existing.totalSeconds + c.time_taken_seconds,
          });
        }

        const ranked = players
          .map((p) => {
            const agg = completionMap.get(p.id) ?? {
              stagesPassed: 0,
              totalSeconds: 0,
            };
            return {
              id: p.id,
              username: p.username,
              totalScore: p.total_score,
              stagesPassed: agg.stagesPassed,
              totalSeconds: agg.totalSeconds,
              totalTimeFormatted: formatTime(agg.totalSeconds),
              isCurrentPlayer: p.id === currentPlayerId,
            };
          })
          .sort((a, b) => {
            if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
            return a.totalSeconds - b.totalSeconds;
          })
          .map((p, i) => ({ ...p, rank: i + 1 }));

        setLeaderboard(ranked);
        setTotalPlayers(ranked.length);

        const me = ranked.find((p) => p.isCurrentPlayer) ?? null;
        setCurrentPlayer(
          me
            ? {
                id: me.id,
                username: me.username,
                totalScore: me.totalScore,
                stagesPassed: me.stagesPassed,
                totalTimeFormatted: me.totalTimeFormatted,
                rank: me.rank,
              }
            : null,
        );
      } catch (err) {
        console.error('[leaderboard fetch]', err);
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    },
    [supabaseClient, currentPlayerId],
  );

  // ── Real-time subscription + initial fetch ────────────────────────────────
  useEffect(() => {
    if (!supabaseClient) return;

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
  }, [fetchLeaderboard, supabaseClient]);

  // ── Fallback if client not ready ──────────────────────────────────────────
  if (!supabaseClient || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-[#090C12] via-[#111522] to-[#1A0D10]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-[#D71920] border-t-transparent animate-spin" />
          <p className="text-sm text-gray-300 font-medium">Loading leaderboard...</p>
        </div>
      </div>
    );
  }

  // ── Main render ──────────────────────────────────────────────────────────
  return (
    <>
      {/* Background */}
      <div className="fixed inset-0 z-0">
        <Image
          src="/images/background.jpg"
          alt=""
          fill
          className="object-cover"
          onError={(e) =>
            ((e.target as HTMLImageElement).style.display = 'none')
          }
        />
        <div className="absolute inset-0 bg-black/55" />
      </div>

      <div className="relative z-10 flex h-[100dvh] overflow-hidden">
        {/* Sidebar */}
        {sidebarPlayer && (
          <Sidebar
            username={sidebarPlayer.username}
            totalScore={sidebarPlayer.totalScore}
            completedStages={sidebarPlayer.completedStages}
            currentStage={-1}
            isMobile={isMobile}
            collapsed={sidebarCollapsed}
            onToggle={() => setSidebarCollapsed((c) => !c)}
          />
        )}

        {/* Main content */}
        <main className="flex-1 flex flex-col min-w-0 h-full p-4 sm:p-6 lg:p-8">
          {/* ── Hero stats cards ── */}
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="flex-shrink-0 grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6"
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
                {/* Dark overlay */}
                <div className="absolute inset-0 bg-black/30" />
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

            {/* Timer card */}
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
                {/* Dark overlay */}
                <div className="absolute inset-0 bg-black/30" />
              </div>

              <div className="relative z-10 flex items-center justify-center h-full px-6 py-5">
                <div className="flex items-center justify-center gap-5 text-center">
                  <Timer className="w-14 h-14 text-white" strokeWidth={1.9} />
                  <div className="flex flex-col items-center justify-center text-center">
                    <span className="text-white/80 font-bold text-xs tracking-widest uppercase">
                      Your Total Time
                    </span>
                    <p className="font-black text-white text-3xl sm:text-4xl tracking-widest tabular-nums leading-none mt-1">
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
            className="flex-1 flex flex-col min-h-0 bg-slate-900/45 backdrop-blur-xl rounded-2xl border border-white/15 overflow-hidden shadow-[0_12px_32px_rgba(0,0,0,0.35)]"
          >
            {/* Table header bar */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/15">
              <div className="flex items-center gap-2.5">
                <Trophy className="w-5 h-5 text-[#D71920]" />
                <h2 className="font-semibold text-gray-100 text-lg tracking-tight">
                  Leaderboard
                </h2>
              </div>
              <div className="flex items-center gap-3">
                {/* Live refresh indicator */}
                <motion.button
                  onClick={() => fetchLeaderboard(false)}
                  whileTap={{ scale: 0.92 }}
                  className="flex items-center gap-1.5 text-xs text-gray-300 hover:text-white transition-colors"
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
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#D71920]/22 border border-[#D71920]/45 backdrop-blur-sm">
                  <Users className="w-3.5 h-3.5 text-[#FFE9EA]" />
                  <span className="text-xs font-bold text-[#FFE9EA]">
                    {totalPlayers} PLAYERS
                  </span>
                </div>
              </div>
            </div>

            {/* Column headers */}
            <div className="grid grid-cols-4 px-3 sm:px-6 py-3 bg-white/8 border-b border-white/15">
              {['RANK', 'USERNAME', 'SCORE', 'COMPLETION TIME'].map((col) => (
                <span
                  key={col}
                  className={cn(
                    'px-1 text-[10px] sm:text-[11px] font-bold text-gray-400 tracking-widest uppercase',
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
            <div className="flex-1 overflow-y-auto divide-y divide-white/10">
              <AnimatePresence initial={false}>
                {leaderboard.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-gray-300 gap-2">
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
                        !entry.isCurrentPlayer && 'hover:bg-white/8',
                      )}
                    >
                      {/* Rank */}
                      <div className="px-1 text-white">
                        <RankBadge rank={entry.rank} />
                      </div>

                      {/* Username */}
                      <span className="px-1 text-sm font-medium truncate text-white">
                        {entry.username}
                      </span>

                      {/* Score */}
                      <span className="px-1 text-sm font-semibold tabular-nums text-white">
                        {entry.totalScore.toLocaleString()}
                      </span>

                      {/* Time */}
                      <span className="px-1 text-[11px] sm:text-sm leading-tight font-mono tabular-nums whitespace-nowrap text-white">
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

// ── Stat sub-component ───────────────────────────────────────────────────────
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
          large ? 'text-3xl sm:text-4xl' : 'text-xl'
        )}
      >
        {value}
      </span>
    </div>
  );
}
