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
import type { SupabaseClient } from '@supabase/supabase-js';

// ❌ REMOVE THIS (important)
// const supabaseClient = getSupabaseBrowserClient();

export default function LeaderboardPage() {
  const router = useRouter();

  const [supabaseClient, setSupabaseClient] = useState<SupabaseClient | null>(null);

  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [currentPlayer, setCurrentPlayer] = useState<any>(null);
  const [totalPlayers, setTotalPlayers] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // ✅ DEBUG ENV HERE
  useEffect(() => {
    console.log("ENV:", process.env.NEXT_PUBLIC_SUPABASE_URL);

    try {
      const client = getSupabaseBrowserClient();
      setSupabaseClient(client);
    } catch (err) {
      console.error("Supabase init failed:", err);
    }
  }, []);

  // ── Fetch leaderboard ─────────────────────────────────────
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

  // ── Initial load + realtime ───────────────────────────────
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

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <h1>Leaderboard Loaded</h1>
    </div>
  );
}