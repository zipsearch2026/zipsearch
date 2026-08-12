# 한국 부동산 가격지수 뷰어

한국부동산원 매매·전세 가격지수(원자료, 월별)를 지역별 개별 차트로 보여주는 정적 웹사이트입니다.
서버·데이터베이스 없이 동작하며, GitHub Pages 같은 무료 호스팅에 그대로 올릴 수 있습니다.

## 폴더 구조

```
site/
├── index.html              메인 화면 (하나뿐인 페이지)
├── css/
│   └── style.css           화면 디자인
├── js/
│   ├── main.js             전체 흐름 지휘 (시작점)
│   ├── dataLoader.js       JSON 데이터 읽기 담당
│   ├── chartRenderer.js    Chart.js로 차트 그리기 담당
│   └── ui.js               지역 선택·기간 등 화면 조작 담당
├── data/
│   ├── regions.json        지역 목록 (한글 이름 + 영문 파일명)
│   ├── sale/               매매가격지수 (region_001.json ~)
│   └── jeonse/             전세가격지수 (region_001.json ~)
└── convert_csv_to_json.py  CSV → JSON 변환 도구 (데이터 갱신용)
```

## 로컬에서 실행하기

브라우저에서 `index.html`을 그냥 열면 데이터(JSON)를 못 읽을 수 있습니다.
(브라우저 보안 정책 때문) 아래처럼 간단한 웹서버를 띄워 여세요.

```bash
cd site
python3 -m http.server 8000
# 브라우저에서 http://localhost:8000 접속
```

## GitHub Pages에 올리기

1. GitHub에 새 저장소를 만들고 `site/` 안의 파일들을 올립니다.
   (index.html이 저장소 최상단에 오도록)
2. 저장소 Settings → Pages → Branch를 `main` / `/(root)`로 지정하고 저장.
3. 잠시 뒤 `https://<사용자명>.github.io/<저장소명>/` 으로 접속됩니다.

Chart.js는 인터넷 CDN에서 불러오므로 별도 설치가 필요 없습니다.

## 데이터 갱신하기

한국부동산원에서 최신 CSV(매매/전세)를 받은 뒤:

```bash
# CSV 2개와 convert_csv_to_json.py를 같은 폴더에 두고
python3 convert_csv_to_json.py
# 새로 만들어진 data/ 폴더를 site/data/ 에 덮어쓰기
```

CSV 파일명이 다르면 `convert_csv_to_json.py` 위쪽 `INPUT_FILES` 값을 바꿔주세요.

## 나중에 API 자동화로 바꿀 때

데이터를 API로 실시간으로 받고 싶으면 **`js/dataLoader.js` 한 파일만** 고치면 됩니다.
`loadRegions` / `loadRegionSeries`가 돌려주는 데이터 모양(`labels`, `values`)만
지금과 똑같이 유지하면, 나머지 파일(main·chartRenderer·ui)은 손대지 않아도 됩니다.

## 데이터 출처

한국부동산원 주택가격동향조사 — 매매·전세 가격지수(원자료).
기간: 2003년 11월 ~ 2026년 6월 (월별).
