/*
  dataLoader.js
  ------------------------------------------------------------
  '데이터 읽기'만 담당하는 파일입니다.
  data/ 폴더의 JSON 파일들을 불러오는 창구 역할을 합니다.

  [초보자 안내]
   - 화면(차트)을 그리는 코드는 여기 없습니다. 여기는 오직 "읽기"만.
   - 나중에 API 자동화로 바꿀 때는 '이 파일만' 교체하면 됩니다.
     (fetch 대상만 API 주소로 바꾸고, 돌려주는 모양을 똑같이 유지)

  [제공하는 기능]
   - loadRegions()            : 지역 목록(regions.json)을 읽음
   - loadRegionSeries(type, file) : 특정 지역의 시계열 1개를 읽음
   - filterByPeriod(...)      : 기간(시작~끝)으로 데이터를 잘라냄

  이 파일은 전역 객체 DataLoader 에 기능을 담아 다른 파일이 쓰게 합니다.
  ------------------------------------------------------------
*/

const DataLoader = {
  // 한 번 읽은 지역 데이터는 여기에 저장해 두어 중복 요청을 줄입니다. (간단한 캐시)
  _cache: {},

  /*
    지역 목록을 읽어옵니다.
    반환 예: [ { name:"전국", slug:"region_001", file:"region_001.json", hasJeonse:true }, ... ]
  */
  async loadRegions() {
    const res = await fetch("data/regions.json");
    if (!res.ok) {
      throw new Error("지역 목록(regions.json)을 불러오지 못했습니다.");
    }
    return await res.json();
  },

  /*
    특정 지역의 시계열 데이터 1개를 읽어옵니다.
      type : "sale"(매매) 또는 "jeonse"(전세)
      file : "region_060.json" 같은 파일명
    반환 예: { region:"안양시 동안구", type:"sale",
              labels:["2003-11", ...], values:[40.93, ...] }
  */
  async loadRegionSeries(type, file) {
    // 캐시 키: 종류+파일명 (예: "sale/region_060.json")
    const key = type + "/" + file;
    if (this._cache[key]) {
      return this._cache[key]; // 이미 읽었으면 그대로 재사용
    }

    const res = await fetch("data/" + type + "/" + file);
    if (!res.ok) {
      throw new Error(`데이터를 불러오지 못했습니다: ${key}`);
    }
    const data = await res.json();
    this._cache[key] = data; // 캐시에 저장
    return data;
  },

  /*
    전체 시계열에서 기간(start~end)만 잘라 돌려줍니다.
      labels : 전체 날짜 배열 (["2003-11", ...])
      values : 전체 값 배열
      start  : 시작 월 ("2016-01")
      end    : 끝 월   ("2026-06")
    반환: { labels: 자른날짜, values: 자른값 }

    (labels가 시간 순으로 정렬돼 있다고 가정합니다.)
  */
  filterByPeriod(labels, values, start, end) {
    const outLabels = [];
    const outValues = [];
    for (let i = 0; i < labels.length; i++) {
      const ym = labels[i];
      // 문자열 "2016-01" 은 사전순 비교가 곧 날짜순 비교와 같습니다.
      if (ym >= start && ym <= end) {
        outLabels.push(ym);
        outValues.push(values[i]);
      }
    }
    return { labels: outLabels, values: outValues };
  },

  /*
    ── 단순이동평균(SMA) 계산 ──────────────────────────────
    values : 전체 값 배열 (예: [40.9, 41.0, 41.2, ...])
    window : 평균 낼 개월 수 (3, 6, 12 등)
    반환   : 같은 길이의 배열. 각 위치는 '직전 window개월'의 평균.

    [초보자 설명]
     - 이동평균은 "최근 N개월 값을 평균 내어 선을 매끄럽게" 만드는 것입니다.
     - 예: 12개월 이동평균의 3월 값 = 작년 4월~올해 3월(12개) 값의 평균.
     - 처음 (window-1)개월은 평균 낼 데이터가 부족하므로 null 로 둡니다.
       (Chart.js는 null 구간을 그냥 비워두므로, MA선이 자연스럽게 늦게 시작합니다.)
     - 중간에 값이 비어(null) 있으면 그 구간 평균은 null 로 둡니다(왜곡 방지).

    ★ 중요: 이 계산은 '전체 기간' 값으로 먼저 하고,
      그 다음에 filterByPeriod 로 잘라야 합니다.
      (먼저 자르고 계산하면, 시작 부분의 12개월선이 통째로 비어버립니다.)
  */
  calcSMA(values, window) {
    const out = new Array(values.length).fill(null);
    for (let i = 0; i < values.length; i++) {
      if (i < window - 1) continue; // 아직 window개월이 안 모임 → null 유지

      // 직전 window개 구간을 더한다
      let sum = 0;
      let ok = true;
      for (let k = i - window + 1; k <= i; k++) {
        if (values[k] === null || values[k] === undefined) {
          ok = false; // 구간에 빈 값이 있으면 평균 계산 포기
          break;
        }
        sum += values[k];
      }
      if (ok) {
        out[i] = +(sum / window).toFixed(2); // 소수 2자리로 정리
      }
    }
    return out;
  },

  /*
    한 지역의 '원본 + 이동평균들'을 한꺼번에 만들고,
    사용자가 고른 기간으로 잘라서 돌려주는 편의 함수입니다.

    입력 series: { labels:[...전체], values:[...전체] }
    반환:
      {
        labels : 자른 날짜,
        raw    : 자른 원본 값,
        ma3    : 자른 3개월 이동평균,
        ma6    : 자른 6개월 이동평균,
        ma12   : 자른 12개월 이동평균,
      }

    순서: (1) 전체 기간에서 MA 계산 → (2) 기간으로 자르기
  */
  buildSeriesWithMA(series, start, end) {
    // (1) 전체 기간에서 이동평균 먼저 계산
    const fullMa3 = this.calcSMA(series.values, 3);
    const fullMa6 = this.calcSMA(series.values, 6);
    const fullMa12 = this.calcSMA(series.values, 12);

    // (2) 각 배열을 같은 기간으로 자른다 (filterByPeriod 재사용)
    const rawCut = this.filterByPeriod(series.labels, series.values, start, end);
    const ma3Cut = this.filterByPeriod(series.labels, fullMa3, start, end);
    const ma6Cut = this.filterByPeriod(series.labels, fullMa6, start, end);
    const ma12Cut = this.filterByPeriod(series.labels, fullMa12, start, end);

    return {
      labels: rawCut.labels,
      raw: rawCut.values,
      ma3: ma3Cut.values,
      ma6: ma6Cut.values,
      ma12: ma12Cut.values,
    };
  },
};
