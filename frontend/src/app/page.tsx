'use client';
 
import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Loader2, CheckCircle2 } from 'lucide-react';
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
 
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUsername(e.target.value);
    if (status === 'error') {
      setStatus('idle');
      setErrorMsg('');
    }
  };
 
  const handleStart = async () => {
    const trimmed = username.trim();
 
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
 
          {/* ── LEFT: Copy + Form ── */}
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
 
            {/* Input */}
            <motion.div variants={itemVariants} className="mb-4">
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
                    className="text-sm font-medium text-red-400 pl-1 max-w-md"
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
                      Let&apos;s go!
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
        </div>
      </div>
    </div>
  );
}