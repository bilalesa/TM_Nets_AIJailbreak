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
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
          />

          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.85, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: 30 }}
            transition={{ type: 'spring', stiffness: 280, damping: 24 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-5 sm:px-6 pointer-events-none"
          >
            <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-sm pointer-events-auto overflow-hidden">
              {/* Top celebration band */}
              <div className="px-5 sm:px-6 py-6 sm:py-8 text-center bg-[#D71920]">
                <motion.div
                  initial={{ scale: 0, rotate: -20 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ delay: 0.2, type: 'spring', stiffness: 260, damping: 18 }}
                  className="w-14 h-14 sm:w-16 sm:h-16 bg-white/20 rounded-full mx-auto mb-3 flex items-center justify-center"
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
                <p className="text-white/70 text-xs sm:text-sm">
                  {isLastStage ? 'You beat all 5 stages! Incredible!' : 'Keep going — the next challenge awaits.'}
                </p>
              </div>

              {/* Score breakdown */}
              <div className="px-5 sm:px-6 py-4 sm:py-5">
                <div className="space-y-2.5 mb-4 sm:mb-5">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-xs sm:text-sm text-gray-500">
                      <Star className="w-3.5 h-3.5 text-[#D71920]" />
                      Base XP
                    </span>
                    <span className="font-semibold text-sm sm:text-base text-gray-800">+{baseXP} XP</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-xs sm:text-sm text-gray-500">
                      <Clock className="w-3.5 h-3.5 text-[#D71920]" />
                      Speed bonus ({formatTime(elapsedSeconds)})
                    </span>
                    <span className="font-semibold text-sm sm:text-base text-[#2F6F5E]">+{timeBonus} XP</span>
                  </div>
                  <div className="border-t border-gray-100 pt-2.5 flex items-center justify-between">
                    <span className="flex items-center gap-2 text-xs sm:text-sm font-medium text-gray-700">
                      <Zap className="w-3.5 h-3.5 text-yellow-500" />
                      Total Awarded
                    </span>
                    <motion.span
                      initial={{ scale: 1 }}
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ delay: 0.5, duration: 0.4 }}
                      className="font-bold text-base sm:text-lg text-[#D71920]"
                    >
                      +{totalAwarded} XP
                    </motion.span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3">
                  <button
                    onClick={onViewLeaderboard}
                    className="flex-1 py-2.5 rounded-xl border border-gray-200 text-xs sm:text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    Leaderboard
                  </button>
                  {!isLastStage ? (
                    <button
                      onClick={onNextStage}
                      className="flex-1 py-2.5 rounded-xl bg-[#D71920] text-xs sm:text-sm font-semibold text-white hover:bg-[#D71920] transition-colors flex items-center justify-center gap-1.5"
                    >
                      Next Stage
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      onClick={onViewLeaderboard}
                      className="flex-1 py-2.5 rounded-xl bg-[#D71920] text-xs sm:text-sm font-semibold text-white hover:bg-[#D71920] transition-colors flex items-center justify-center gap-1.5"
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