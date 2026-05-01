'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Loader2, CheckCircle2, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Animation Variants ───────────────────────────────────────────────────────

const smoothEase: [number, number, number, number] = [0.22, 1, 0.36, 1];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.12, delayChildren: 0.2 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: smoothEase },
  },
};

// ─── Validation ───────────────────────────────────────────────────────────────

function validateUsername(username: string): string | null {
  if (!username.trim()) return 'Username is required.';
  if (username.trim().length < 2) return 'Username must be at least 2 characters.';
  if (username.trim().length > 30) return 'Username must be 30 characters or less.';
  if (!/^[a-zA-Z0-9_\-. ]+$/.test(username.trim()))
    return 'Only letters, numbers, spaces, _ - . allowed.';
  return null;
}

function validateRecoveryCode(code: string): string | null {
  // Strip dashes/whitespace and check length + alphabet. The backend
  // normalizes the same way, so we accept both "ABCD-EFGH-..." and "ABCDEFGH..."
  const normalized = code.replace(/[-\s]/g, '').toUpperCase();
  if (!normalized) return 'Recovery code is required.';
  if (normalized.length !== 16) return 'Recovery code should be 16 characters.';
  if (!/^[A-HJ-NP-Z2-9]+$/.test(normalized))
    return 'Recovery code contains invalid characters.';
  return null;
}

