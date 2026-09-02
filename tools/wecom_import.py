#!/usr/bin/env python3
"""把企业微信导出的客户表解析为脱敏后的中台导入 CSV。

用法:
    python tools/wecom_import.py <input.xlsx> <output.csv>

隐私规则:
    - 手机号只导出后四位，脚本不会把 11 位号码写入输出。
    - 输出为中台可读的 UTF-8 CSV，可直接受 Excel 打开。

依赖:
    openpyxl
"""

from __future__ import annotations

import csv
import re
import sys
from datetime import datetime, timedelta, timezone
from typing import Any

try:
    import openpyxl
except ImportError as exc:  # pragma: no cover
    raise SystemExit("缺少依赖：openpyxl。请先执行 pip install openpyxl") from exc


HEADERS = [
    "客户姓名",
    "手机号后四位",
    "归属顾问",
    "性别",
    "添加渠道",
    "添加时间",
    "关系天数",
    "用户板块",
    "产品关注",
    "消费状态",
    "积分档位",
    "价值标签",
    "触达标签",
    "触达次数",
    "是否继承",
    "原始企业标签",
    "原始客户标签",
    "状态",
]


PRODUCT_RULES: list[tuple[re.Pattern[str], str, str]] = [
    (re.compile(r"nmn\s*\d+|nmn", re.IGNORECASE), "NMN", "nmn"),
    (re.compile(r"麦角硫因|麦角"), "麦角硫因", "ergothioneine"),
    (re.compile(r"辅酶|Q10|还原型辅酶", re.IGNORECASE), "辅酶Q10", "coq10"),
    (re.compile(r"PQQ", re.IGNORECASE), "PQQ", "regular"),
    (re.compile(r"小仙弹"), "小仙弹", "regular"),
    (re.compile(r"维生素|维C|维c"), "维生素", "regular"),
    (re.compile(r"\bD3\b", re.IGNORECASE), "D3", "regular"),
    (re.compile(r"益生菌"), "益生菌", "regular"),
]


POINTS_RULES: list[tuple[str, str]] = [
    ("10001+", "高"),
    ("5001-10000", "较高"),
    ("2001-5000", "中"),
    ("积分1001-5000", "中"),
    ("积分余额1000～5000", "中"),
    ("积分1-199", "较低"),
    ("积分20-1000", "较低"),
    ("小于1000", "低"),
    ("积分余额小于20", "低"),
    ("积分小于1", "低"),
]


VALUE_RULES: list[tuple[str, str]] = [
    ("高净值用户", "高净值"),
    ("营养精英", "营养精英"),
    ("重大用户", "重大"),
]


TOUCH_KEYWORD = re.compile(r"触达|群发|外呼|闪群|种草|问卷")
DATE_CODE = re.compile(r"^\d{1,2}\.\d{1,2}$|^(618|双11|五一)$")
TZ = timezone(timedelta(hours=8))


def last_four_digits(*values: Any) -> str:
    """返回第一个可用号码的后四位，长度不足四位时返回空串。"""
    for value in values:
        if value is None:
            continue
        digits = re.sub(r"\D", "", str(value))
        if len(digits) >= 4:
            return digits[-4:]
    return ""


def strip_phones(text: Any) -> str:
    """去掉文本中连续 7 位及以上的数字串，防止昵称或标签里夹带完整手机号。"""
    cleaned = re.sub(r"\d{7,}", "", str(text or ""))
    return re.sub(r"\s{2,}", " ", cleaned).strip()


def split_tags(text: Any) -> list[str]:
    if not text:
        return []
    return [token for token in re.split(r"[、,，;；/\s]+", str(text)) if token]


def products_from(text: str) -> tuple[list[str], list[str]]:
    """从备注昵称与标签提取产品关注，返回 (labels, asset codes)。"""
    labels: list[str] = []
    codes: list[str] = []
    for pattern, label, code in PRODUCT_RULES:
        if code in codes:
            continue
        if pattern.search(text):
            labels.append(label)
            codes.append(code)
    return labels, codes


def points_tier(text: str) -> str:
    for marker, tier in POINTS_RULES:
        if marker in text:
            return tier
    return "未知"


def value_labels(text: str) -> list[str]:
    return [label for marker, label in VALUE_RULES if marker in text]


