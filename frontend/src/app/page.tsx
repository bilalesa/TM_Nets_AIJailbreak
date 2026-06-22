export default function MaintenancePage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#050505',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Courier New', monospace",
      overflow: 'hidden',
      position: 'relative',
    }}>
      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes scanline {
          0% { transform: translateY(-100%) }
          100% { transform: translateY(100vh) }
        }
        @keyframes flicker {
          0%,19%,21%,23%,25%,54%,56%,100% { opacity:1 }
          20%,24%,55% { opacity:0.4 }
        }
        @keyframes glitch {
          0%,100% { clip-path: inset(0 0 100% 0) }
          10% { clip-path: inset(10% 0 60% 0); transform: translate(-2px) }
          20% { clip-path: inset(40% 0 30% 0); transform: translate(2px) }
          30% { clip-path: inset(70% 0 10% 0); transform: translate(-1px) }
          40% { clip-path: inset(0 0 100% 0) }
        }
      `}</style>

      {/* Scanline effect */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0,
        height: '2px', background: 'rgba(255,50,50,0.15)',
        animation: 'scanline 4s linear infinite', zIndex: 1, pointerEvents: 'none'
      }} />

      {/* Grid background */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0,
        backgroundImage: 'linear-gradient(rgba(255,40,40,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,40,40,0.03) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }} />

      <div style={{ position: 'relative', zIndex: 2, textAlign: 'center', padding: '2rem' }}>
        {/* Terminal header */}
        <div style={{
          color: '#ff3333', fontSize: '0.7rem', letterSpacing: '0.3em',
          marginBottom: '1rem', opacity: 0.7
        }}>
          SYSTEM STATUS: OFFLINE
        </div>

        {/* Main title */}
        <div style={{
          fontSize: 'clamp(2.5rem, 8vw, 5rem)',
          fontWeight: 900,
          color: '#fff',
          letterSpacing: '-0.02em',
          animation: 'flicker 6s infinite',
          marginBottom: '0.5rem',
          lineHeight: 1,
        }}>
          prompt<span style={{ color: '#ff3333' }}>break</span>
        </div>

        {/* Divider */}
        <div style={{
          width: '100%', height: '1px',
          background: 'linear-gradient(90deg, transparent, #ff3333, transparent)',
          margin: '1.5rem 0'
        }} />

        {/* Status message */}
        <div style={{ color: '#666', fontSize: '0.85rem', letterSpacing: '0.15em', marginBottom: '0.5rem' }}>
          MAINTENANCE IN PROGRESS
        </div>

        <div style={{ color: '#333', fontSize: '0.75rem', letterSpacing: '0.1em' }}>
          THE SYSTEM WILL RETURN
          <span style={{ animation: 'blink 1s infinite', marginLeft: '4px' }}>_</span>
        </div>

        {/* Bottom decorative line */}
        <div style={{
          marginTop: '3rem', color: '#1a1a1a',
          fontSize: '0.6rem', letterSpacing: '0.2em'
        }}>
          ████████████████████████████████████████
        </div>
      </div>
    </div>
  );
}
