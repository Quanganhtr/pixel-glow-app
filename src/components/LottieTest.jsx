import { useEffect, useRef, useState } from 'react';
import lottie from 'lottie-web';

export default function LottieTest() {
  const containerRef = useRef(null);
  const animRef = useRef(null);
  const [animDataDark, setAnimDataDark] = useState(null);
  const [animDataLight, setAnimDataLight] = useState(null);
  const [buttonText, setButtonText] = useState('Click me');
  const [iconSize, setIconSize] = useState(32);
  const [isDraggingDark, setIsDraggingDark] = useState(false);
  const [isDraggingLight, setIsDraggingLight] = useState(false);
  const [bumping, setBumping] = useState(false);
  const [dark, setDark] = useState(false);

  const activeAnimData = dark ? animDataDark : animDataLight;

  // Reload animation when active slot changes (mode switch or new file)
  useEffect(() => {
    if (animRef.current) {
      animRef.current.destroy();
      animRef.current = null;
    }
    if (!activeAnimData || !containerRef.current) return;

    const anim = lottie.loadAnimation({
      container: containerRef.current,
      animationData: activeAnimData,
      renderer: 'svg',
      loop: false,
      autoplay: false,
    });

    anim.addEventListener('DOMLoaded', () => anim.goToAndStop(0, true));
    anim.addEventListener('complete', () => anim.goToAndStop(0, true));
    animRef.current = anim;

    return () => {
      anim.destroy();
      animRef.current = null;
    };
  }, [activeAnimData]);

  const handleFileChange = (file, forDark) => {
    if (!file || !file.name.endsWith('.json')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (forDark) setAnimDataDark(data);
        else setAnimDataLight(data);
      } catch {
        alert('Invalid JSON file');
      }
    };
    reader.readAsText(file);
  };

  const handleClick = () => {
    if (!animRef.current) return;
    animRef.current.stop();
    animRef.current.play();
    setBumping(true);
    setTimeout(() => setBumping(false), 200);
  };

  const DropZone = ({ forDark, isDragging, setIsDragging }) => {
    const loaded = forDark ? animDataDark : animDataLight;
    const inputId = forDark ? 'lottie-input-dark' : 'lottie-input-light';
    const isActive = dark === forDark;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 11, color: isActive ? (dark ? '#bf5af2' : '#888') : '#aaa', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' }}>
          {forDark ? '☾ Dark bg' : '☀ Light bg'}
        </span>
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFileChange(e.dataTransfer.files[0], forDark); }}
          onClick={() => document.getElementById(inputId).click()}
          style={{
            border: `2px dashed ${isDragging ? '#bf5af2' : isActive ? '#555' : '#ccc'}`,
            borderRadius: 12, padding: '14px 24px',
            color: isDragging ? '#bf5af2' : isActive ? '#555' : '#aaa',
            fontSize: 12, cursor: 'pointer',
            transition: 'all 0.15s ease', textAlign: 'center',
            minWidth: 160,
          }}
        >
          {loaded ? '✓ Loaded' : 'Drop .json or click'}
          <input id={inputId} type="file" accept=".json" style={{ display: 'none' }}
            onChange={(e) => handleFileChange(e.target.files[0], forDark)} />
        </div>
      </div>
    );
  };

  return (
    <div
      className="flex h-screen flex-col items-center justify-center gap-10 select-none"
      style={{
        background: dark ? '#0a0a0a' : '#ffffff',
        backgroundImage: `radial-gradient(circle, ${dark ? '#2a2a2a' : '#d0d0d0'} 1px, transparent 1px)`,
        backgroundSize: '24px 24px',
        transition: 'background 0.2s ease',
      }}
    >
      {/* Back button */}
      <button
        onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: 'editor' }))}
        style={{
          position: 'fixed', top: 16, left: 16,
          background: '#1e1e1e', border: '1px solid #2a2a2a',
          color: '#888', borderRadius: 10, padding: '6px 14px',
          fontSize: 13, cursor: 'pointer',
        }}
      >
        ← Editor
      </button>

      {/* Dark mode toggle */}
      <button
        onClick={() => setDark(d => !d)}
        style={{
          position: 'fixed', top: 16, right: 16,
          background: dark ? '#1e1e1e' : '#f0f0f0',
          border: `1px solid ${dark ? '#2a2a2a' : '#ddd'}`,
          color: dark ? '#888' : '#555',
          borderRadius: 10, padding: '6px 14px',
          fontSize: 13, cursor: 'pointer',
          transition: 'all 0.2s ease',
        }}
      >
        {dark ? '☀ Light' : '☾ Dark'}
      </button>

      {/* Two drop zones side by side */}
      <div style={{ display: 'flex', gap: 16 }}>
        <DropZone forDark={true} isDragging={isDraggingDark} setIsDragging={setIsDraggingDark} />
        <DropZone forDark={false} isDragging={isDraggingLight} setIsDragging={setIsDraggingLight} />
      </div>

      {/* Controls */}
      <div className="flex items-center gap-6">
        <label style={{ color: dark ? '#555' : '#666', fontSize: 13 }}>
          Icon size
          <input
            type="range" min={16} max={80} step={4}
            value={iconSize}
            onChange={(e) => setIconSize(Number(e.target.value))}
            style={{ accentColor: '#bf5af2', marginLeft: 10, verticalAlign: 'middle' }}
          />
          <span style={{ color: '#888', fontFamily: 'monospace', marginLeft: 8 }}>{iconSize}px</span>
        </label>
        <label style={{ color: dark ? '#555' : '#666', fontSize: 13 }}>
          Label
          <input
            value={buttonText}
            onChange={(e) => setButtonText(e.target.value)}
            style={{
              background: dark ? '#1a1a1a' : '#f0f0f0',
              border: `1px solid ${dark ? '#2a2a2a' : '#ddd'}`, borderRadius: 8,
              color: dark ? '#fff' : '#111', padding: '4px 10px', fontSize: 13, marginLeft: 10,
              outline: 'none', width: 120,
            }}
          />
        </label>
      </div>

      {/* The preview button */}
      <button
        onClick={handleClick}
        style={{
          display: 'flex', alignItems: 'center', gap: Math.max(4, iconSize - 26),
          background: dark ? '#ffffff' : '#000000', borderRadius: 999,
          padding: `${iconSize - 16}px ${iconSize - 8}px`, border: `1px solid ${dark ? '#000000' : '#ffffff'}`,
          cursor: activeAnimData ? 'pointer' : 'default',
          opacity: activeAnimData ? 1 : 0.4,
          transform: bumping ? 'scale(0.92)' : 'scale(1)',
          transition: 'transform 0.15s ease',
        }}
      >
        {buttonText && (
          <span style={{ color: dark ? '#000000' : '#ffffff', fontSize: iconSize - 16, fontWeight: 600, whiteSpace: 'nowrap', fontFamily: "'Jersey 25', sans-serif" }}>
            {buttonText}
          </span>
        )}
        <div
          ref={containerRef}
          style={{ width: iconSize, height: iconSize, flexShrink: 0, overflow: 'visible' }}
        />
      </button>

      <p style={{ color: dark ? '#444' : '#999', fontSize: 12 }}>
        {activeAnimData ? 'Click the button to play the animation' : `Load a ${dark ? 'dark' : 'light'} bg .json file to preview`}
      </p>
    </div>
  );
}
