'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';

interface ExitModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export default function ExitModal({ isOpen, onClose, onConfirm }: ExitModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md"
          />

          {/* Modal */}
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 16 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-5 sm:px-6 pointer-events-none"
          >
            <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-slate-900/70 backdrop-blur-xl border border-white/15 shadow-[0_12px_40px_rgba(0,0,0,0.5)] pointer-events-auto">
              <div className="h-1.5 w-full bg-gradient-to-r from-[#D71920] via-[#E52028] to-[#B91318]" />

              {/* Header */}
              <div className="px-5 pt-4 pb-3 sm:px-6 sm:pt-5 sm:pb-4">
                <div className="mb-3 flex items-start justify-between sm:mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#D71920] to-[#B91318] flex items-center justify-center">
                      <AlertTriangle className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white text-sm sm:text-base tracking-tight">Exit Challenge?</h3>
                      <p className="text-xs text-[#FF6B6B] font-semibold mt-0.5 uppercase tracking-wide">Progress will reset</p>
                    </div>
                  </div>
                  <button
                    onClick={onClose}
                    className="text-gray-400 hover:text-white transition-colors"
                    aria-label="Close exit dialog"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Body */}
                <p className="text-sm text-gray-300 mb-4 sm:mb-5">
                  Leave now and end this run. Your current score for today will be cleared.
                </p>

                {/* Actions */}
                <div className="flex flex-col-reverse sm:flex-row gap-2.5 sm:gap-3">
                  <button
                    onClick={onClose}
                    className="flex-1 py-2.5 px-4 rounded-xl border border-white/20 text-sm font-medium text-gray-300 hover:bg-white/10 hover:text-white transition-colors"
                  >
                    Stay
                  </button>
                  <button
                    onClick={onConfirm}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#D71920] to-[#B91318] text-sm font-semibold text-white hover:from-[#E52028] hover:to-[#C91520] transition-all"
                  >
                    Exit Now
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
