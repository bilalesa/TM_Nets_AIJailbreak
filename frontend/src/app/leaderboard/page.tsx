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

  // ── States ────────────────────────────────────────────────────────────────
  const [supabaseClient, setSupabaseClient] = useState<any>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [currentPlayer, setCurrentPlayer] = useState<CurrentPlayer | null>(null);
  const [totalPlayers, setTotalPlayers] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarPlayer, setSidebarPlayer] = useState<PlayerState | null>(null);

  // ── Initialize Supabase client safely in browser ──────────────────────────
  useEffect(() => {
    try {
      const client = getSupabaseBrowserClient();
      setSupabaseClient(client);
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

  // ── Fetch leaderboard ──────────────────────────────────────────────────────
  const fetchLeaderboard = useCallback(
    async (silent = false) => {
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
    },
    [router]
  );

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

  // ── Real-time subscription ────────────────────────────────────────────────
  useEffect(() => {
    if (!supabaseClient) return; // wait until client initialized

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
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-50 to-red-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-[#C0392B] border-t-transparent animate-spin" />
          <p className="text-sm text-gray-500 font-medium">Loading leaderboard…</p>
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
            currentStage={-1}
            isMobile={isMobile}
            collapsed={sidebarCollapsed}
            onToggle={() => setSidebarCollapsed((c) => !c)}
          />
        )}

        {/* Main content */}
        <main className="flex-1 flex flex-col min-w-0 px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
          {/* … hero stats + leaderboard table … */}
          {/* Keep your existing motion.divs, table rendering, RankBadge, Stat, etc. */}
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