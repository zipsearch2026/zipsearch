/*
  chartRenderer.js
  ------------------------------------------------------------
  'Chart.js로 차트를 그리는 일'만 담당하는 파일입니다.
  데이터를 어디서 가져왔는지는 신경 쓰지 않고,
  넘겨받은 { labels, values } 를 예쁜 선 그래프로 그립니다.

  [초보자 안내]
   - 업로드해 주신 안양시 동안구 차트처럼:
       · 선 아래를 옅게 채우고(fill)
       · 점(마커)은 숨기고
       · x축은 '연도'만 드문드문 보이게
     설정했습니다.

  [제공하는 기능]
   - createChart(canvas, config) : 새 차트를 만들어 반환
   - 색상은 지수 종류에 따라 다르게(매매=청록, 전세=호박색)

  전역 객체 ChartRenderer 에 담아 다른 파일이 사용합니다.
  ------------------------------------------------------------
*/

const ChartRenderer = {
  // 지수 종류별 색상 팔레트 (원본선 + 채움)
  COLORS: {
    sale:   { line: "#0d9488", fillTop: "rgba(13,148,136,0.18)", fillBottom: "rgba(13,148,136,0.02)" }, // 청록(매매)
    jeonse: { line: "#d97706", fillTop: "rgba(217,119,6,0.18)",  fillBottom: "rgba(217,119,6,0.02)" },  // 호박(전세)
  },

  // 이동평균선 색상 (원본과 구분되도록 채도 있는 3색)
  MA_COLORS: {
    ma3:  "#2563eb", // 파랑  (3개월: 가장 민감)
    ma6:  "#7c3aed", // 보라  (6개월: 중간)
    ma12: "#db2777", // 자홍  (12개월: 가장 매끄러움)
  },

  /*
    x축 라벨을 만든다: 전체 라벨 중 '1월(YYYY-01)'만 글자를 보이고
    나머지는 빈 문자열로 둔다. → 연도만 드문드문 표시되는 효과.
      labels 예: ["2016-01","2016-02", ... ]
    반환: ["2016", "", "", ..., "2017", "", ...]
  */
  makeYearTicks(labels) {
    return labels.map((ym) => {
      // "2016-01" -> ["2016","01"]
      const [year, month] = ym.split("-");
      return month === "01" ? year : "";
    });
  },

  /*
    차트 하나를 만든다.
      canvas : <canvas> DOM 요소
      opts   : {
                 labels : ["2016-01", ...],
                 raw    : [65.79, ...],       // 원본 값
                 ma3, ma6, ma12 : [...],      // 이동평균 값 배열
                 type   : "sale" | "jeonse",
                 regionName : "안양시 동안구",
                 showMA : { raw, ma3, ma6, ma12 }  // 각 선을 보일지(true/false)
               }
    반환: Chart 객체 (나중에 지우거나 갱신할 때 사용)

    [초보자 설명]
     - 데이터셋(선)을 4개 만듭니다: 원본, 3개월, 6개월, 12개월.
     - showMA 값에 따라 각 선의 hidden(숨김) 여부를 정합니다.
     - 토글로 켜고 끌 때는 차트를 새로 만들지 않고
       updateVisibility()로 hidden만 바꿔 부드럽게 갱신합니다.
  */
  createChart(canvas, opts) {
    const { labels, raw, ma3, ma6, ma12, type, regionName } = opts;
    const color = this.COLORS[type] || this.COLORS.sale;
    // showMA가 없으면 기본값(원본만 표시)
    const showMA = opts.showMA || { raw: true, ma3: false, ma6: false, ma12: false };

    // 선 아래 채움용 그라데이션 (원본선에만 사용)
    const ctx = canvas.getContext("2d");
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height || 260);
    gradient.addColorStop(0, color.fillTop);
    gradient.addColorStop(1, color.fillBottom);

    // MA선 공통 스타일 (얇고, 채움 없음, 점 없음)
    const maBase = {
      borderWidth: 1.6,
      fill: false,
      pointRadius: 0,
      pointHoverRadius: 3,
      tension: 0.25,
      spanGaps: true,
    };

    return new Chart(ctx, {
      type: "line",
      data: {
        labels: labels,
        datasets: [
          // (0) 원본선
          {
            label: "원본",
            data: raw,
            borderColor: color.line,
            backgroundColor: gradient,
            borderWidth: 2,
            fill: true,
            pointRadius: 0,
            pointHoverRadius: 4,
            tension: 0.25,
            spanGaps: true,
            hidden: !showMA.raw,
          },
          // (1) 3개월 이동평균
          {
            ...maBase,
            label: "3개월 MA",
            data: ma3,
            borderColor: this.MA_COLORS.ma3,
            hidden: !showMA.ma3,
          },
          // (2) 6개월 이동평균
          {
            ...maBase,
            label: "6개월 MA",
            data: ma6,
            borderColor: this.MA_COLORS.ma6,
            hidden: !showMA.ma6,
          },
          // (3) 12개월 이동평균
          {
            ...maBase,
            label: "12개월 MA",
            data: ma12,
            borderColor: this.MA_COLORS.ma12,
            borderWidth: 2, // 가장 중요한 추세선이라 살짝 굵게
            hidden: !showMA.ma12,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false }, // 지역 이름은 카드 제목으로 따로 표시
          tooltip: {
            callbacks: {
              // 툴팁 제목을 "2020년 3월" 형태로 보기 좋게
              title: (items) => {
                const ym = items[0].label; // "2020-03"
                const [y, m] = ym.split("-");
                return `${y}년 ${parseInt(m, 10)}월`;
              },
              // 어떤 선인지(원본/MA) 함께 표시
              label: (item) => ` ${item.dataset.label}: ${item.formattedValue}`,
            },
          },
        },
        scales: {
          x: {
            // 위에서 만든 '연도만 보이는' 라벨을 사용
            ticks: {
              maxRotation: 0,
              autoSkip: false,
              callback: function (value, index) {
                // this.getLabelForValue 대신 미리 만든 배열 사용
                return opts._xTicks ? opts._xTicks[index] : "";
              },
              color: "#64748b",
              font: { size: 11 },
            },
            grid: { display: false },
          },
          y: {
            ticks: { color: "#64748b", font: { size: 11 } },
            grid: { color: "rgba(100,116,139,0.12)" },
          },
        },
      },
    });
  },

  /*
    이미 만들어진 차트에서 '어떤 선을 보일지'만 바꾼다.
      chart  : Chart 객체
      showMA : { raw, ma3, ma6, ma12 } (각각 true/false)

    [초보자 설명]
     - 데이터셋 순서는 createChart에서 만든 순서와 같습니다:
       0=원본, 1=3개월, 2=6개월, 3=12개월.
     - hidden 값만 바꾸고 chart.update() 하면
       차트를 새로 만들지 않고 선이 켜졌다 꺼졌다 합니다(부드럽고 빠름).
  */
  updateVisibility(chart, showMA) {
    chart.data.datasets[0].hidden = !showMA.raw;
    chart.data.datasets[1].hidden = !showMA.ma3;
    chart.data.datasets[2].hidden = !showMA.ma6;
    chart.data.datasets[3].hidden = !showMA.ma12;
    chart.update();
  },
};
