/**
 * One-point-perspective gallery drawn in SVG (original artwork). The "photos"
 * are abstract gradients — clearly sample art, never user content.
 */
const VP = { w: 1200, h: 760, back: { x1: 380, x2: 820, y1: 180, y2: 500 } };

type Pt = [number, number];

/** Point on a side wall: s = depth (0 near … 1 at back wall), f = height (0 ceiling … 1 floor). */
function sidePoint(side: "left" | "right", s: number, f: number): Pt {
  const { x1, y1, y2 } = VP.back;
  const x = s * x1;
  const top = y1 * s;
  const bottom = VP.h - (VP.h - y2) * s;
  const y = top + f * (bottom - top);
  return side === "left" ? [x, y] : [VP.w - x, y];
}

function quad(side: "left" | "right", s1: number, s2: number, f1: number, f2: number): string {
  return [sidePoint(side, s1, f1), sidePoint(side, s2, f1), sidePoint(side, s2, f2), sidePoint(side, s1, f2)]
    .map((p) => p.map((n) => n.toFixed(1)).join(","))
    .join(" ");
}

function SideFrame({
  side,
  s1,
  s2,
  f1,
  f2,
  art,
  frame = "#2b2420",
}: {
  side: "left" | "right";
  s1: number;
  s2: number;
  f1: number;
  f2: number;
  art: string;
  frame?: string;
}) {
  const ds = (s2 - s1) * 0.09;
  const df = (f2 - f1) * 0.1;
  return (
    <g>
      <polygon points={quad(side, s1 - 0.004, s2 + 0.004, f1 - 0.012, f2 + 0.014)} fill="rgba(36,35,33,0.16)" />
      <polygon points={quad(side, s1, s2, f1, f2)} fill={frame} />
      <polygon points={quad(side, s1 + ds * 0.35, s2 - ds * 0.35, f1 + df * 0.35, f2 - df * 0.35)} fill="#f7f3ea" />
      <polygon points={quad(side, s1 + ds, s2 - ds, f1 + df, f2 - df)} fill={`url(#${art})`} />
    </g>
  );
}

