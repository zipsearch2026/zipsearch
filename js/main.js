/*
  main.js
  ------------------------------------------------------------
  '시작점(지휘자)'입니다. 페이지가 열리면 가장 먼저 실행되어
  다른 파일들(DataLoader, UI, ChartRenderer)을 순서대로 부립니다.

  [전체 흐름]
   1) DataLoader로 지역 목록을 읽는다.
   2) 전체 기간 라벨을 알아내려고 첫 지역 데이터를 한 번 읽는다.
   3) UI를 초기화한다. (지역 목록, 기간 드롭다운 등)
   4) 사용자가 무언가 바꿀 때마다 render()가 호출되어
      → 선택된 지역 데이터를 읽고 → 기간으로 자르고 → 차트를 그린다.

  [초보자 안내]
   - 실제 '무엇을 할지'의 큰 그림은 여기 있고,
     '어떻게 읽고/그리는지'의 세부는 각 담당 파일에 있습니다.
   - 그래서 데이터 방식이 바뀌면 dataLoader.js만,
     디자인이 바뀌면 chartRenderer.js/css만 고치면 됩니다.
  ------------------------------------------------------------
*/

// 지역별로 만든 Chart 객체를 보관 (다시 그릴 때 지우기 위해)
const activeCharts = {};

// 페이지가 준비되면 시작
document.addEventListener("DOMContentLoaded", init);

async function init() {
  try {
    // 1) 지역 목록 읽기
    const regions = await DataLoader.loadRegions();

    // 2) 전체 기간 라벨 파악 (아무 지역이나 하나 읽어 labels를 가져옴)
    const firstFile = regions[0].file;
    const sample = await DataLoader.loadRegionSeries("sale", firstFile);
    const allLabels = sample.labels; // ["2003-11", ..., "2026-06"]

    // 3) UI 초기화
    //    - render   : 지역/기간/지수가 바뀌면(데이터 재로드 필요) 실행
    //    - updateMA : 이동평균 토글만 바뀌면(데이터 그대로) 실행
    UI.init(regions, allLabels, render, updateMA);

    // 첫 화면은 아직 선택이 없으므로 안내문만 보입니다.
  } catch (err) {
    console.error(err);
    document.getElementById("region-list").innerHTML =
      `<p class="loading error">데이터를 불러오지 못했습니다. (${err.message})</p>`;
  }
}

/*
  화면을 다시 그리는 함수.
  UI 상태(state)가 바뀔 때마다 호출됩니다.
    state = { type, start, end, selected:[{name,file,hasJeonse}, ...] }
*/
async function render(state) {
  const grid = document.getElementById("charts-grid");
  const emptyState = document.getElementById("empty-state");

  // 선택된 지역이 없으면 안내문을 보이고 끝냄
  if (state.selected.length === 0) {
    emptyState.style.display = "";
    grid.innerHTML = "";
    // 남아있던 차트 객체 정리
    for (const key in activeCharts) {
      activeCharts[key].destroy();
      delete activeCharts[key];
    }
    return;
  }
  emptyState.style.display = "none";

  // 선택 개수에 따라 차트 배치를 자동 조절:
  //  - 1~2개: 1열로 크게 (few 클래스)
  //  - 3개 이상: 2열로 촘촘하게 (기본)
  if (state.selected.length <= 2) {
    grid.classList.add("is-few");
  } else {
    grid.classList.remove("is-few");
  }

  // 이번에 그릴 지역들의 파일명 목록
  const wantFiles = state.selected.map((r) => r.file);

  // (A) 더 이상 선택 안 된 지역의 차트/카드는 제거
  for (const key in activeCharts) {
    if (!wantFiles.includes(key)) {
      activeCharts[key].destroy();
      delete activeCharts[key];
      const card = document.getElementById("card-" + key);
      if (card) card.remove();
    }
  }

  // (B) 선택된 지역마다 카드+차트를 만들거나 갱신
  for (const region of state.selected) {
    // 전세인데 전세 데이터가 없는 지역은 건너뛰고 안내
    if (state.type === "jeonse" && region.hasJeonse === false) {
      const card = ensureCard(region, grid);
      // 기존 차트가 있으면 먼저 제거(캔버스를 안내문으로 교체하기 전에)
      if (activeCharts[region.file]) {
        activeCharts[region.file].destroy();
        delete activeCharts[region.file];
      }
      card.querySelector(".canvas-wrap").innerHTML =
        `<p class="no-data">이 지역은 전세 데이터가 없습니다.</p>`;
      continue;
    }

    // 데이터 읽기 → (전체 기간에서 MA 계산 후) 기간 자르기
    const series = await DataLoader.loadRegionSeries(state.type, region.file);
    const built = DataLoader.buildSeriesWithMA(series, state.start, state.end);
    // built = { labels, raw, ma3, ma6, ma12 }

    // 카드(제목+캔버스 자리) 준비. canvas를 직접 돌려받아 안전하게 사용.
    const card = ensureCard(region, grid);
    // 전세→매매 전환 등으로 '데이터 없음' 안내가 남아있으면 캔버스로 되돌림
    let canvas = card.querySelector("canvas");
    if (!canvas) {
      card.querySelector(".canvas-wrap").innerHTML = "<canvas></canvas>";
      canvas = card.querySelector("canvas");
    }

    // 이미 차트가 있으면 지우고 새로 그림(간단·안전)
    if (activeCharts[region.file]) {
      activeCharts[region.file].destroy();
    }

    // x축 '연도만 보이는' 라벨을 미리 계산해 넘김
    const xTicks = ChartRenderer.makeYearTicks(built.labels);

    activeCharts[region.file] = ChartRenderer.createChart(canvas, {
      labels: built.labels,
      raw: built.raw,
      ma3: built.ma3,
      ma6: built.ma6,
      ma12: built.ma12,
      type: state.type,
      regionName: region.name,
      showMA: state.showMA,   // 현재 토글 상태를 반영해 그림
      _xTicks: xTicks,
    });
  }
}

/*
  이동평균 토글만 바뀌었을 때 실행되는 함수.
  데이터는 그대로이므로 차트를 새로 만들지 않고,
  각 차트의 '선 보임/숨김'만 갱신합니다. (빠르고 부드러움)
*/
function updateMA(state) {
  for (const key in activeCharts) {
    ChartRenderer.updateVisibility(activeCharts[key], state.showMA);
  }
}

/*
  지역 카드(제목 + 차트 자리)가 없으면 새로 만들어 grid에 추가.
  이미 있으면 아무것도 안 함(제목의 지수 종류만 갱신).
*/
function ensureCard(region, grid) {
  const id = "card-" + region.file;
  let card = document.getElementById(id);
  if (!card) {
    card = document.createElement("div");
    card.className = "chart-card";
    card.id = id;
    card.innerHTML = `
      <div class="chart-card-head">
        <h3>${region.name}</h3>
      </div>
      <div class="canvas-wrap"><canvas></canvas></div>
    `;
    grid.appendChild(card);
  }
  return card; // 호출한 쪽이 이 카드 안에서 canvas를 바로 찾도록 반환
}
