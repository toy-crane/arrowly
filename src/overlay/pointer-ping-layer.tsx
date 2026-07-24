import {
  forwardRef,
  type CSSProperties,
  useImperativeHandle,
  useRef,
} from "react";
import type { Point } from "../shared/drawing";

const MAX_RADIUS_PX = 16;
const RING_DIAMETER_PX = MAX_RADIUS_PX * 2;
const CENTER_DOT_DIAMETER_PX = 6;
const DURATION_MS = 560;
const CENTER_DOT_DURATION_MS = 340;

type RingConfig = {
  endScale: number;
  delayMs: number;
  peakOpacity: number;
};

// 바깥 링은 즉시, 안쪽 링은 조금 늦게 출발해 더 작은 반경에서 멈춘다.
const RINGS: RingConfig[] = [
  { endScale: 1, delayMs: 0, peakOpacity: 0.65 },
  { endScale: 0.72, delayMs: 110, peakOpacity: 0.5 },
];

export type PointerPingLayerHandle = {
  pingAt: (point: Point) => void;
};

export const PointerPingLayer = forwardRef<PointerPingLayerHandle>(function PointerPingLayer(_, ref) {
  const layerRef = useRef<HTMLDivElement>(null);
  const sequenceRef = useRef(0);

  useImperativeHandle(ref, () => ({
    pingAt(point) {
      const layer = layerRef.current;
      if (!layer) return;
      const sequence = sequenceRef.current++;
      const burst = document.createElement("span");
      burst.dataset.pointerPing = String(sequence);
      Object.assign(burst.style, burstStyle, {
        left: `${point.x}px`,
        top: `${point.y}px`,
      });
      layer.append(burst);

      const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
      const animations: Animation[] = [];

      if (reducedMotion) {
        const dot = document.createElement("i");
        Object.assign(dot.style, dotStyle);
        burst.append(dot);
        animations.push(dot.animate(
          [
            { opacity: 0 },
            { opacity: 1, offset: 0.35 },
            { opacity: 0 },
          ],
          { duration: 150, easing: "ease-out", fill: "forwards" },
        ));
      } else {
        // 클릭한 지점을 짧게 표시하는 중심 점. 링보다 먼저 최대 밝기에 닿아야
        // 파문이 발원점에서 나온 것으로 읽힌다.
        const dot = document.createElement("i");
        Object.assign(dot.style, dotStyle);
        burst.append(dot);
        animations.push(dot.animate(
          [
            { transform: "scale(.4)", opacity: 0 },
            { transform: "scale(1)", opacity: 1, offset: 0.12 },
            { transform: "scale(.5)", opacity: 0 },
          ],
          { duration: CENTER_DOT_DURATION_MS, easing: "ease-out", fill: "forwards" },
        ));

        // 같은 자리를 겹쳐 찍어도 리플끼리 구분되도록 반경만 소폭 달리한다.
        const radiusScale = 0.9 + ((sequence * 3) % 5) * 0.05;
        RINGS.forEach((config) => {
          const ring = document.createElement("i");
          Object.assign(ring.style, ringStyle);
          burst.append(ring);
          const endScale = config.endScale * radiusScale;
          animations.push(ring.animate(
            [
              // 반경 0에서 출발해 중심 점의 가장자리를 벗어나는 순간 최대 밝기가 된다.
              // scale .2 = 반경 3.2px = 중심 점 반지름. 그 전 구간은 점에 가려 보이지 않는다.
              { transform: "scale(.05)", opacity: 0 },
              { transform: "scale(.2)", opacity: config.peakOpacity, offset: 0.08 },
              { transform: `scale(${endScale})`, opacity: 0 },
            ],
            {
              duration: DURATION_MS - config.delayMs,
              delay: config.delayMs,
              easing: "cubic-bezier(.16,.65,.3,1)",
              fill: "forwards",
            },
          ));
        });
      }

      void Promise.all(animations.map((animation) => animation.finished.catch(() => undefined)))
        .then(() => burst.remove());
    },
  }), []);

  return <div ref={layerRef} data-pointer-ping-layer="" style={layerStyle} />;
});

const layerStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  pointerEvents: "none",
  overflow: "hidden",
};

const burstStyle: CSSProperties = {
  position: "absolute",
  width: 0,
  height: 0,
  pointerEvents: "none",
};

// 클릭한 지점을 짧게 찍는 채워진 중심 점.
const dotStyle: CSSProperties = {
  position: "absolute",
  left: `${-CENTER_DOT_DIAMETER_PX / 2}px`,
  top: `${-CENTER_DOT_DIAMETER_PX / 2}px`,
  width: `${CENTER_DOT_DIAMETER_PX}px`,
  height: `${CENTER_DOT_DIAMETER_PX}px`,
  borderRadius: "50%",
  background: "#FFD400",
  boxShadow: "0 0 6px rgba(255,212,0,.7)",
  opacity: 0,
  filter: "drop-shadow(0 0 1px rgba(24,26,32,.4))",
  pointerEvents: "none",
};

// 테두리만 있는 빈 링은 중심 점 둘레로 퍼진다.
const ringStyle: CSSProperties = {
  position: "absolute",
  left: `${-MAX_RADIUS_PX}px`,
  top: `${-MAX_RADIUS_PX}px`,
  width: `${RING_DIAMETER_PX}px`,
  height: `${RING_DIAMETER_PX}px`,
  boxSizing: "border-box",
  border: "2px solid #FFD400",
  borderRadius: "50%",
  background: "transparent",
  opacity: 0,
  filter: "drop-shadow(0 0 1px rgba(24,26,32,.4))",
  pointerEvents: "none",
};
