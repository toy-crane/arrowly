# Arrowly App Store 에셋

승인한 한국어·영어 스토어 이미지와 편집 가능한 제작 소스다. PNG는 2880 × 1800, 8-bit RGB이며 알파 채널이 없다.

## 파일

- `exports/ko/`, `exports/en/`: App Store Connect에 등록한 최종 PNG, 언어별 5장.
- `gallery.html`: 브라우저에서 열어 언어를 바꾸며 최종 PNG 확인.
- `overview.jpg`: 한국어 이미지 모아보기.
- `source/`: 발표 자료 SVG, 문구, 레이아웃, 앱 UI 복사본, PNG 내보내기 코드와 의존성 잠금 파일.
- `validation.json`: `exports/` 기준 이미지 규격.
- `SHA256SUMS.txt`: 최종 PNG 무결성 확인용 해시. 이 폴더에서 `shasum -a 256 -c SHA256SUMS.txt`로 확인한다.

순서는 핵심 강조 → 플로팅 마커 → 화살표와 도형 → 블랙보드 → 확대다.

## 재사용과 수정

이미지는 Arrowly의 실제 React UI·주석 렌더러·확대 레이어를 직접 만든 가상 발표 자료 위에 조합했다. 네이티브 데스크톱 촬영본은 아니다. 외부 웹페이지나 타사 발표 자료는 포함하지 않는다.

최종 PNG는 그대로 재사용할 수 있다. 다른 버전의 이미지를 만들 때는 이 날짜 폴더를 새 날짜 폴더로 복사해 수정한다. 내보내기는 해당 폴더의 `exports/`를 덮어쓴다.

`source/`에서 다음을 실행한다(macOS 권장: 시스템 글꼴 사용).

```sh
bun install --frozen-lockfile
bun run dev
```

`http://127.0.0.1:8768/`을 열고 장면 2를 선택한 뒤 플로팅 마커의 그리기 버튼을 눌러 속성 패널을 펼친다. 패널이 펼쳐진 것을 확인한 후 **10장 PNG 내보내기**를 누른다. 서버가 이미 이 포트를 사용 중이면 기존 제작 서버를 종료한 뒤 실행한다. PNG가 저장되면 `gallery.html`을 새로고침해 결과를 확인한다.

- 문구·장면 순서: `source/src/main.ts`
- 바깥 배경·타이포그래피: `source/index.html`
- 주석과 마커 배치: `source/src/scene.tsx`
- 슬라이드·차트·표 배경: `source/public/backgrounds/*.svg`
- 앱 UI 원본 revision과 파일별 해시: `source/app-source-manifest.json`

`source/src/app-source/`는 승인된 이미지 재생성을 위한 고정된 앱 소스 사본이다. 앱 기능의 현재 구현은 저장소 루트 `src/`가 소유한다. 앱 UI 변경을 이미지에 반영하려면 해당 복사본과 manifest를 함께 갱신하고 이미지 10장을 다시 확인한다. 설정 저장과 화면 캡처 IPC만 데모 어댑터로 교체되어 있다.

## 검증

저장소로 복사한 PNG 10장의 해시가 업로드 원본 및 App Store Connect의 체크섬과 일치한다. 언어별 5장 순서와 `COMPLETE` 상태, 2880 × 1800 RGB 형식을 확인했다. 원본 앱 UI 파일 14개의 해시도 일치하며 `source/`에서 `bun run build`가 통과했다.
