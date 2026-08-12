# -*- coding: utf-8 -*-
"""
convert_csv_to_json.py
------------------------------------------------------------
한국부동산원 매매/전세 가격지수 CSV(주택종합)를
지역별 JSON 파일로 변환하는 도구입니다.

[이 스크립트가 하는 일 - 한눈에]
  1) CSV를 cp949 인코딩으로 읽는다.          (utf-8은 한글이 깨짐)
  2) 헤더에서 '원자료' 값이 있는 열만 골라낸다. (증감률 열은 버림)
  3) 각 열이 몇 년 몇 월인지 날짜 라벨을 만든다.
  4) 지역마다 { 날짜배열, 값배열 } JSON을 저장한다.
     ★ 파일 이름은 한글 대신 영문 번호(region_001.json)로 저장한다.
  5) 지역 목록(regions.json)에 한글 이름 + 영문 파일명을 함께 담는다.

[왜 파일명을 영문 번호로 하나요? - 초보자 안내]
  - 한글 파일명은 Windows 탐색기에서 깨져 보이거나,
    GitHub Pages 웹 주소(URL)에서 %EC%95%88... 처럼
    이상하게 변환되어 문제가 생기기 쉽습니다.
  - 그래서 실제 파일은 region_001.json 처럼 영문+숫자로 만들고,
    "화면에 보여줄 한글 이름"은 regions.json 안에만 적어둡니다.
  - 웹사이트는 regions.json을 먼저 읽어
    "안양시 동안구" <-> "region_062.json" 을 짝지어 사용합니다.

[중요] 같은 번호 규칙을 sale/jeonse 둘 다에 똑같이 적용합니다.
  - sale/region_062.json 과 jeonse/region_062.json 은
    "같은 지역"을 가리킵니다. 매매/전세 짝맞춤이 쉬워집니다.

  실행: python3 convert_csv_to_json.py
------------------------------------------------------------
"""

import csv
import json
import re
from pathlib import Path

# ============================================================
# 0. 설정
# ============================================================
INPUT_FILES = {
    "sale":   "_월__매매가격지수_주택종합.csv",   # 매매가격지수
    "jeonse": "_월__전세가격지수_주택종합.csv",   # 전세가격지수
}
OUTPUT_DIR = Path("data")   # 결과 저장 최상위 폴더
ENCODING = "cp949"          # 한국부동산원 CSV는 cp949


# ============================================================
# 1. 도우미 함수들
# ============================================================
# '권역' 분류로 쓰이는 접두어. 지역 이름에서 이런 단어만 있는 칸은 건너뜁니다.
# 예: '도심권 종로구' -> '종로구', '경부1권 안양시' -> '안양시'
_ZONE_SUFFIXES = ("권", "지역")   # '~권', '~지역' 으로 끝나는 상위 분류

def _is_zone(word):
    """이 단어가 실제 지역이 아니라 '권역 분류'인지 판단."""
    # '강남지역','동북권','경부1권','도심권' 등은 분류.
    # 단, '서울 강남지역'처럼 광역 구분에 쓰이는 경우는 예외로 두고 싶지만
    # 실제 시/구 이름( '~구','~시','~군' )이 뒤따르면 그쪽을 우선합니다.
    return word.endswith(_ZONE_SUFFIXES)

def region_name_from_cells(cells):
    """
    지역 열(CSV 1~4번째 칸)을 하나의 이름으로 합쳐 간결한 지역명을 만듭니다.

    규칙:
      1) 앞에서부터 중복을 제거하며 이어붙인 목록(parts)을 만든다.
      2) '~구/~시/~군'으로 끝나는 '실제 행정구역' 단어가 있으면
         그 마지막 하나를 대표 이름으로 쓴다. (예: '도심권 종로구' -> '종로구')
      3) 없으면 권역 접두어를 뺀 마지막 어절을 쓰되,
         전부 분류뿐이면 원래 마지막 어절을 그대로 쓴다.
         (예: '전국','수도권','서울 강남지역'은 그대로 유지)
    """
    parts = []
    for c in cells:
        c = c.strip()
        if c and (not parts or parts[-1] != c):
            parts.append(c)

    if not parts:
        return ""
    if len(parts) == 1:
        return parts[0]

    # 첫 칸(col1)은 대개 상위 광역/도 이름입니다. (예: '서울','부산','경기')
    top = parts[0]

    # (2) 권역 분류(~권/~지역)를 걷어낸, '진짜 지역' 어절만 추린다.
    real = [w for w in parts if not _is_zone(w)]

    # (2-a) 마지막이 '구' 또는 '군'이면, 상위 지역과 묶어 명확하게 만든다.
    #       - 안양시 동안구 처럼 '시'가 있으면 '시 + 구'
    #       - 부산 동구 처럼 시가 없으면 '광역시명 + 구'
    if real and real[-1].endswith(("구", "군")):
        gu = real[-1]
        si = None
        for w in reversed(real[:-1]):
            if w.endswith("시"):
                si = w
                break
        if si:
            return f"{si} {gu}"          # 예: 안양시 동안구
        # 구 바로 앞의 지역 어절(대개 광역시명)을 상위로 사용.
        # (col0의 원본 분류 'top'보다, 구에 가까운 이름이 더 정확)
        prev = real[-2] if len(real) >= 2 else top
        if prev and prev != gu:
            return f"{prev} {gu}"         # 예: 부산 동구, 광주 동구, 서울 노원구
        if top and top != gu:
            return f"{top} {gu}"
        return gu

    # (2-b) 마지막이 '시'면 그대로 사용 (예: '안양시')
    if real and real[-1].endswith("시"):
        return real[-1]

    # (3) 구/시/군이 없으면(광역 분류 등): 마지막 2개를 그대로 사용
    #     (예: '서울 강남지역'은 유지)
    return " ".join(parts[-2:])


