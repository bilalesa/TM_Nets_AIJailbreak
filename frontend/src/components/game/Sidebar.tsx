'use client';

import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import {
  Lock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Trophy,
  LogOut,
  Swords,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { STAGE_CONFIGS } from '@/lib/stageConfig';
import { getAvatarUrl } from '@/lib/avatar';
import { useState } from 'react';
import ExitModal from './ExitModal';

interface SidebarProps {
  username: string;
  totalScore: number;
  completedStages: number[];
  currentStage: number;
  isMobile: boolean;
  collapsed: boolean;
  onToggle: () => void;
}

export default function Sidebar({
  username,
  totalScore,
  completedStages,
  currentStage,
  isMobile,
  collapsed,
  onToggle,
}: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [showExitModal, setShowExitModal] = useState(false);
  const avatarUrl = getAvatarUrl(username);

  const isLeaderboard = pathname === '/leaderboard';

  const getStageStatus = (stageNum: number) => {
    if (completedStages.includes(stageNum)) return 'completed';
    if (stageNum === 1) return 'unlocked';
    if (completedStages.includes(stageNum - 1)) return 'unlocked';
    return 'locked';
  };

  return (
    <>
      {/* Mobile backdrop */}
      {isMobile && !collapsed && (
        <button
          aria-label="Close sidebar backdrop"
          onClick={onToggle}
          className="fixed inset-0 z-40 bg-black/55 backdrop-blur-[2px] md:hidden"
        />
      )}

      {/* Mobile open button */}
      {isMobile && collapsed && (
        <button
          onClick={onToggle}
          className="fixed left-3 top-4 z-50 h-9 w-9 rounded-full bg-white/12 backdrop-blur-md border border-white/25 shadow-[0_4px_14px_rgba(0,0,0,0.25)] flex items-center justify-center md:hidden"
          aria-label="Open sidebar"
        >
          <ChevronRight className="w-4 h-4 text-gray-200" />
        </button>
      )}

      <motion.aside
        animate={
          isMobile
            ? { x: collapsed ? -280 : 0 }
            : { width: collapsed ? 72 : 256, x: 0 }
        }
        transition={
          isMobile
            ? { type: 'tween', duration: 0.28, ease: [0.22, 1, 0.36, 1] }
            : { type: 'spring', stiffness: 240, damping: 30 }
        }
        className={cn(
          'flex flex-col bg-slate-900/45 backdrop-blur-xl border-r border-white/15 shadow-[1px_0_18px_rgba(0,0,0,0.32)]',
          isMobile
            ? 'fixed left-0 top-0 z-50 h-[100dvh] w-64 max-w-[85vw] overflow-visible'
            : 'relative self-stretch min-h-[100dvh] overflow-visible flex-shrink-0',
        )}
      >
        {/* Toggle chevron */}
      <button
        onClick={onToggle}
        className={cn(
          'z-[100] rounded-full bg-white/12 backdrop-blur-md border border-white/25 shadow-[0_6px_16px_rgba(0,0,0,0.3)] flex items-center justify-center hover:bg-white/20 transition-colors',
          isMobile
            ? 'absolute top-4 right-0 translate-x-1/2 w-9 h-9' 
            : 'absolute -right-3 top-14 w-6 h-6'
        )}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? (
          <ChevronRight className={cn('text-gray-200', isMobile ? 'w-4 h-4' : 'w-3 h-3')} />
        ) : (
          <ChevronLeft className={cn('text-gray-200', isMobile ? 'w-4 h-4' : 'w-3 h-3')} />
        )}
      </button>

      <div className={cn('flex h-full flex-col', isMobile && 'overflow-y-auto overscroll-contain')}>

        {/* Player Profile */}
        <div
          className={cn(
            'relative flex items-center gap-3 px-4 py-5 border-b border-white/12',
            collapsed && 'flex-col justify-start gap-2 px-0 py-4 min-h-[7rem]',
          )}
        >
          <div className="relative flex-shrink-0 w-10 h-10 rounded-full overflow-hidden bg-[#D71920]/20 ring-2 ring-[#D71920]/40">
            <Image
              src={avatarUrl}
              alt={`${username}'s avatar`}
              fill
              className="object-cover"
              unoptimized
            />
          </div>

          <AnimatePresence>
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <p className="font-semibold text-sm text-gray-100 truncate max-w-[140px]">
                  {username}
                </p>
                <p className="text-xs font-medium text-[#FFD4D6]">
                  Current score: {totalScore} XP
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {collapsed && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center pointer-events-none"
              >
                <span className="text-[10px] font-bold text-[#FFD4D6] leading-tight">
                  {totalScore}
                </span>
                <span className="text-[9px] font-medium text-gray-300 leading-tight">XP</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Stage Navigation */}
        <nav className="flex-1 py-4 overflow-y-auto mt-2">
          {STAGE_CONFIGS.map((stage) => {
            const status = getStageStatus(stage.number);
            const isActive = stage.number === currentStage;
            const isLocked = status === 'locked';
            const isCompleted = status === 'completed';

            return (
              <Link
                key={stage.number}
                href={isLocked ? '#' : `/stage/${stage.number}`}
                onClick={(e) => isLocked && e.preventDefault()}
                aria-disabled={isLocked}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 mx-2 rounded-xl transition-all duration-150',
                  collapsed && 'justify-center px-0 mx-1 py-4',
                  isActive && !isLocked
                    ? 'bg-[#D71920]/22 text-[#FFE9EA] border border-[#D71920]/45'
                    : isLocked
                    ? 'opacity-40 cursor-not-allowed'
                    : 'hover:bg-white/10 text-gray-200 hover:text-white',
                )}
              >
                <div className="flex-shrink-0">
                  {isCompleted ? (
                    <CheckCircle2 className="w-4 h-4 text-[#FFD4D6]" />
                  ) : isLocked ? (
                    <Lock className="w-4 h-4 text-gray-300" />
                  ) : (
                    <Swords className="w-4 h-4 text-[#FFD4D6]" />
                  )}
                </div>

                <AnimatePresence>
                  {!collapsed && (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className={cn(
                        'text-sm font-medium whitespace-nowrap',
                        isActive ? 'text-[#FFE9EA] font-semibold' : '',
                        isLocked ? 'text-gray-300' : '',
                      )}
                    >
                      Stage {stage.number}
                    </motion.span>
                  )}
                </AnimatePresence>
              </Link>
            );
          })}
        </nav>

        {/* Bottom Actions */}
        <div className="border-t border-white/12 py-3">
          <Link
            href="/leaderboard"
            className={cn(
              'flex items-center gap-3 px-4 py-2.5 mx-2 rounded-xl transition-colors',
              collapsed && 'justify-center px-0 mx-0 py-4',
              isLeaderboard
                ? 'bg-[#D71920]/22 text-[#FFE9EA] border border-[#D71920]/45'
                : 'text-gray-200 hover:bg-white/10 hover:text-white'
            )}
          >
            <Trophy className={cn("w-4 h-4 flex-shrink-0", isLeaderboard && "text-[#FFE9EA]")} />
            <AnimatePresence>
              {!collapsed && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className={cn("text-sm font-medium", isLeaderboard && "font-semibold")}
                >
                  Leaderboard
                </motion.span>
              )}
            </AnimatePresence>
          </Link>

          <button
            onClick={() => setShowExitModal(true)}
            className={cn(
              'flex items-center gap-3 py-2.5 rounded-xl text-gray-200 hover:bg-[#D71920]/22 hover:text-[#FFE9EA] transition-colors',
              collapsed
                ? 'w-full justify-center px-0 mx-0 py-4'
                : 'w-full px-4 mx-2',
            )}
            style={collapsed ? {} : { width: 'calc(100% - 1rem)' }}
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            <AnimatePresence>
              {!collapsed && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-sm font-medium"
                >
                  Exit
                </motion.span>
              )}
            </AnimatePresence>
          </button>

          {/* Logos */}
          <AnimatePresence>
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-3 px-4 pt-3 pb-1"
              >
                <div className="relative h-10 w-20">
                  <Image
                    src="/images/trendAI.svg"
                    alt="TrendAI"
                    sizes="80px"
                    fill
                    className="object-contain object-left"
                    onError={(e) =>
                      ((e.target as HTMLImageElement).style.display = 'none')
                    }
                  />
                </div>
          
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      </motion.aside>

      <ExitModal
        isOpen={showExitModal}
        onClose={() => setShowExitModal(false)}
        onConfirm={() => {
          if (typeof window !== 'undefined') {
            sessionStorage.clear();
          }
          router.push('/');
        }}
      />
    </>
  );
}