'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { HelpCircle, X, KeyRound, Lightbulb, MessageSquare, Trophy } from 'lucide-react';

interface HowToPlayModalProps {
  isOpen: boolean;
  onClose: () => void;
  stageName: string;
}

const steps = [
  {
    icon: MessageSquare,
    title: 'Chat with the AI',
    desc: 'Send prompts in chat. Each stage has a different AI behavior and one hidden code.',
  },
  {
    icon: Lightbulb,
    title: 'Social Engineer It',
    desc: 'If it resists, try roleplay, urgency, authority, or tighter wording to shift its response.',
  },
  {
    icon: KeyRound,
    title: 'Enter the Code',
    desc: "Use Quick Tools > Enter the code to submit your guess. Codes are hidden in the AI's responses.",
  },
  {
    icon: Trophy,
    title: 'Earn XP',
    desc: 'You earn base XP + speed bonus. Faster clears rank higher on the leaderboard.',
  },
];

export default function HowToPlayModal({ isOpen, onClose, stageName }: HowToPlayModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md"
          />
          <motion.div
            key="modal"
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-5 sm:px-6 pointer-events-none"
          >
            <div className="bg-slate-900/70 backdrop-blur-xl border border-white/15 rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.5)] w-full max-w-md max-h-[90vh] pointer-events-auto overflow-hidden flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 sm:py-4 border-b border-white/10">
                <div className="flex items-center gap-2.5">
                  <HelpCircle className="w-5 h-5 text-[#D71920]" />
                  <h3 className="font-bold text-sm sm:text-base text-white">How to Play</h3>
                </div>
                <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Stage context */}
              <div className="mx-5 sm:mx-6 mt-3 sm:mt-4 px-3 py-2.5 bg-[#D71920]/20 border border-[#D71920]/30 rounded-xl">
                <p className="text-[11px] sm:text-xs font-medium text-[#FFD4D6]">
                  You are currently on: <span className="font-bold text-white">{stageName}</span>
                </p>
              </div>

              {/* Steps */}
              <div className="px-5 sm:px-6 py-3 sm:py-4 space-y-3 sm:space-y-4 overflow-y-auto">
                {steps.map((step, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.07 }}
                    className="flex gap-3"
                  >
                    <div className="flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-br from-[#D71920] to-[#B91318] flex items-center justify-center mt-0.5">
                      <step.icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
                    </div>
                    <div>
                      <p className="text-xs sm:text-sm font-semibold text-white">{step.title}</p>
                      <p className="text-[11px] sm:text-xs text-gray-400 mt-0.5 leading-relaxed">{step.desc}</p>
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Footer */}
              <div className="px-5 sm:px-6 pb-4 sm:pb-5 pt-3 border-t border-white/10">
                <button
                  onClick={onClose}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#D71920] to-[#B91318] text-white text-xs sm:text-sm font-semibold hover:from-[#E52028] hover:to-[#C91520] transition-all"
                >
                  Got it - let&apos;s hack!
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
