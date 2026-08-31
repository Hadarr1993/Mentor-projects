import { useEffect, useRef, useState } from 'react';

/**
 * Desert sunset as atmosphere, not illustration.
 *
 * A low gradient band, a soft sun and two abstract dune layers. There is
 * deliberately no figure, no flickering flame and no twinkling stars — next
 * to a clean line-icon set those read as caricature. The identity is
 * carried by the typography instead.
 *
 * Everything is inline SVG: no external assets, so it renders offline and
 * there is nothing to license.
 */
export function SunsetHeader({ title, subtitle }) {
  const [collapsed, setCollapsed] = useState(false);
  const ticking = useRef(false);

  useEffect(() => {
    const onScroll = () => {
      if (ticking.current) return;
      ticking.current = true;
      requestAnimationFrame(() => {
        // Hysteresis, so a scroll hovering at the threshold doesn't flap.
        const y = window.scrollY;
        setCollapsed((c) => (c ? y > 60 : y > 110));
        ticking.current = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className="header"
      style={{
        // The band contracts as one continuous value rather than swapping
        // between two states.
        height: collapsed ? '5.5rem' : '11.5rem',
        transition: 'height 420ms cubic-bezier(0.22, 0.61, 0.36, 1)',
      }}
    >
      <svg
        className="header-svg"
        viewBox="0 0 800 240"
        preserveAspectRatio="xMidYMax slice"
        style={{ height: '100%' }}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#4A2A55" />
            <stop offset="32%"  stopColor="#6B3B6E" />
            <stop offset="58%"  stopColor="#D96A8A" />
            <stop offset="80%"  stopColor="#F2A65A" />
            <stop offset="100%" stopColor="#F7C58A" />
          </linearGradient>

          <radialGradient id="sunGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="#FFE9B8" stopOpacity="0.95" />
            <stop offset="45%"  stopColor="#FFC46B" stopOpacity="0.42" />
            <stop offset="100%" stopColor="#F2A65A" stopOpacity="0" />
          </radialGradient>

          <linearGradient id="sunBody" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#FFF0C4" />
            <stop offset="100%" stopColor="#FFB765" />
          </linearGradient>

          <linearGradient id="duneFar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#C4643C" />
            <stop offset="100%" stopColor="#A34E30" />
          </linearGradient>

          <linearGradient id="duneNear" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#7A3B2E" />
            <stop offset="100%" stopColor="#5A2A24" />
          </linearGradient>

          {/* Fine grain. Without it a gradient this wide shows banding. */}
          <filter id="grain" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="7" />
            <feColorMatrix type="saturate" values="0" />
            <feComponentTransfer><feFuncA type="linear" slope="0.055" /></feComponentTransfer>
            <feComposite operator="in" in2="SourceGraphic" />
          </filter>

          {/* The text sits over the brightest part of the sky; a soft scrim
              keeps it legible without a hard box behind it. */}
          <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#3A1428" stopOpacity="0" />
            <stop offset="100%" stopColor="#3A1428" stopOpacity="0.42" />
          </linearGradient>
        </defs>

        <rect width="800" height="240" fill="url(#sky)" />

        <circle cx="560" cy="150" r="120" fill="url(#sunGlow)" />
        <circle cx="560" cy="150" r="34"  fill="url(#sunBody)" />

        <path d="M0 168 C 120 140, 230 176, 340 164 C 470 150, 590 182, 800 158 L800 240 L0 240 Z"
              fill="url(#duneFar)" opacity="0.93" />
        <path d="M0 202 C 150 178, 280 210, 420 198 C 560 186, 680 214, 800 196 L800 240 L0 240 Z"
              fill="url(#duneNear)" />

        <rect width="800" height="240" fill="#fff" filter="url(#grain)" opacity="0.5" />
        <rect y="120" width="800" height="120" fill="url(#scrim)" />
      </svg>

      <div className="header-body">
        <div className="header-inner">
          <h1 className="header-title">{title}</h1>
          {!collapsed && subtitle && <div className="header-sub">{subtitle}</div>}
        </div>
      </div>
    </header>
  );
}

export default SunsetHeader;