export function GalleryIllustration({ className, animated = true }: { className?: string; animated?: boolean }) {
  const { x1, x2, y1, y2 } = VP.back;
  return (
    <svg
      viewBox={`0 0 ${VP.w} ${VP.h}`}
      className={className}
      role="img"
      aria-label="Illustration of a gallery hall with framed photographs and two visitors"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id="g-back" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#efe9df" />
          <stop offset="1" stopColor="#e3dccf" />
        </linearGradient>
        <linearGradient id="g-left" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#d8cfbf" />
          <stop offset="1" stopColor="#e6dfd2" />
        </linearGradient>
        <linearGradient id="g-right" x1="1" y1="0" x2="0" y2="0">
          <stop offset="0" stopColor="#d3c9b8" />
          <stop offset="1" stopColor="#e4ddcf" />
        </linearGradient>
        <linearGradient id="g-ceiling" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6f2eb" />
          <stop offset="1" stopColor="#ece6dc" />
        </linearGradient>
        <linearGradient id="g-floor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c9b89c" />
          <stop offset="1" stopColor="#a8936f" />
        </linearGradient>
        <linearGradient id="g-room2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f8f4ec" />
          <stop offset="1" stopColor="#ebe3d4" />
        </linearGradient>
        <radialGradient id="g-pool" cx="0.5" cy="0" r="1">
          <stop offset="0" stopColor="#ffe2a8" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffe2a8" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="g-floorlight" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff3d6" stopOpacity="0.5" />
          <stop offset="1" stopColor="#fff3d6" stopOpacity="0" />
        </radialGradient>
        {/* Sample art */}
        <linearGradient id="art-sunset" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f2b880" />
          <stop offset="0.55" stopColor="#d9786a" />
          <stop offset="1" stopColor="#5d4a6b" />
        </linearGradient>
        <linearGradient id="art-sea" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#bfd8d6" />
          <stop offset="0.5" stopColor="#5f8e98" />
          <stop offset="1" stopColor="#24465a" />
        </linearGradient>
        <linearGradient id="art-garden" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#dfe6c8" />
          <stop offset="0.6" stopColor="#7b927d" />
          <stop offset="1" stopColor="#3f5243" />
        </linearGradient>
        <linearGradient id="art-dune" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ecd2a5" />
          <stop offset="1" stopColor="#b98a52" />
        </linearGradient>
        <linearGradient id="art-night" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#30344a" />
          <stop offset="1" stopColor="#8a6f8c" />
        </linearGradient>
        <linearGradient id="sweep" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.16" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id="clip-door">
          <path d={`M548 ${y2} V350 a52 52 0 0 1 104 0 V${y2} Z`} />
        </clipPath>
      </defs>

      {/* Room shell */}
      <polygon points={`0,0 ${VP.w},0 ${x2},${y1} ${x1},${y1}`} fill="url(#g-ceiling)" />
      <polygon points={`${x1},${y2} ${x2},${y2} ${VP.w},${VP.h} 0,${VP.h}`} fill="url(#g-floor)" />
      <polygon points={`0,0 ${x1},${y1} ${x1},${y2} 0,${VP.h}`} fill="url(#g-left)" />
      <polygon points={`${VP.w},0 ${x2},${y1} ${x2},${y2} ${VP.w},${VP.h}`} fill="url(#g-right)" />
      <rect x={x1} y={y1} width={x2 - x1} height={y2 - y1} fill="url(#g-back)" />

      {/* Floor planks converging to the vanishing point */}
      <g stroke="#8f7a58" strokeOpacity="0.28" strokeWidth="1.2">
        {Array.from({ length: 15 }, (_, i) => {
          const bx = x1 + ((x2 - x1) * (i + 0.5)) / 15;
          const fx = ((bx - 600) / ((x2 - x1) / 2)) * 760 + 600;
          return <line key={i} x1={bx} y1={y2} x2={fx} y2={VP.h} />;
        })}
      </g>
      <ellipse cx="600" cy="640" rx="380" ry="70" fill="url(#g-floorlight)" />

      {/* Skylight strips */}
      <g fill="#fffaf0" opacity="0.9">
        <polygon points="470,40 560,40 575,140 520,140" />
        <polygon points="640,40 730,40 680,140 625,140" />
      </g>
      {/* Track lights */}
      <g fill="#c6a66a">
        {[0.25, 0.45, 0.65, 0.85].map((s) => (
          <circle key={`l${s}`} cx={s * x1 + 40 * (1 - s)} cy={y1 * s + 12} r={4 * (1.2 - s * 0.6)} />
        ))}
        {[0.25, 0.45, 0.65, 0.85].map((s) => (
          <circle key={`r${s}`} cx={VP.w - (s * x1 + 40 * (1 - s))} cy={y1 * s + 12} r={4 * (1.2 - s * 0.6)} />
        ))}
      </g>

      {/* Baseboards */}
      <polygon points={`0,${VP.h} ${x1},${y2} ${x1},${y2 - 8} 0,${VP.h - 22}`} fill="#4a3628" opacity="0.55" />
      <polygon points={`${VP.w},${VP.h} ${x2},${y2} ${x2},${y2 - 8} ${VP.w},${VP.h - 22}`} fill="#4a3628" opacity="0.5" />
      <rect x={x1} y={y2 - 8} width={x2 - x1} height="8" fill="#4a3628" opacity="0.45" />

      {/* Light pools on the walls */}
      <g className={animated ? "om-breathe" : undefined}>
        <polygon points={quad("left", 0.12, 0.5, 0.05, 0.68)} fill="url(#g-pool)" />
        <polygon points={quad("left", 0.55, 0.85, 0.12, 0.62)} fill="url(#g-pool)" />
        <polygon points={quad("right", 0.12, 0.5, 0.05, 0.68)} fill="url(#g-pool)" />
        <polygon points={quad("right", 0.55, 0.85, 0.12, 0.62)} fill="url(#g-pool)" />
        <ellipse cx="465" cy="300" rx="70" ry="110" fill="url(#g-pool)" />
        <ellipse cx="735" cy="300" rx="70" ry="110" fill="url(#g-pool)" />
      </g>

      {/* Side-wall frames */}
      <SideFrame side="left" s1={0.18} s2={0.45} f1={0.3} f2={0.58} art="art-sunset" />
      <SideFrame side="left" s1={0.6} s2={0.8} f1={0.33} f2={0.55} art="art-garden" frame="#c6a66a" />
      <SideFrame side="right" s1={0.18} s2={0.45} f1={0.28} f2={0.6} art="art-sea" frame="#f4efe6" />
      <SideFrame side="right" s1={0.6} s2={0.8} f1={0.34} f2={0.54} art="art-dune" />

      {/* Back wall: doorway to the next room, flanked by two frames */}
      <g clipPath="url(#clip-door)">
        <rect x="540" y="290" width="120" height="220" fill="url(#g-room2)" />
        <rect x="585" y="372" width="30" height="24" fill="#2b2420" />
        <rect x="588" y="375" width="24" height="18" fill="url(#art-night)" />
        <polygon points={`548,${y2} 652,${y2} 640,470 560,470`} fill="#c2b090" />
      </g>
      <path d={`M548 ${y2} V350 a52 52 0 0 1 104 0 V${y2}`} fill="none" stroke="#d2c8b6" strokeWidth="6" />
      <rect x="418" y="262" width="96" height="122" fill="#2b2420" />
      <rect x="425" y="269" width="82" height="108" fill="#f7f3ea" />
      <rect x="433" y="277" width="66" height="92" fill="url(#art-night)" />
      <rect x="686" y="270" width="98" height="108" fill="#c6a66a" />
      <rect x="692" y="276" width="86" height="96" fill="url(#art-dune)" />
      <rect x="452" y="398" width="28" height="9" rx="1.5" fill="#d9cfbd" />
      <rect x="721" y="392" width="28" height="9" rx="1.5" fill="#d9cfbd" />

      {/* Bench */}
      <g>
        <polygon points="505,590 695,590 718,612 482,612" fill="#5a4231" />
        <polygon points="482,612 718,612 718,620 482,620" fill="#3f2e22" />
        <rect x="498" y="620" width="10" height="34" fill="#3f2e22" />
        <rect x="692" y="620" width="10" height="34" fill="#3f2e22" />
        <ellipse cx="600" cy="660" rx="140" ry="9" fill="rgba(36,35,33,0.18)" />
      </g>

      {/* Two visitors, side by side */}
      <g>
        <ellipse cx="300" cy="686" rx="62" ry="10" fill="rgba(36,35,33,0.2)" />
        <g fill="#2f2c29">
          <circle cx="282" cy="507" r="17" />
          <path d="M260 534 q22 -12 44 0 l6 82 q-28 8 -56 0 z" />
          <rect x="266" y="610" width="10" height="74" rx="5" />
          <rect x="287" y="610" width="10" height="74" rx="5" />
        </g>
        <g fill="#7b927d">
          <circle cx="330" cy="515" r="15.5" />
          <path d="M310 540 q20 -11 40 0 l8 78 q-28 8 -56 0 z" />
          <rect x="316" y="612" width="9" height="72" rx="4.5" />
          <rect x="336" y="612" width="9" height="72" rx="4.5" />
        </g>
        <path d="M303 566 q12 10 14 2" stroke="#2f2c29" strokeWidth="6" strokeLinecap="round" fill="none" />
      </g>

      {animated && <rect className="om-sweep" x="-400" y="0" width="400" height={VP.h} fill="url(#sweep)" />}
      <style>{`
        .om-breathe { animation: om-breathe 6s ease-in-out infinite; }
        @keyframes om-breathe { 0%,100% { opacity: .85 } 50% { opacity: 1 } }
        .om-sweep { animation: om-sweep 9s ease-in-out infinite; }
        @keyframes om-sweep { 0% { transform: translateX(0) } 60%,100% { transform: translateX(1800px) } }
      `}</style>
    </svg>
  );
}
