/*
  ui.js
  ------------------------------------------------------------
  '화면 조작(UI)'만 담당하는 파일입니다.
   - 지역 체크박스 목록 그리기 / 검색으로 걸러 보이기
   - 기간(시작~끝) 드롭다운 채우기
   - 매매/전세 토글 버튼 상태 관리
   - 사용자가 무언가 바꾸면 main.js에 "바뀌었다"고 알려주기

  [초보자 안내]
   - 이 파일은 '데이터 읽기'나 '차트 그리기'를 직접 하지 않습니다.
     오직 사용자의 선택을 받아 정리하고, 신호만 보냅니다.
   - main.js가 그 신호를 받아 실제 동작(데이터 로드+차트)을 실행합니다.

  전역 객체 UI 에 담아 사용합니다.
  ------------------------------------------------------------
*/

const UI = {
  MAX_REGIONS: 10, // 최대 선택 가능 지역 수

  // 현재 상태를 보관
  state: {
    type: "sale",          // "sale" 또는 "jeonse"
    start: null,           // "2016-01"
    end: null,             // "2026-06"
    selected: [],          // 선택된 지역들 [{name, file, hasJeonse}, ...]
    // 어떤 선을 보일지 (모든 차트에 공통 적용). 기본: 원본만 표시.
    showMA: { raw: true, ma3: false, ma6: false, ma12: false },
  },

  _regions: [],            // 전체 지역 목록
  _allLabels: [],          // 전체 기간 라벨 (기간 드롭다운 채우기용)
  _onChange: null,         // 데이터를 다시 읽어야 하는 변화용 콜백 (main.js가 등록)
  _onMAChange: null,       // MA 토글만 바뀌었을 때용 콜백 (데이터 재로드 불필요)

  /*
    UI 초기화.
      regions  : 지역 목록 배열
      allLabels: 전체 날짜 라벨 (예: ["2003-11", ..., "2026-06"])
      onChange : 상태가 바뀔 때마다 호출할 콜백 함수
  */
  init(regions, allLabels, onChange, onMAChange) {
    this._regions = regions;
    this._allLabels = allLabels;
    this._onChange = onChange;
    this._onMAChange = onMAChange;

    // 기본 기간: 전체 데이터가 길므로 최근 흐름이 잘 보이도록 2016-01부터로 시작
    const defaultStart = allLabels.includes("2016-01") ? "2016-01" : allLabels[0];
    this.state.start = defaultStart;
    this.state.end = allLabels[allLabels.length - 1];

    this._buildPeriodSelects();
    this._buildTypeToggle();
    this._buildMAToggle();
    this._buildRegionList();
    this._buildSearch();
    this._buildPickerToggle();  // 지역 목록 접기/펼치기 버튼
    this._renderChips();        // 선택 칩 초기 표시(처음엔 비어 있음)
  },

  /* ---------- 지역 목록 접기/펼치기 ---------- */
  _buildPickerToggle() {
    const btn = document.getElementById("picker-toggle");
    const panel = document.getElementById("picker-panel");
    btn.addEventListener("click", () => {
      // is-open 클래스를 켰다 껐다 하며 목록을 열고 닫음
      const open = panel.classList.toggle("is-open");
      btn.classList.toggle("is-open", open);
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
  },

  // 목록을 강제로 접는다 (지역을 다 골랐을 때 등에서 호출)
  _closePicker() {
    document.getElementById("picker-panel").classList.remove("is-open");
    const btn = document.getElementById("picker-toggle");
    btn.classList.remove("is-open");
    btn.setAttribute("aria-expanded", "false");
  },

  /* ---------- 이동평균(MA) 토글 ---------- */
  _buildMAToggle() {
    const toggle = document.getElementById("ma-toggle");
    toggle.querySelectorAll(".ma-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.ma; // "raw" | "ma3" | "ma6" | "ma12"
        // 현재 값을 뒤집는다 (켜져 있으면 끄고, 꺼져 있으면 켬)
        this.state.showMA[key] = !this.state.showMA[key];
        btn.classList.toggle("is-active", this.state.showMA[key]);

        // 데이터는 그대로이고 '보임/숨김'만 바뀌므로 MA 전용 콜백 호출
        if (typeof this._onMAChange === "function") {
          this._onMAChange(this.state);
        }
      });
    });
  },

  /* ---------- 기간 드롭다운 ---------- */
  _buildPeriodSelects() {
    const startSel = document.getElementById("start-select");
    const endSel = document.getElementById("end-select");

    // 라벨마다 <option> 추가. 보기 좋게 "2016-01" 표시.
    const optionsHtml = this._allLabels
      .map((ym) => `<option value="${ym}">${ym}</option>`) 
      .join("");
    startSel.innerHTML = optionsHtml;
    endSel.innerHTML = optionsHtml;

    // 기본값 지정
    startSel.value = this.state.start;
    endSel.value = this.state.end;

    // 사용자가 바꾸면 상태 갱신 후 알림
    startSel.addEventListener("change", () => {
      this.state.start = startSel.value;
      // 시작이 끝보다 뒤면 끝도 맞춰줌
      if (this.state.start > this.state.end) {
        this.state.end = this.state.start;
        endSel.value = this.state.end;
      }
      this._notify();
    });
    endSel.addEventListener("change", () => {
      this.state.end = endSel.value;
      if (this.state.end < this.state.start) {
        this.state.start = this.state.end;
        startSel.value = this.state.start;
      }
      this._notify();
    });
  },

  /* ---------- 매매/전세 토글 ---------- */
  _buildTypeToggle() {
    const toggle = document.getElementById("type-toggle");
    toggle.querySelectorAll(".seg-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        // 버튼 활성 표시 갱신
        toggle.querySelectorAll(".seg-btn").forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");

        this.state.type = btn.dataset.type; // "sale" 또는 "jeonse"
        this._notify();
      });
    });
  },

  /* ---------- 지역 체크박스 목록 ---------- */
  _buildRegionList() {
    const listEl = document.getElementById("region-list");
    // 각 지역을 체크박스 한 줄로 표현
    listEl.innerHTML = this._regions
      .map(
        (r) => `
          <label class="region-item" data-name="${r.name}">
            <input type="checkbox" value="${r.file}" />
            <span>${r.name}</span>
          </label>`
      )
      .join("");

    // 체크박스 클릭 처리
    listEl.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.addEventListener("change", () => this._onCheck(cb));
    });
  },

  _onCheck(cb) {
    const file = cb.value;
    const region = this._regions.find((r) => r.file === file);

    if (cb.checked) {
      // 최대 개수 초과 방지
      if (this.state.selected.length >= this.MAX_REGIONS) {
        cb.checked = false;
        alert(`최대 ${this.MAX_REGIONS}개 지역까지 선택할 수 있습니다.`);
        return;
      }
      this.state.selected.push(region);
    } else {
      // 선택 해제
      this.state.selected = this.state.selected.filter((r) => r.file !== file);
    }

    this._updateCount();
    this._renderChips();  // 선택 칩 다시 그리기
    this._notify();
  },

  /* ---------- 선택한 지역을 칩(태그)으로 표시 ---------- */
  _renderChips() {
    const box = document.getElementById("selected-chips");
    if (this.state.selected.length === 0) {
      box.innerHTML = ""; // 선택 없으면 비움
      return;
    }
    // 지역마다 칩 하나. 칩 안의 × 를 누르면 그 지역만 해제.
    box.innerHTML = this.state.selected
      .map(
        (r) => `
          <span class="chip" data-file="${r.file}">
            ${r.name}
            <button class="chip-x" data-file="${r.file}" aria-label="${r.name} 제거">×</button>
          </span>`
      )
      .join("");

    // × 버튼에 해제 기능 연결
    box.querySelectorAll(".chip-x").forEach((x) => {
      x.addEventListener("click", () => this._removeRegion(x.dataset.file));
    });
  },

  // 칩의 × 로 지역 하나를 해제 (목록의 체크박스도 함께 풀어줌)
  _removeRegion(file) {
    this.state.selected = this.state.selected.filter((r) => r.file !== file);
    // 목록에 있는 해당 체크박스 해제
    const cb = document.querySelector(`#region-list input[value="${file}"]`);
    if (cb) cb.checked = false;

    this._updateCount();
    this._renderChips();
    this._notify();
  },

  /* ---------- 검색창 ---------- */
  _buildSearch() {
    const search = document.getElementById("region-search");
    search.addEventListener("input", () => {
      const keyword = search.value.trim();
      const items = document.querySelectorAll(".region-item");
      items.forEach((item) => {
        const name = item.dataset.name;
        // 검색어가 이름에 포함되면 보이고, 아니면 숨김
        item.style.display = name.includes(keyword) ? "" : "none";
      });
    });
  },

  /* ---------- 선택 개수 표시 ---------- */
  _updateCount() {
    document.getElementById("selected-count").textContent = this.state.selected.length;
  },

  /* ---------- 변화 알림 ---------- */
  _notify() {
    if (typeof this._onChange === "function") {
      this._onChange(this.state);
    }
  },
};
