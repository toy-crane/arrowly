import {
  forwardRef,
  type CSSProperties,
  useImperativeHandle,
  useRef,
} from "react";
import type { Point } from "../shared/drawing";

const PARTICLE_COUNT = 8;
const RADIUS_PX = 34;
const DURATION_MS = 500;
const TRAVEL_OFFSET = 0.4;

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

      const particles = Array.from({ length: PARTICLE_COUNT }, () => {
        const particle = document.createElement("i");
        Object.assign(particle.style, particleStyle);
        burst.append(particle);
        return particle;
      });
      layer.append(burst);

      const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
      const animations: Animation[] = [];
      if (reducedMotion) {
        particles.slice(1).forEach((particle) => particle.remove());
        animations.push(particles[0].animate(
          [
            { transform: "scale(.45)", opacity: 0 },
            { transform: "scale(1)", opacity: 1, offset: 0.25 },
            { transform: "scale(.8)", opacity: 0 },
          ],
          { duration: 150, easing: "ease-out", fill: "forwards" },
        ));
      } else {
        const rotationOffset = (sequence * 17) % 45;
        particles.forEach((particle, index) => {
          const angle = rotationOffset + index * 45;
          const radians = angle * Math.PI / 180;
          const radiusScale = 0.94 + ((sequence + index * 2) % 5) * 0.03;
          const dx = Math.cos(radians) * RADIUS_PX * radiusScale;
          const dy = Math.sin(radians) * RADIUS_PX * radiusScale;
          const rotation = 45 + rotationOffset;
          animations.push(particle.animate(
            [
              { transform: "translate(0px, 0px) rotate(45deg) scale(.25)", opacity: 0 },
              { opacity: 1, offset: 0.1 },
              {
                transform: `translate(${dx}px, ${dy}px) rotate(${rotation}deg) scale(.9)`,
                opacity: 0.95,
                offset: TRAVEL_OFFSET,
              },
              {
                transform: `translate(${dx}px, ${dy}px) rotate(${rotation}deg) scale(.62)`,
                opacity: 0,
              },
            ],
            {
              duration: DURATION_MS,
              easing: "cubic-bezier(.12,.72,.25,1)",
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

const particleStyle: CSSProperties = {
  position: "absolute",
  left: -3.5,
  top: -3.5,
  width: 7,
  height: 7,
  display: "block",
  background: "#FFD400",
  borderRadius: 1,
  boxShadow: "0 0 5px rgba(255,212,0,.45)",
};
