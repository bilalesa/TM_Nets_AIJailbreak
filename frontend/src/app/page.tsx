export default function MaintenancePage() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '100vh', background: '#0a0a0a',
      color: '#fff', fontFamily: 'monospace', textAlign: 'center'
    }}>
      <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>🔒 System Offline</h1>
      <p style={{ color: '#888' }}>TM Nets AI Jailbreak — maintenance mode.</p>
      <p style={{ color: '#555', fontSize: '0.8rem', marginTop: '2rem' }}>Check back soon.</p>
    </div>
  );
}
