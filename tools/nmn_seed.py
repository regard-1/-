#!/usr/bin/env python3
"""把脱敏前的 NMN 用户表生成公开演示用的受控 seed。

用法:
    python tools/nmn_seed.py <input.xlsx> <seed_js_path> <seed_json_path>

隐私规则:
    - 保留真实客户昵称 / 姓名，仅导出手机号后四位。
    - 不保留完整手机号，备注中连续 7 位及以上的数字串会被清除。
    - 备注里的日期、订单编码、金额和数量等剩余数字统一用 * 隐藏，避免公布原始经营数据。
    - 不导出积分、消费状态、企业标签、客户标签、群聊等经营字段。
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

try:
    import openpyxl
except ImportError as exc:  # pragma: no cover
    raise SystemExit("缺少依赖：openpyxl。请先执行 pip install openpyxl") from exc


def digit_only(value: Any) -> str:
    return re.sub(r"\D", "", str(value or ""))


def last_four_digits(*values: Any) -> str:
    """返回第一个可用手机号的后四位，长度不足四位时返回空串。"""
    for value in values:
        if value is None:
            continue
        digits = digit_only(value)
        if len(digits) >= 4:
            return digits[-4:]
    return ""


def strip_phones(text: Any) -> str:
    """清除文本中连续 7 位及以上的数字串，避免备注夹带完整手机号。"""
    cleaned = re.sub(r"\d{7,}", "", str(text or ""))
    return re.sub(r"\s{2,}", " ", cleaned).strip()


def mask_remark(text: Any) -> str:
    """保留备注文本结构，但隐藏日期、金额、数量等剩余数字。"""
    cleaned = strip_phones(text)
    cleaned = re.sub(r"\d+", "*", cleaned)
    return re.sub(r"\s{2,}", " ", cleaned).strip()


def parse_workbook(path: Path) -> list[dict[str, str]]:
    workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)
    sheet = workbook.active
    iterator = sheet.iter_rows(values_only=True)
    header = [str(cell).strip() if cell is not None else "" for cell in next(iterator)]
    index = {name: position for position, name in enumerate(header)}

    def cell(row: tuple, column: str) -> str:
        position = index.get(column)
        if position is None or position >= len(row) or row[position] is None:
            return ""
        return str(row[position]).strip()

    records: list[dict[str, str]] = []
    for source in iterator:
        name = strip_phones(cell(source, "客户昵称"))
        remark_name = mask_remark(cell(source, "备注昵称"))
        if not name:
            name = remark_name
        phone = last_four_digits(cell(source, "手机号"), cell(source, "备注手机号"))
        owner = strip_phones(cell(source, "添加人")) or "NMN项目"
        if not name or len(phone) != 4:
            continue
        records.append(
            {
                "name": name,
                "phone": phone,
                "owner": owner,
                "remark": remark_name,
            }
        )

    workbook.close()
    return records


def write_seed(records: list[dict[str, str]], js_path: Path, json_path: Path) -> None:
    payload = json.dumps(records, ensure_ascii=False, indent=2)
    js_path.parent.mkdir(parents=True, exist_ok=True)
    json_path.parent.mkdir(parents=True, exist_ok=True)
    js_path.write_text(
        f"window.NMN_DEMO_SEED={payload};\n"
        f"if(typeof module!=='undefined'&&module.exports){{module.exports={payload};}}\n",
        encoding="utf-8",
    )
    json_path.write_text(payload + "\n", encoding="utf-8")


def main(argv: list[str]) -> int:
    if len(argv) != 4:
        print(__doc__)
        return 2
    source_path = Path(argv[1]).expanduser()
    js_path = Path(argv[2]).expanduser()
    json_path = Path(argv[3]).expanduser()

    if not source_path.exists():
        print(f"找不到输入文件：{source_path}")
        return 1

    records = parse_workbook(source_path)
    if not records:
        print("没有可导入的账号，未生成 seed。")
        return 1

    write_seed(records, js_path, json_path)
    print(f"生成 {len(records)} 位 NMN 用户（保留昵称和姓名，手机号仅后四位，并带备注）")
    print(f"  js : {js_path}")
    print(f"  json: {json_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
