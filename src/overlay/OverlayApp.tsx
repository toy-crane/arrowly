import { DEFAULT_COLOR, DEFAULT_WIDTH } from "../shared/constants";
import { DrawingCanvas } from "./DrawingCanvas";

export function OverlayApp() {
  // 색·굵기 변경 UI는 M5 플로팅 마커에서 붙는다
  return <DrawingCanvas color={DEFAULT_COLOR} widthKey={DEFAULT_WIDTH} />;
}
