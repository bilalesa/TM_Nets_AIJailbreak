'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Loader2, CheckCircle2, Mail } from 'lucide-react';
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

function validateEmail(email: string): string | null {
  if (!email.trim()) return 'Email is required.';
  if (email.trim().length > 254) return 'Email is too long.';
  if (!/^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(email.trim()))
    return 'Enter a valid email address.';
  return null;
}

// Lightweight client fingerprint for abuse review. Not a security boundary —
// just helps admins notice multiple accounts from the same browser. SHA-256
// of stable browser + screen + locale signals.
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

type Step = 'enter' | 'verify';
type Status = 'idle' | 'loading' | 'success' | 'error';

export default function LoginPage() {
  const router = useRouter();
  const usernameRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('enter');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [resendIn, setResendIn] = useState(0);

  // Resend cooldown ticker
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  // Focus the code field when entering the verify step
  useEffect(() => {
    if (step === 'verify') {
      codeRef.current?.focus();
    }
  }, [step]);

  const isLoading = status === 'loading';
  const isSuccess = status === 'success';

  const clearError = () => {
    if (status === 'error') {
      setStatus('idle');
      setErrorMsg('');
    }
  };

  // ── Step 1: send the code ───────────────────────────────────────────────────
  const handleStart = async () => {
    const trimmedUsername = username.trim();
    const trimmedEmail = email.trim();

    const usernameErr = validateUsername(trimmedUsername);
    if (usernameErr) {
      setStatus('error');
      setErrorMsg(usernameErr);
      usernameRef.current?.focus();
      return;
    }
    const emailErr = validateEmail(trimmedEmail);
    if (emailErr) {
      setStatus('error');
      setErrorMsg(emailErr);
      return;
    }

    setStatus('loading');
    setErrorMsg('');

    try {
      const fingerprint = await computeClientFingerprint();
      const res = await fetch('/api/auth/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: trimmedUsername,
          email: trimmedEmail,
          fingerprint,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setStatus('error');
        setErrorMsg(data.error || 'Something went wrong. Please try again.');
        return;
      }

      setStep('verify');
      setStatus('idle');
      setResendIn(60);
    } catch {
      setStatus('error');
      setErrorMsg('Network error. Please check your connection.');
    }
  };

  // ── Step 2: verify the code ─────────────────────────────────────────────────
  const handleVerify = async () => {
    const trimmedCode = code.trim();
    if (!/^\d{6}$/.test(trimmedCode)) {
      setStatus('error');
      setErrorMsg('Enter the 6-digit code from your email.');
      codeRef.current?.focus();
      return;
    }

    setStatus('loading');
    setErrorMsg('');

    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), code: trimmedCode }),
      });
      const data = await res.json();

      if (!res.ok) {
        setStatus('error');
        setErrorMsg(data.error || 'Verification failed.');
        return;
      }

      setStatus('success');
      setTimeout(() => router.push('/stage/1'), 600);
    } catch {
      setStatus('error');
      setErrorMsg('Network error. Please check your connection.');
    }
  };

  const handleResend = async () => {
    if (resendIn > 0) return;
    setStatus('loading');
    setErrorMsg('');
    try {
      const fingerprint = await computeClientFingerprint();
      const res = await fetch('/api/auth/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          email: email.trim(),
          fingerprint,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus('error');
        setErrorMsg(data.error || 'Failed to resend code.');
        return;
      }
      setStatus('idle');
      setResendIn(60);
    } catch {
      setStatus('error');
      setErrorMsg('Network error.');
    }
  };

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
              {step === 'enter'
                ? 'Get the AI to reveal the secret code.'
                : `Enter the 6-digit code we sent to ${email}.`}
            </motion.p>

            <AnimatePresence mode="wait">
              {step === 'enter' ? (
                <motion.div
                  key="enter"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
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
                      onKeyDown={(e) => e.key === 'Enter' && !isLoading && handleStart()}
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

                  <motion.div variants={itemVariants}>
                    <input
                      type="email"
                      inputMode="email"
                      placeholder="Enter your email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        clearError();
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && !isLoading && handleStart()}
                      maxLength={254}
                      disabled={isLoading || isSuccess}
                      autoComplete="email"
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

                  <ErrorBanner status={status} message={errorMsg} />

                  <motion.div variants={itemVariants}>
                    <motion.button
                      onClick={handleStart}
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
                          Sending code…
                        </>
                      ) : (
                        <>
                          Send verification code
                          <Mail className="w-5 h-5" />
                        </>
                      )}
                    </motion.button>
                  </motion.div>
                </motion.div>
              ) : (
                <motion.div
                  key="verify"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-4"
                >
                  <input
                    ref={codeRef}
                    type="text"
                    inputMode="numeric"
                    placeholder="6-digit code"
                    value={code}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, '').slice(0, 6);
                      setCode(v);
                      clearError();
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && !isLoading && handleVerify()}
                    maxLength={6}
                    disabled={isLoading || isSuccess}
                    autoComplete="one-time-code"
                    className={cn(
                      'w-full px-5 py-4 rounded-2xl text-2xl tracking-[0.5em] text-center font-mono',
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

                  <ErrorBanner status={status} message={errorMsg} />

                  <motion.button
                    onClick={handleVerify}
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
                        Verifying…
                      </>
                    ) : isSuccess ? (
                      <>
                        <CheckCircle2 className="w-5 h-5" />
                        Verified — let&apos;s go!
                      </>
                    ) : (
                      <>
                        Verify and start
                        <ArrowRight className="w-5 h-5" />
                      </>
                    )}
                  </motion.button>

                  <div className="flex items-center justify-between text-sm text-white/60">
                    <button
                      onClick={() => {
                        setStep('enter');
                        setCode('');
                        setStatus('idle');
                        setErrorMsg('');
                      }}
                      className="hover:text-white"
                    >
                      ← Use a different email
                    </button>
                    <button
                      onClick={handleResend}
                      disabled={resendIn > 0 || isLoading}
                      className="hover:text-white disabled:opacity-50 disabled:hover:text-white/60"
                    >
                      {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </div>
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
