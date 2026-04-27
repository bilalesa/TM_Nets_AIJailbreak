'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Zap, Clock, ArrowRight, Star } from 'lucide-react';

interface StageCompleteModalProps {
  isOpen: boolean;
  stageNumber: number;
  baseXP: number;
  timeBonus: number;
  grossScore: number;
  totalAwarded: number;
  elapsedSeconds: number;
  isLastStage: boolean;
  onNextStage: () => void;
  onViewLeaderboard: () => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export default function StageCompleteModal({
  isOpen,
  stageNumber,
  baseXP,
  timeBonus,
  grossScore,
  totalAwarded,
  elapsedSeconds,
  isLastStage,
  onNextStage,
  onViewLeaderboard,
}: StageCompleteModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md"
          />

          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.85, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: 30 }}
            transition={{ type: 'spring', stiffness: 280, damping: 24 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-5 sm:px-6 pointer-events-none"
          >
            <div className="w-full max-w-sm overflow-hidden rounded-2xl sm:rounded-3xl bg-slate-900/70 backdrop-blur-xl border border-white/15 shadow-[0_12px_40px_rgba(0,0,0,0.5)] pointer-events-auto">
              {/* Top gradient band */}
              <div className="h-1.5 w-full bg-gradient-to-r from-[#D71920] via-[#E52028] to-[#B91318]" />

              {/* Top celebration section */}
              <div className="px-5 sm:px-6 py-6 sm:py-8 text-center border-b border-white/10">
                <motion.div
                  initial={{ scale: 0, rotate: -20 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ delay: 0.2, type: 'spring', stiffness: 260, damping: 18 }}
                  className="w-14 h-14 sm:w-16 sm:h-16 bg-gradient-to-br from-[#D71920] to-[#B91318] rounded-full mx-auto mb-3 flex items-center justify-center shadow-lg"
                >
                  <Trophy className="w-7 h-7 sm:w-8 sm:h-8 text-yellow-300" />
                </motion.div>
                <motion.h2
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="text-white font-semibold text-xl sm:text-2xl mb-1"
                >
                  Stage {stageNumber} Cleared!
                </motion.h2>
                <p className="text-gray-400 text-xs sm:text-sm">
                  {isLastStage ? 'You beat all 5 stages! Incredible!' : 'Keep going — the next challenge awaits.'}
                </p>
              </div>

              {/* Score breakdown */}
              <div className="px-5 sm:px-6 py-4 sm:py-5">
                <div className="space-y-2.5 mb-4 sm:mb-5">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-xs sm:text-sm text-gray-400">
                      <Star className="w-3.5 h-3.5 text-[#FF6B6B]" />
                      Base XP
                    </span>
                    <span className="font-semibold text-sm sm:text-base text-white">+{baseXP} XP</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-xs sm:text-sm text-gray-400">
                      <Clock className="w-3.5 h-3.5 text-[#FF6B6B]" />
                      Speed bonus ({formatTime(elapsedSeconds)})
                    </span>
                    <span className="font-semibold text-sm sm:text-base text-emerald-400">+{timeBonus} XP</span>
                  </div>
                  <div className="border-t border-white/10 pt-2.5 flex items-center justify-between">
                    <span className="flex items-center gap-2 text-xs sm:text-sm font-medium text-gray-300">
                      <Zap className="w-3.5 h-3.5 text-yellow-400" />
                      Total Awarded
                    </span>
                    <motion.span
                      initial={{ scale: 1 }}
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ delay: 0.5, duration: 0.4 }}
                      className="font-bold text-base sm:text-lg text-[#FF6B6B]"
                    >
                      +{totalAwarded} XP
                    </motion.span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3">
                  <button
                    onClick={onViewLeaderboard}
                    className="flex-1 py-2.5 rounded-xl border border-white/20 text-xs sm:text-sm font-medium text-gray-300 hover:bg-white/10 hover:text-white transition-colors"
                  >
                    Leaderboard
                  </button>
                  {!isLastStage ? (
                    <button
                      onClick={onNextStage}
                      className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-[#D71920] to-[#B91318] text-xs sm:text-sm font-semibold text-white hover:from-[#E52028] hover:to-[#C91520] transition-all flex items-center justify-center gap-1.5"
                    >
                      Next Stage
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      onClick={onViewLeaderboard}
                      className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-[#D71920] to-[#B91318] text-xs sm:text-sm font-semibold text-white hover:from-[#E52028] hover:to-[#C91520] transition-all flex items-center justify-center gap-1.5"
                    >
                      Final Scores
                      <Trophy className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