def build_month_labels(row_ym):
    """row 0의 '2003년 11월' 을 'YYYY-MM' 라벨로 변환. 날짜 아니면 None."""
    labels = []
    for cell in row_ym:
        m = re.match(r"\s*(\d{4})년\s*(\d{1,2})월", cell)
        if m:
            labels.append(f"{m.group(1)}-{int(m.group(2)):02d}")
        else:
            labels.append(None)
    return labels


def extract_regions(csv_path):
    """
    CSV 하나를 읽어 (labels, [(지역이름, 값배열), ...]) 로 돌려줍니다.
    labels: '원자료' 열의 날짜 배열
    """
    with open(csv_path, encoding=ENCODING) as f:
        rows = list(csv.reader(f))

    row_ym   = rows[0]   # 0행: 연-월
    row_type = rows[2]   # 2행: '원자료' 등

    # '원자료' 열 위치만 선택 (값은 5번 열부터)
    raw_cols = [i for i in range(5, len(row_type)) if row_type[i].strip() == "원자료"]

    all_labels = build_month_labels(row_ym)
    labels = [all_labels[i] for i in raw_cols]

    regions = []
    for r in range(3, len(rows)):   # 데이터는 3행부터
        row = rows[r]
        if len(row) < 6:
            continue
        name = region_name_from_cells(row[1:5])
        if not name:
            continue
        values = []
        for i in raw_cols:
            cell = row[i].strip() if i < len(row) else ""
            if cell in ("", "-"):
                values.append(None)
            else:
                try:
                    values.append(float(cell))
                except ValueError:
                    values.append(None)
        regions.append((name, values))
    return labels, regions


# ============================================================
# 2. 전체 실행부
# ============================================================
def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # (1) 두 CSV 읽기
    data = {}
    for kind, path in INPUT_FILES.items():
        print(f"[{kind}] '{path}' 읽는 중...")
        labels, regions = extract_regions(path)
        data[kind] = (labels, regions)
        print(f"  - 원자료 {len(labels)}개월 ({labels[0]} ~ {labels[-1]}), 지역 {len(regions)}개")

    # (2) 번호 기준은 'sale'
    sale_labels, sale_regions = data["sale"]
    jeonse_labels, jeonse_regions = data["jeonse"]
    if len(sale_regions) != len(jeonse_regions):
        print("  [경고] 매매/전세 지역 개수가 다릅니다. 짝맞춤을 확인하세요.")

    # 전세는 지역이름으로 빠르게 찾도록 사전 준비
    jeonse_by_name = {name: values for name, values in jeonse_regions}

    # (3) 폴더 준비
    sale_dir   = OUTPUT_DIR / "sale"
    jeonse_dir = OUTPUT_DIR / "jeonse"
    sale_dir.mkdir(parents=True, exist_ok=True)
    jeonse_dir.mkdir(parents=True, exist_ok=True)

    region_list = []

    # (4) sale 순서 기준으로 번호 매기며 저장
    for idx, (name, sale_values) in enumerate(sale_regions, start=1):
        slug = f"region_{idx:03d}"       # region_001, region_002 ...
        filename = f"{slug}.json"

        # 매매 저장
        with open(sale_dir / filename, "w", encoding="utf-8") as f:
            json.dump({
                "region": name, "type": "sale",
                "labels": sale_labels, "values": sale_values,
            }, f, ensure_ascii=False)

        # 전세 저장 (같은 지역 이름으로 매칭)
        jeonse_values = jeonse_by_name.get(name)
        has_jeonse = jeonse_values is not None
        if has_jeonse:
            with open(jeonse_dir / filename, "w", encoding="utf-8") as f:
                json.dump({
                    "region": name, "type": "jeonse",
                    "labels": jeonse_labels, "values": jeonse_values,
                }, f, ensure_ascii=False)

        # 목록 기록 (한글 이름 + 영문 파일명)
        region_list.append({
            "name": name,          # 화면 표시용 한글
            "slug": slug,          # region_001
            "file": filename,      # region_001.json
            "hasJeonse": has_jeonse,
        })

    # (5) 지역 목록 저장
    regions_path = OUTPUT_DIR / "regions.json"
    with open(regions_path, "w", encoding="utf-8") as f:
        json.dump(region_list, f, ensure_ascii=False, indent=2)

    print(f"\n[완료] 매매 {len(sale_regions)}개 -> {sale_dir}/")
    print(f"       전세 저장 -> {jeonse_dir}/")
    print(f"       지역 목록 -> {regions_path} (총 {len(region_list)}개)")
    print("       파일명은 region_001.json 형식(영문)으로 저장됨.")


if __name__ == "__main__":
    main()
