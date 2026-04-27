'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { KeyRound, X, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EnterCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  stageNumber: number;
  elapsedSeconds: number;
  onSuccess: (
    scoreAwarded: number,
    timeBonus: number,
    baseXP: number,
    grossScore: number,
  ) => void;
}

type SubmitStatus = 'idle' | 'loading' | 'correct' | 'incorrect';

export default function EnterCodeModal({
  isOpen,
  onClose,
  stageNumber,
  elapsedSeconds,
  onSuccess,
}: EnterCodeModalProps) {
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<SubmitStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async () => {
    if (!code.trim() || status === 'loading') return;

    setStatus('loading');
    setErrorMsg('');

    try {
      const res = await fetch('/api/game/validate-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stageNumber,
          code: code.trim(),
          elapsedSeconds,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus('incorrect');
        setErrorMsg(data.error || 'Something went wrong.');
        return;
      }

      if (data.correct) {
        setStatus('correct');
        setTimeout(() => {
          onSuccess(
            data.scoreAwarded,
            data.timeBonus,
            data.baseXP,
            data.grossScore ?? data.scoreAwarded,
          );
          onClose();
          setCode('');
          setStatus('idle');
        }, 1200);
      } else {
        setStatus('incorrect');
        setErrorMsg('Incorrect code. Keep trying!');
        setTimeout(() => {
          setStatus('idle');
          setErrorMsg('');
        }, 2000);
      }
    } catch {
      setStatus('incorrect');
      setErrorMsg('Network error. Please try again.');
      setTimeout(() => setStatus('idle'), 2000);
    }
  };

  const handleClose = () => {
    if (status === 'loading' || status === 'correct') return;
    setCode('');
    setStatus('idle');
    setErrorMsg('');
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md"
          />

          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: 'spring', stiffness: 340, damping: 28 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-5 sm:px-6 pointer-events-none"
          >
            <div className="bg-slate-900/70 backdrop-blur-xl border border-white/15 rounded-2xl sm:rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.5)] w-full max-w-sm pointer-events-auto overflow-hidden">
              {/* Header bar */}
              <div className="bg-gradient-to-r from-[#D71920] to-[#B91318] px-5 sm:px-6 py-3.5 sm:py-4 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <KeyRound className="w-4 h-4 text-white/80" />
                  <span className="text-white font-semibold text-xs sm:text-sm">
                    Enter Access Code — Stage {stageNumber}
                  </span>
                </div>
                <button onClick={handleClose} className="text-white/60 hover:text-white transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <div className="px-5 sm:px-6 py-4 sm:py-5">
                <p className="text-xs sm:text-sm text-gray-300 mb-3 sm:mb-4">
                  Found the secret code? Enter it below to complete this stage and claim your XP.
                </p>

                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                  placeholder="e.g. DEFCON-ALPHA-XXXX"
                  maxLength={30}
                  disabled={status === 'loading' || status === 'correct'}
                  className={cn(
                    'w-full px-3.5 py-2.5 sm:px-4 sm:py-3 rounded-xl border font-mono text-base sm:text-sm text-white tracking-widest uppercase',
                    'placeholder:text-gray-500 placeholder:normal-case placeholder:tracking-normal',
                    'outline-none transition-all duration-150 bg-slate-800/60 backdrop-blur-sm',
                    status === 'incorrect'
                      ? 'border-[#D71920] bg-[#D71920]/20'
                      : status === 'correct'
                      ? 'border-emerald-500/50 bg-emerald-900/30'
                      : 'border-white/20 focus:border-[#D71920]/70 focus:bg-slate-800/80',
                  )}
                />

                <AnimatePresence>
                  {errorMsg && (
                    <motion.p
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="text-[11px] sm:text-xs text-[#FF6B6B] font-medium mt-2 flex items-center gap-1"
                    >
                      <XCircle className="w-3 h-3" />
                      {errorMsg}
                    </motion.p>
                  )}
                </AnimatePresence>

                <motion.button
                  onClick={handleSubmit}
                  disabled={!code.trim() || status === 'loading' || status === 'correct'}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  className={cn(
                    'w-full mt-3 sm:mt-4 py-2.5 sm:py-3 rounded-xl font-semibold text-xs sm:text-sm text-white transition-all duration-200',
                    'flex items-center justify-center gap-2',
                    status === 'correct'
                      ? 'bg-emerald-600 cursor-default'
                      : 'bg-gradient-to-r from-[#D71920] to-[#B91318] hover:from-[#E52028] hover:to-[#C91520] disabled:opacity-50 disabled:cursor-not-allowed',
                  )}
                >
                  {status === 'loading' && <Loader2 className="w-4 h-4 animate-spin" />}
                  {status === 'correct' && <CheckCircle2 className="w-4 h-4" />}
                  {status === 'correct'
                    ? 'Stage Cleared'
                    : status === 'loading'
                    ? 'Validating…'
                    : 'Submit Code'}
                </motion.button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
