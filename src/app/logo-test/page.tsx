import { AnimatedLogo } from '@/components/AnimatedLogo';

export default function LogoTestPage() {
  return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      flexDirection: 'column',
      justifyContent: 'center', 
      alignItems: 'center', 
      background: '#333' // Dark background to check transparency
    }}>
      <h1 style={{ color: 'white', marginBottom: '2rem' }}>Animated Logo Test</h1>
      <AnimatedLogo />
      
      <div style={{ marginTop: '2rem', color: '#ccc' }}>
        <p>Notes:</p>
        <ul>
          <li>Stick should be rigid (left side).</li>
          <li>Flags should flap (right side).</li>
          <li>Animation should be subtle but visible.</li>
        </ul>
      </div>
    </div>
  );
}
