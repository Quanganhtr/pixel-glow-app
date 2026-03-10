import { useEffect, useRef, useState } from 'react';
import lottie from 'lottie-web';

export default function LottieTest() {
  const containerRef = useRef(null);
  const animRef = useRef(null);
  const [animData, setAnimData] = useState(null);
  const [buttonText, setButtonText] = useState('Click me');
  const [iconSize, setIconSize] = useState(32);
  const [isDragging, setIsDragging] = useState(false);
  const [bumping, setBumping] = useState(false);

  // Load animation whenever animData changes
  useEffect(() => {
    if (!animData || !containerRef.current) return;

    // Destroy previous instance
    if (animRef.current) {
      animRef.current.destroy();
      animRef.current = null;
    }

    const anim = lottie.loadAnimation({
      container: containerRef.current,
      animationData: animData,
      renderer: 'svg',
      loop: false,
      autoplay: false,
    });

    anim.addEventListener('DOMLoaded', () => {
      anim.goToAndStop(0, true);
    });

    anim.addEventListener('complete', () => {
      anim.goToAndStop(0, true);
    });

    animRef.current = anim;

    return () => {
      anim.destroy();
      animRef.current = null;
    };
  }, [animData]);

  const handleFileChange = (file) => {
    if (!file || !file.name.endsWith('.json')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        setAnimData(JSON.parse(e.target.result));
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

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    handleFileChange(file);
  };

  return (
    <div
      className="flex h-screen flex-col items-center justify-center gap-10 select-none"
      style={{ background: '#080808' }}
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

      {/* Drop zone / file picker */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${isDragging ? '#bf5af2' : '#2a2a2a'}`,
          borderRadius: 16, padding: '24px 40px',
          color: isDragging ? '#bf5af2' : '#444',
          fontSize: 14, cursor: 'pointer',
          transition: 'all 0.15s ease',
          textAlign: 'center',
        }}
        onClick={() => document.getElementById('lottie-file-input').click()}
      >
        {animData ? '✓ JSON loaded — drop another to replace' : 'Drop .json here or click to pick'}
        <input
          id="lottie-file-input"
          type="file"
          accept=".json"
          style={{ display: 'none' }}
          onChange={(e) => handleFileChange(e.target.files[0])}
        />
      </div>

      {/* Controls */}
      <div className="flex items-center gap-6">
        <label style={{ color: '#555', fontSize: 13 }}>
          Icon size
          <input
            type="range" min={16} max={80} step={4}
            value={iconSize}
            onChange={(e) => setIconSize(Number(e.target.value))}
            style={{ accentColor: '#bf5af2', marginLeft: 10, verticalAlign: 'middle' }}
          />
          <span style={{ color: '#888', fontFamily: 'monospace', marginLeft: 8 }}>{iconSize}px</span>
        </label>
        <label style={{ color: '#555', fontSize: 13 }}>
          Label
          <input
            value={buttonText}
            onChange={(e) => setButtonText(e.target.value)}
            style={{
              background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8,
              color: '#fff', padding: '4px 10px', fontSize: 13, marginLeft: 10,
              outline: 'none', width: 120,
            }}
          />
        </label>
      </div>

      {/* The preview button */}
      <button
        onClick={handleClick}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: '#000000', borderRadius: 999,
          padding: '16px 24px', border: '1px solid #ffffff',
          cursor: animData ? 'pointer' : 'default',
          opacity: animData ? 1 : 0.4,
          transform: bumping ? 'scale(0.92)' : 'scale(1)',
          transition: 'transform 0.15s ease',
        }}
      >
        {/* Label */}
        {buttonText && (
          <span style={{ color: '#fff', fontSize: 16, fontWeight: 600, whiteSpace: 'nowrap' }}>
            {buttonText}
          </span>
        )}
        {/* Lottie icon on the right */}
        <div
          ref={containerRef}
          style={{ width: iconSize, height: iconSize, flexShrink: 0, overflow: 'visible' }}
        />
      </button>

      <p style={{ color: '#333', fontSize: 12 }}>
        {animData ? 'Click the button to play the animation' : 'Load a .json file to preview'}
      </p>
    </div>
  );
}