async function computeClientFingerprint(): Promise<string | null> {
  try {
    if (typeof window === 'undefined' || !window.crypto?.subtle) return null;
    const parts = [
      navigator.userAgent,
      navigator.language,
      navigator.platform,
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      `${screen.width}x${screen.height}x${screen.colorDepth}`,
      `${window.devicePixelRatio}`,
    ].join('|');
    const buf = new TextEncoder().encode(parts);
    const digest = await window.crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return null;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

type Status = 'idle' | 'loading' | 'success' | 'error';
type Mode = 'signup' | 'recover';

export default function LoginPage() {
  const router = useRouter();
  const usernameRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<Mode>('signup');
  const [username, setUsername] = useState('');
  const [recoveryCodeInput, setRecoveryCodeInput] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  // Set when signup succeeds — shows the one-time code modal before
  // routing the player into the game.
  const [issuedRecoveryCode, setIssuedRecoveryCode] = useState<string | null>(null);

  const isLoading = status === 'loading';
  const isSuccess = status === 'success';

  const clearError = () => {
    if (status === 'error') {
      setStatus('idle');
      setErrorMsg('');
    }
  };

  const switchMode = (next: Mode) => {
    if (isLoading || isSuccess) return;
    setMode(next);
    setErrorMsg('');
    setStatus('idle');
    setRecoveryCodeInput('');
  };

  const handleSignup = async () => {
    const trimmedUsername = username.trim();
    const usernameErr = validateUsername(trimmedUsername);
    if (usernameErr) {
      setStatus('error');
      setErrorMsg(usernameErr);
      usernameRef.current?.focus();
      return;
    }

    setStatus('loading');
    setErrorMsg('');

    try {
      const fingerprint = await computeClientFingerprint();
      const res = await fetch('/api/auth/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: trimmedUsername, fingerprint }),
      });
      const data = await res.json();

      if (!res.ok) {
        setStatus('error');
        setErrorMsg(data.error || 'Something went wrong. Please try again.');
        return;
      }

      // Show the recovery-code modal first; we route into the game only
      // after the player explicitly acknowledges they've saved the code.
      setIssuedRecoveryCode(data.recoveryCode);
      setStatus('success');
    } catch {
      setStatus('error');
      setErrorMsg('Network error. Please check your connection.');
    }
  };

  const handleRecover = async () => {
    const trimmedUsername = username.trim();
    const usernameErr = validateUsername(trimmedUsername);
    if (usernameErr) {
      setStatus('error');
      setErrorMsg(usernameErr);
      usernameRef.current?.focus();
      return;
    }
    const codeErr = validateRecoveryCode(recoveryCodeInput);
    if (codeErr) {
      setStatus('error');
      setErrorMsg(codeErr);
      return;
    }

    setStatus('loading');
    setErrorMsg('');

    try {
      const fingerprint = await computeClientFingerprint();
      const res = await fetch('/api/auth/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: trimmedUsername,
          recoveryCode: recoveryCodeInput.trim(),
          fingerprint,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setStatus('error');
        setErrorMsg(data.error || 'Recovery failed. Please check your code.');
        return;
      }

      setStatus('success');
      setTimeout(() => router.push('/stage/1'), 600);
    } catch {
      setStatus('error');
      setErrorMsg('Network error. Please check your connection.');
    }
  };

  const onSubmit = mode === 'signup' ? handleSignup : handleRecover;

  return (
    <div className="relative min-h-screen w-full overflow-hidden flex items-stretch justify-center">
      {/* ── Background Image ── */}
      <div className="absolute inset-0 z-0">
        <Image
          src="/images/background.jpg"
          alt="Background"
          fill
          sizes="100vw"
          priority
          className="object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      </div>

      {/* ── Subtle noise overlay ── */}
      <div
        className="absolute inset-0 z-0 opacity-[0.025] pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          backgroundSize: '128px',
        }}
      />

      {/* ── Main Layout ── */}
      <div className="relative z-10 w-full max-w-7xl mx-auto px-6 sm:px-10 lg:px-16 py-6 min-h-screen flex flex-col">
        {/* ── Logo Bar ── */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="flex items-center gap-4 mt-2 mb-6 lg:mb-8"
        >
          <div className="relative" style={{ height: 60, width: 144 }}>
            <Image
              src="/images/trendAI.svg"
              alt="TrendAI – AI Fearlessly"
              fill
              sizes="144px"
              className="object-contain object-left"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
        </motion.div>

        {/* ── Two-column Hero ── */}
        <div className="flex-1 flex flex-col lg:flex-row items-center justify-center gap-12 lg:gap-8">
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="flex-1 max-w-5xl w-full"
          >
            {/* Headline */}
            <motion.div variants={itemVariants}>
              <h1 className="text-white font-bold leading-tight mb-6">
                <span className="block text-5xl md:text-7xl">Breaking the Prompt:</span>
                <span className="block text-5xl md:text-7xl">Inside AI Manipulation</span>
              </h1>
            </motion.div>

            {/* Subtitle */}
            <motion.p
              variants={itemVariants}
              className="text-white/70 text-base md:text-lg mb-8"
            >
              Get the AI to reveal the secret code.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="space-y-4"
            >
              <motion.div variants={itemVariants}>
                <input
                  ref={usernameRef}
                  type="text"
                  placeholder="Enter your name"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    clearError();
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && !isLoading && onSubmit()}
                  maxLength={30}
                  disabled={isLoading || isSuccess}
                  autoComplete="off"
                  className={cn(
                    'w-full px-5 py-4 rounded-2xl text-base',
                    'bg-white/10 backdrop-blur-sm',
                    'border text-white placeholder:text-white/40',
                    'outline-none transition-all duration-200',
                    'focus:bg-white/15',
                    status === 'error'
                      ? 'border-red-500 focus:border-red-400'
                      : 'border-white/20 focus:border-white/50',
                    (isLoading || isSuccess) && 'opacity-60 cursor-not-allowed',
                  )}
                />
              </motion.div>

              <AnimatePresence initial={false}>
                {mode === 'recover' && (
                  <motion.div
                    key="recovery-input"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <input
                      type="text"
                      placeholder="Recovery code (e.g. ABCD-EFGH-JKLM-NPQR)"
                      value={recoveryCodeInput}
                      onChange={(e) => {
                        setRecoveryCodeInput(e.target.value);
                        clearError();
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && !isLoading && handleRecover()}
                      maxLength={32}
                      disabled={isLoading || isSuccess}
                      autoComplete="off"
                      autoCapitalize="characters"
                      className={cn(
                        'w-full px-5 py-4 rounded-2xl text-base font-mono tracking-wider',
                        'bg-white/10 backdrop-blur-sm',
                        'border text-white placeholder:text-white/40',
                        'outline-none transition-all duration-200',
                        'focus:bg-white/15',
                        status === 'error'
                          ? 'border-red-500 focus:border-red-400'
                          : 'border-white/20 focus:border-white/50',
                        (isLoading || isSuccess) && 'opacity-60 cursor-not-allowed',
                      )}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              <ErrorBanner status={status} message={errorMsg} />

              <motion.div variants={itemVariants}>
                <motion.button
                  onClick={onSubmit}
                  disabled={isLoading || isSuccess}
                  whileHover={!isLoading && !isSuccess ? { scale: 1.02, y: -1 } : {}}
                  whileTap={!isLoading && !isSuccess ? { scale: 0.98 } : {}}
                  className={cn(
                    'w-full flex items-center justify-center gap-2',
                    'py-4 px-6 rounded-2xl',
                    'bg-red-700 hover:bg-red-600 active:bg-red-800',
                    'text-white font-medium text-base',
                    'transition-colors duration-200 cursor-pointer',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2',
                    (isLoading || isSuccess) && 'opacity-70 cursor-not-allowed',
                  )}
                  aria-busy={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      {mode === 'signup' ? 'Starting…' : 'Recovering…'}
                    </>
                  ) : isSuccess && mode === 'recover' ? (
                    <>
                      <CheckCircle2 className="w-5 h-5" />
                      Welcome back!
                    </>
                  ) : mode === 'signup' ? (
                    <>
                      Start the challenge
                      <ArrowRight className="w-5 h-5" />
                    </>
                  ) : (
                    <>
                      Recover my account
                      <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </motion.button>
              </motion.div>

              {/* Mode toggle */}
              <motion.div variants={itemVariants} className="text-center pt-2">
                {mode === 'signup' ? (
                  <button
                    type="button"
                    onClick={() => switchMode('recover')}
                    disabled={isLoading || isSuccess}
                    className="text-sm text-white/60 hover:text-white/90 transition-colors disabled:opacity-40 cursor-pointer"
                  >
                    Already have a recovery code?
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => switchMode('signup')}
                    disabled={isLoading || isSuccess}
                    className="text-sm text-white/60 hover:text-white/90 transition-colors disabled:opacity-40 cursor-pointer"
                  >
                    New here? Sign up instead
                  </button>
                )}
              </motion.div>
            </motion.div>
          </motion.div>
        </div>
      </div>

      <RecoveryCodeModal
        code={issuedRecoveryCode}
        username={username.trim()}
        onContinue={() => router.push('/stage/1')}
      />
    </div>
  );
}

function ErrorBanner({ status, message }: { status: Status; message: string }) {
  return (
    <AnimatePresence>
      {status === 'error' && message && (
        <motion.p
          role="alert"
          initial={{ opacity: 0, height: 0, marginTop: 0 }}
          animate={{ opacity: 1, height: 'auto', marginTop: 8 }}
          exit={{ opacity: 0, height: 0, marginTop: 0 }}
          transition={{ duration: 0.2 }}
          className="text-sm font-medium text-red-400 pl-1 max-w-md"
        >
          {message}
        </motion.p>
      )}
    </AnimatePresence>
  );
}

// One-time recovery-code display
function RecoveryCodeModal({
  code,
  username,
  onContinue,
}: {
  code: string | null;
  username: string;
  onContinue: () => void;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!code) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback: do nothing — the code is still visible on screen
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        key="recovery-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
      >
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.96 }}
          transition={{ duration: 0.3, ease: smoothEase }}
          className="w-full max-w-lg rounded-3xl bg-zinc-900 border border-white/10 p-8 shadow-2xl"
        >
          <h2 className="text-2xl font-bold text-white mb-2">
            Save your recovery code
          </h2>
          <p className="text-white/70 text-sm mb-6">
            This is the <span className="font-semibold text-white">only</span> way
            back into your account on a different device or after your session
            expires. We won&apos;t show it again.
          </p>

          <div className="bg-black/40 border border-white/10 rounded-2xl p-5 mb-2">
            <div className="text-xs uppercase tracking-wider text-white/40 mb-1">
              Username
            </div>
            <div className="text-white font-medium mb-3">{username}</div>
            <div className="text-xs uppercase tracking-wider text-white/40 mb-1">
              Recovery code
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="font-mono text-xl text-white tracking-widest break-all">
                {code}
              </div>
              <button
                type="button"
                onClick={handleCopy}
                className={cn(
                  'shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg',
                  'bg-white/10 hover:bg-white/15 text-white text-sm',
                  'transition-colors cursor-pointer',
                )}
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Copy
                  </>
                )}
              </button>
            </div>
          </div>

          <p className="text-xs text-white/50 mb-6">
            Tip: take a screenshot or paste it somewhere safe. Lose it and we
            can&apos;t recover your progress.
          </p>

          <label className="flex items-center gap-3 cursor-pointer mb-6">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="w-4 h-4 rounded accent-red-600 cursor-pointer"
            />
            <span className="text-sm text-white/80">
              I&apos;ve saved my recovery code
            </span>
          </label>

          <button
            type="button"
            onClick={onContinue}
            disabled={!acknowledged}
            className={cn(
              'w-full flex items-center justify-center gap-2',
              'py-4 px-6 rounded-2xl text-white font-medium',
              'transition-colors',
              acknowledged
                ? 'bg-red-700 hover:bg-red-600 active:bg-red-800 cursor-pointer'
                : 'bg-white/10 cursor-not-allowed',
            )}
          >
            Continue to the challenge
            <ArrowRight className="w-5 h-5" />
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