def touch_labels(tags: list[str]) -> list[str]:
    found: list[str] = []
    for tag in tags:
        if TOUCH_KEYWORD.search(tag) or DATE_CODE.search(tag):
            found.append(tag)
    return found


def consumption_status(text: str) -> str:
    if "近一年无消费" in text:
        return "沉睡"
    if "近180天消费用户" in text:
        return "近180天活跃"
    if "近1年有消费" in text:
        return "近1年活跃"
    if any(marker in text for marker in ("已购", "购买用户", "已消费客户")):
        return "已购"
    return "未知"


def relation_days(add_time: str, today: datetime | None = None) -> str:
    if not add_time:
        return ""
    if today is None:
        today = datetime.now(TZ)
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%Y/%m/%d"):
        try:
            parsed = datetime.strptime(str(add_time).strip(), fmt).replace(tzinfo=TZ)
            return str((today - parsed).days)
        except ValueError:
            continue
    return ""


def parse_workbook(path: str) -> list[dict[str, str]]:
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

    rows: list[dict[str, str]] = []
    for source in iterator:
        name = strip_phones(cell(source, "客户昵称") or cell(source, "备注昵称"))
        phone = last_four_digits(cell(source, "手机号"), cell(source, "备注手机号"))
        owner = cell(source, "添加人")
        gender = cell(source, "性别")
        add_time = cell(source, "添加时间")
        add_channel = cell(source, "添加渠道")
        inherited = cell(source, "是否继承")
        enterprise_tags = strip_phones(cell(source, "企业标签"))
        customer_tags = strip_phones(cell(source, "客户标签"))
        remark = cell(source, "备注昵称")

        tags = split_tags(enterprise_tags) + split_tags(customer_tags)
        combined_text = f"{remark} {enterprise_tags} {customer_tags}"
        labels, codes = products_from(combined_text)
        if not codes:
            codes = ["regular"]
            labels = ["待确认"]

        touches = touch_labels(tags)
        value_tags = value_labels(combined_text)

        if not name:
            status = "缺姓名"
        elif not phone:
            status = "缺手机号"
        else:
            status = "可导入"

        rows.append(
            {
                "name": name,
                "phone": phone,
                "owner": owner,
                "gender": gender or "未知",
                "channel": add_channel,
                "add_time": add_time,
                "relation_days": relation_days(add_time),
                "asset_codes": "|".join(codes),
                "product_focus": "/".join(labels),
                "consumption": consumption_status(combined_text),
                "points": points_tier(combined_text),
                "value": "、".join(value_tags),
                "touch": "、".join(touches),
                "touch_count": str(len(touches)),
                "inherited": inherited,
                "enterprise_tags": enterprise_tags,
                "customer_tags": customer_tags,
                "status": status,
            }
        )

    workbook.close()
    return rows


def write_csv(rows: list[dict[str, str]], path: str) -> None:
    with open(path, "w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=HEADERS)
        writer.writeheader()
        ordered: list[dict[str, str]] = []
        for row in rows:
            ordered.append(
                {
                    "客户姓名": row["name"],
                    "手机号后四位": row["phone"],
                    "归属顾问": row["owner"],
                    "性别": row["gender"],
                    "添加渠道": row["channel"],
                    "添加时间": row["add_time"],
                    "关系天数": row["relation_days"],
                    "用户板块": row["asset_codes"],
                    "产品关注": row["product_focus"],
                    "消费状态": row["consumption"],
                    "积分档位": row["points"],
                    "价值标签": row["value"],
                    "触达标签": row["touch"],
                    "触达次数": row["touch_count"],
                    "是否继承": row["inherited"],
                    "原始企业标签": row["enterprise_tags"],
                    "原始客户标签": row["customer_tags"],
                    "状态": row["status"],
                }
            )
        writer.writerows(ordered)


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print(__doc__)
        return 2
    source, target = argv[1], argv[2]
    rows = parse_workbook(source)
    write_csv(rows, target)
    printable = sum(1 for row in rows if row["status"] == "可导入")
    missing_phone = sum(1 for row in rows if row["status"] == "缺手机号")
    missing_name = sum(1 for row in rows if row["status"] == "缺姓名")
    print(f"解析 {len(rows)} 行 -> {target}")
    print(f"可导入 {printable} 行；缺手机号 {missing_phone} 行；缺姓名 {missing_name} 行")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
