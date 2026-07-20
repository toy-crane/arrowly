import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

const SAFE_MARGIN = 6;
const INSPECTOR_GAP = 8;
const ARROW_HALF_SIZE = 4.5;

type PlacementInput = {
  anchorLeft: number;
  anchorWidth: number;
  markerTop: number;
  panelWidth: number;
  panelHeight: number;
  viewportWidth: number;
};

export function calculateToolInspectorPlacement({
  anchorLeft,
  anchorWidth,
  markerTop,
  panelWidth,
  panelHeight,
  viewportWidth,
}: PlacementInput) {
  const anchorCenter = anchorLeft + anchorWidth / 2;
  const rightmostPanelLeft = Math.max(SAFE_MARGIN, viewportWidth - panelWidth - SAFE_MARGIN);
  const panelLeft = Math.min(
    Math.max(anchorCenter - panelWidth / 2, SAFE_MARGIN),
    rightmostPanelLeft,
  );
  return {
    panelLeft,
    arrowLeft: anchorCenter - panelLeft - ARROW_HALF_SIZE,
    openBelow: markerTop - INSPECTOR_GAP - panelHeight < SAFE_MARGIN,
  };
}

type Props = {
  markerRef: RefObject<HTMLElement | null>;
  anchorRef: RefObject<HTMLElement | null>;
  ariaLabel: string;
  children: ReactNode;
};

export function ToolInspector({ markerRef, anchorRef, ariaLabel, children }: Props) {
  const [openBelow, setOpenBelow] = useState(false);
  const [viewportRevision, setViewportRevision] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const arrowRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const onResize = () => setViewportRevision((revision) => revision + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    const marker = markerRef.current;
    const anchor = anchorRef.current;
    const arrow = arrowRef.current;
    if (!panel || !marker || !anchor || !arrow) return;

    const markerRect = marker.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const placement = calculateToolInspectorPlacement({
      anchorLeft: anchorRect.left,
      anchorWidth: anchorRect.width,
      markerTop: markerRect.top,
      panelWidth: panelRect.width,
      panelHeight: panelRect.height,
      viewportWidth: window.innerWidth,
    });

    panel.style.left = `${placement.panelLeft - markerRect.left}px`;
    panel.style.transform = "none";
    arrow.style.left = `${placement.arrowLeft}px`;
    setOpenBelow((current) => (current === placement.openBelow ? current : placement.openBelow));
  }, [anchorRef, markerRef, viewportRevision, children]);

  return (
    <div
      ref={panelRef}
      role="group"
      aria-label={ariaLabel}
      style={{
        ...popover,
        ...(openBelow ? { top: "calc(100% + 8px)" } : { bottom: "calc(100% + 8px)" }),
      }}
    >
      <span
        ref={arrowRef}
        data-arrowly-inspector-arrow=""
        aria-hidden="true"
        style={{
          ...inspectorArrow,
          ...(openBelow ? inspectorArrowAbove : inspectorArrowBelow),
        }}
      />
      {children}
    </div>
  );
}

const popover: CSSProperties = {
  position: "absolute",
  left: "50%",
  transform: "translateX(-50%)",
  display: "grid",
  width: "max-content",
  padding: 8,
  gap: 4,
  borderRadius: 14,
  color: "#E8EAF0",
  background: "rgba(24,26,32,0.97)",
  border: "1px solid rgba(255,255,255,0.14)",
  boxShadow: "0 4px 18px rgba(0,0,0,0.35)",
  boxSizing: "border-box",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif",
};

const inspectorArrow: CSSProperties = {
  position: "absolute",
  width: 9,
  height: 9,
  background: "rgba(24,26,32,0.97)",
};

const inspectorArrowBelow: CSSProperties = {
  bottom: -5,
  borderRight: "1px solid rgba(255,255,255,0.14)",
  borderBottom: "1px solid rgba(255,255,255,0.14)",
  transform: "rotate(45deg)",
};

const inspectorArrowAbove: CSSProperties = {
  top: -5,
  borderRight: "1px solid rgba(255,255,255,0.14)",
  borderBottom: "1px solid rgba(255,255,255,0.14)",
  transform: "rotate(225deg)",
};
