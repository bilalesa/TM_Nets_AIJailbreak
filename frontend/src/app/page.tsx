'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
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

const cardVariants = {
  hidden: { opacity: 0, x: 60, rotateY: -15 },
  visible: {
    opacity: 1,
    x: 0,
    rotateY: 0,
    transition: { duration: 0.8, ease: smoothEase, delay: 0.3 },
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

// ─── Component ────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [username, setUsername] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [isCardHovered, setIsCardHovered] = useState(false);
  const [showNetsFallback, setShowNetsFallback] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUsername(e.target.value);
    // Clear error as user types
    if (status === 'error') {
      setStatus('idle');
      setErrorMsg('');
    }
  };

  const handleStart = async () => {
    const trimmed = username.trim();

    // Client-side validation
    const validationError = validateUsername(trimmed);
    if (validationError) {
      setStatus('error');
      setErrorMsg(validationError);
      inputRef.current?.focus();
      return;
    }

    setStatus('loading');
    setErrorMsg('');

    try {
      const res = await fetch('/api/auth/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: trimmed }),
      });

      const data = await res.json();

      if (!res.ok) {
        // Handle duplicate username (409 Conflict) or other errors
        if (res.status === 409) {
          setStatus('error');
          setErrorMsg('That username is already taken. Please choose another.');
        } else {
          setStatus('error');
          setErrorMsg(data.error || 'Something went wrong. Please try again.');
        }
        inputRef.current?.focus();
        return;
      }

      setStatus('success');
      // Small delay to show success state before redirect
      setTimeout(() => {
        router.push('/stage/1');
      }, 600);
    } catch {
      setStatus('error');
      setErrorMsg('Network error. Please check your connection.');
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && status !== 'loading') {
      handleStart();
    }
  };

  const isLoading = status === 'loading';
  const isSuccess = status === 'success';

  return (
    <div className="relative min-h-screen w-full overflow-hidden flex items-stretch justify-center">

      {/* ── Background Image ── */}
      <div className="absolute inset-0 z-0">
        <Image
          src="/images/bg.jpg"
          alt="Background"
          fill
          sizes="100vw"
          priority
          className="object-cover"
          // Fallback gradient while image loads or if not set
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      </div>

      {/* ── Subtle noise overlay for depth ── */}
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
          <div className="relative h-10 w-36" style={{ height: 60, width: 144 }}>
            <Image
              src="/images/trendAI.png"
              alt="TrendAI – AI Fearlessly"
              fill
              sizes="144px"
              className="object-contain object-left"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>

          {/* Divider */}
          <div className="h-7 w-px bg-gray-400/40" />

          <div className="relative h-8 w-20" style={{ height: 60, width: 80 }}>
            <Image
              src="/images/nets.png"
              alt="NETS"
              fill
              sizes="80px"
              className="object-contain object-left"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
                setShowNetsFallback(true);
              }}
            />
            {showNetsFallback && (
              <span className="absolute inset-0 flex items-center text-[#003399] font-black text-xl tracking-widest select-none">
                NETS
              </span>
            )}
          </div>
        </motion.div>

        {/* ── Two-column Hero ── */}
        <div className="flex-1 flex flex-col lg:flex-row items-center justify-center gap-12 lg:gap-8">

          {/* ── LEFT: Copy + Form ── */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="flex-1 max-w-xl w-full"
          >
            {/* Headline */}
            <motion.div variants={itemVariants}>
              <h1
                className="text-3xl sm:text-4xl lg:text-5xl font-black leading-[1.1] tracking-tight mb-5"
                style={{ color: '#9B1C1C' }}
              >
                Breaking the Prompt - 
                <br />
                <span style={{ color: '#9B1C1C' }}>Inside AI Manipulation</span>
              </h1>
            </motion.div>

            {/* Subheading */}
            <motion.p
              variants={itemVariants}
              className="text-lg sm:text-xl font-medium mb-8"
              style={{ color: '#B91C1C' }}
            >
              Get the AI to reveal the secret code.
            </motion.p>

            {/* Input */}
            <motion.div variants={itemVariants} className="mb-4">
              <div className="relative">
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Enter your name"
                  value={username}
                  onChange={handleChange}
                  onKeyDown={handleKeyDown}
                  maxLength={30}
                  disabled={isLoading || isSuccess}
                  aria-label="Username"
                  aria-describedby={status === 'error' ? 'username-error' : undefined}
                  className={cn(
                    'w-full px-5 py-4 rounded-2xl text-base font-normal text-gray-800',
                    'placeholder:text-gray-400',
                    'bg-white/80 backdrop-blur-sm',
                    'border-2 transition-all duration-200 outline-none',
                    'focus:bg-white/95 focus:shadow-lg',
                    status === 'error'
                      ? 'border-red-400 focus:border-red-500'
                      : 'border-white/60 focus:border-[#C0392B]/50',
                    (isLoading || isSuccess) && 'opacity-60 cursor-not-allowed',
                  )}
                  style={{ boxShadow: '0 2px 16px rgba(0,0,0,0.06)' }}
                />
                {/* Right icon */}
                <AnimatePresence mode="wait">
                  {status === 'error' && (
                    <motion.div
                      key="error-icon"
                      initial={{ opacity: 0, scale: 0.6 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.6 }}
                      className="absolute right-4 top-1/2 -translate-y-1/2"
                    >
                      <AlertCircle className="w-5 h-5 text-red-500" />
                    </motion.div>
                  )}
                  {status === 'success' && (
                    <motion.div
                      key="success-icon"
                      initial={{ opacity: 0, scale: 0.6 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.6 }}
                      className="absolute right-4 top-1/2 -translate-y-1/2"
                    >
                      <CheckCircle2 className="w-5 h-5 text-[#C0392B]" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Error message */}
              <AnimatePresence>
                {status === 'error' && errorMsg && (
                  <motion.p
                    id="username-error"
                    role="alert"
                    initial={{ opacity: 0, height: 0, marginTop: 0 }}
                    animate={{ opacity: 1, height: 'auto', marginTop: 8 }}
                    exit={{ opacity: 0, height: 0, marginTop: 0 }}
                    transition={{ duration: 0.2 }}
                    className="text-sm font-medium text-red-600 pl-1"
                  >
                    {errorMsg}
                  </motion.p>
                )}
              </AnimatePresence>
            </motion.div>

            {/* CTA Button */}
            <motion.div variants={itemVariants}>
              <motion.button
                onClick={handleStart}
                disabled={isLoading || isSuccess}
                whileHover={!isLoading && !isSuccess ? { scale: 1.02, y: -1 } : {}}
                whileTap={!isLoading && !isSuccess ? { scale: 0.98 } : {}}
                className={cn(
                  'w-full flex items-center justify-center gap-3',
                  'py-4 px-6 rounded-2xl',
                  'text-white font-semibold text-base tracking-wide',
                  'transition-all duration-200',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C0392B] focus-visible:ring-offset-2',
                  isSuccess
                    ? 'bg-[#C0392B] cursor-default'
                    : 'bg-[#C0392B] hover:bg-[#922B21] disabled:opacity-70 disabled:cursor-not-allowed',
                )}
                style={{
                  boxShadow: isSuccess
                    ? '0 4px 24px rgba(1, 0, 0, 0.35)'
                    : '0 4px 24px rgba(192,57,43,0.4)',
                }}
                aria-busy={isLoading}
              >
                <AnimatePresence mode="wait">
                  {isLoading ? (
                    <motion.span
                      key="loading"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-2"
                    >
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Connecting…
                    </motion.span>
                  ) : isSuccess ? (
                    <motion.span
                      key="success"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-2"
                    >
                      <CheckCircle2 className="w-5 h-5" />
                      Let's go!
                    </motion.span>
                  ) : (
                    <motion.span
                      key="idle"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-2"
                    >
                      Start Challenge
                      <ArrowRight className="w-5 h-5" />
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
            </motion.div>
          </motion.div>

          {/* ── RIGHT: Card Image ── */}
          <motion.div
            variants={cardVariants}
            initial="hidden"
            animate="visible"
            className="flex-1 flex items-center justify-center lg:justify-end w-full max-w-md lg:max-w-lg"
            style={{ perspective: '1000px' }}
          >
            <motion.div
              onHoverStart={() => setIsCardHovered(true)}
              onHoverEnd={() => setIsCardHovered(false)}
              animate={
                isCardHovered
                  ? { rotateY: -6, rotateX: 4, scale: 1.03 }
                  : { rotateY: 0, rotateX: 0, scale: 1 }
              }
              transition={{ type: 'spring', stiffness: 200, damping: 20 }}
              className="relative w-full"
              style={{ transformStyle: 'preserve-3d' }}
            >
              {/* Glow behind card */}
              <motion.div
                animate={
                  isCardHovered
                    ? { opacity: 0.6, scale: 1.05 }
                    : { opacity: 0.3, scale: 1 }
                }
                transition={{ duration: 0.3 }}
                className="absolute inset-0 rounded-3xl blur-3xl"
                style={{
                  background:
                    'radial-gradient(ellipse, rgba(192,57,43,0.5) 0%, transparent 70%)',
                  transform: 'translateY(8px)',
                }}
              />

              <div className="relative w-full aspect-[1.586/1] rounded-3xl overflow-hidden shadow-2xl">
                <Image
                  src="/images/card.svg"
                  alt="VISA Card"
                  fill
                  sizes="(max-width: 1024px) 90vw, 42vw"
                  priority
                  className="object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
            </motion.div>
          </motion.div>

        </div>
      </div>
    </div>
  );
}