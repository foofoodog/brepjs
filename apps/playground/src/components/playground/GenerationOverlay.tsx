import { useEffect, useState } from 'react';
import { usePlaygroundStore } from '../../stores/playgroundStore';

/**
 * Elegant generation indicator shown over the 3D viewer when geometry
 * recomputation takes noticeable time (>180ms). Fast parameter updates swap
 * seamlessly without flashing this scrim, preventing jarring blinks.
 */
export default function GenerationOverlay() {
  const isRunning = usePlaygroundStore((s) => s.isRunning);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isRunning) {
      setVisible(false);
      return;
    }
    // Delay showing overlay to avoid flicker on sub-200ms updates
    const timer = setTimeout(() => {
      setVisible(true);
    }, 180);
    return () => clearTimeout(timer);
  }, [isRunning]);

  if (!visible) return null;

  return (
    <div
      className="gen-overlay pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-gray-950/25 backdrop-blur-[1px]"
      aria-hidden="true"
    >
      {/* Isometric wireframe cube: hexagon silhouette + three edges to the front corner. */}
      <svg className="gen-cube h-16 w-16" viewBox="0 0 100 100" fill="none">
        <path
          d="M50 78 L74.2 64 L74.2 36 L50 22 L25.8 36 L25.8 64 Z"
          stroke="#4acecc"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <line x1="50" y1="50" x2="50" y2="78" stroke="#4acecc" strokeWidth="2.2" />
        <line x1="50" y1="50" x2="74.2" y2="36" stroke="#4acecc" strokeWidth="2.2" />
        <line x1="50" y1="50" x2="25.8" y2="36" stroke="#4acecc" strokeWidth="2.2" />
      </svg>
      <span className="animate-pulse text-xs font-medium tracking-wide text-teal-primary/90">
        Generating…
      </span>
    </div>
  );
}
