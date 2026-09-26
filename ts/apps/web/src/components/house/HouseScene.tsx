import { memo, type Ref } from "react";
import { ATTIC, DOOR, INK, WINDOW, type AnyHouseStory, type SceneFrame } from "./scene";

// The stage: bare trees and a house with the lights on, fading up into the
// sidebar. A story (see stories/) draws its characters into two layers:
// inside the windows, and outdoors.

export function HouseScene({
  story,
  frame,
  ref,
}: {
  story: AnyHouseStory;
  frame: SceneFrame;
  ref?: Ref<HTMLDivElement>;
}) {
  const { Inside, Outside } = story;
  return (
    <div className="sb-scene" aria-hidden="true" ref={ref}>
      <svg viewBox="0 0 400 320" preserveAspectRatio="xMidYMax slice">
        <Backdrop />
        <Lights door={frame.door} />
        <g data-layer="inside">{Inside && <Inside frame={frame} />}</g>
        <Foreground />
        <g data-layer="outside">{Outside && <Outside frame={frame} />}</g>
        <NearTrees />
      </svg>
    </div>
  );
}

const Backdrop = memo(function Backdrop() {
  const far = { stroke: "#1d1616", fill: "none", strokeLinecap: "round" } as const;
  return (
    <>
      <defs>
        <radialGradient id="sb-sky" cx="55%" cy="80%" r="65%">
          <stop offset="0" stopColor="#8f1d1d" stopOpacity="0.55" />
          <stop offset="0.5" stopColor="#3a0c0c" stopOpacity="0.35" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="sb-fog" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.6" stopColor="#d9c9c9" stopOpacity="0.07" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <filter id="sb-glow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <clipPath id="sb-window">
          <rect x={WINDOW.x} y={WINDOW.y} width={WINDOW.width} height={WINDOW.height} />
        </clipPath>
        <clipPath id="sb-attic">
          <rect x={ATTIC.x} y={ATTIC.y} width={ATTIC.width} height={ATTIC.height} />
        </clipPath>
        <filter id="sb-eye-glow" x="-200%" y="-200%" width="500%" height="500%">
          <feGaussianBlur stdDeviation="0.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <rect width="400" height="320" fill="url(#sb-sky)" />

      {/* Distant trees */}
      <g {...far}>
        <path d="M122 300C121 260 126 230 120 190M121 240C108 226 102 214 98 198M122 222C136 206 142 196 146 180M120 205C112 190 114 178 108 166" strokeWidth="3" />
        <path d="M300 300C302 262 296 236 304 196M302 244C316 230 322 216 330 204M300 226C288 212 284 200 280 186M304 206C310 192 308 182 316 170" strokeWidth="3" />
        <path d="M160 296C160 270 164 252 160 230M161 258C150 248 146 240 142 230M162 250C172 240 176 232 178 222" strokeWidth="2" />
        <path d="M338 296C338 268 334 250 340 226M339 256C350 246 354 236 358 226M338 248C328 238 326 230 322 220" strokeWidth="2" />
      </g>

      {/* Fog */}
      <rect y="220" width="400" height="90" fill="url(#sb-fog)" />

      {/* House */}
      <g fill={INK}>
        <rect x="176" y="236" width="90" height="56" />
        <path d="M168 240 221 196 274 240Z" />
        <path d="M228 254 252 228 278 254Z" />
        <rect x="244" y="198" width="10" height="28" />
        <rect x="240" y="252" width="36" height="40" />
      </g>
    </>
  );
});

function Lights({ door }: { door: number }) {
  return (
    <g fill="#ff3b30" filter="url(#sb-glow)">
      <rect x="188" y="248" width="11" height="14" />
      <rect x={WINDOW.x} y={WINDOW.y} width={WINDOW.width} height={WINDOW.height} />
      <rect x={ATTIC.x} y={ATTIC.y} width={ATTIC.width} height={ATTIC.height} />
      <rect x="251" y="262" width="10" height="12" />
      {/* The open doorway; it narrows to nothing as the door swings shut. */}
      <rect
        data-part="door-light"
        x={DOOR.left}
        y={DOOR.top}
        width={DOOR.width * door}
        height={DOOR.height}
        opacity="0.6"
      />
    </g>
  );
}

const Foreground = memo(function Foreground() {
  return (
    <>
      {/* Window bars, drawn over anyone looking out */}
      <g data-part="window-bars" stroke={INK} strokeWidth="1.5">
        <path d="M193.5 248v14M188 255h11M211.5 248v14M206 255h11M256 262v12" />
      </g>

      {/* Ground and path */}
      <path d="M0 296C80 280 160 292 222 290 290 288 340 276 400 286V320H0Z" fill="#030202" />
      <path d="M150 322C176 308 206 298 231 293" stroke="#fff" strokeOpacity="0.05" strokeWidth="12" fill="none" />
    </>
  );
});

const NearTrees = memo(function NearTrees() {
  const near = { stroke: INK, fill: "none", strokeLinecap: "round" } as const;
  return (
    <g data-part="near-trees" {...near}>
      <path d="M34 322C40 270 30 226 44 170" strokeWidth="10" />
      <path d="M42 206C66 186 88 174 118 140M42 234C20 214 8 196-8 190M44 178C52 146 46 124 60 96M60 96C70 80 80 74 98 58M56 126C38 106 30 98 18 72M92 164C102 150 118 148 132 122M118 140C130 132 140 132 152 120M18 72C12 60 4 54-6 50" strokeWidth="4" />
      <path d="M98 58C104 48 108 40 112 28M78 74C74 62 70 54 62 46M132 122C138 110 142 104 150 98M30 98C20 94 12 94 2 98M8 196C0 184-2 176-6 166M66 186C70 176 76 170 86 166" strokeWidth="1.8" />
      <path d="M372 322C366 272 376 232 360 176" strokeWidth="11" />
      <path d="M364 212C340 190 320 180 292 150M364 240C386 222 398 206 412 200M360 182C354 150 360 128 346 100M346 100C336 84 326 78 308 64M350 130C368 110 376 102 388 78M314 168C304 154 290 150 276 126M292 150C280 142 270 142 258 130" strokeWidth="4" />
      <path d="M308 64C302 54 298 46 294 34M328 80C332 68 336 60 344 52M276 126C270 114 266 108 258 102M376 102C388 98 396 98 406 102M340 190C336 180 330 174 320 170" strokeWidth="1.8" />
    </g>
  );
});
