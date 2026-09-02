#!/usr/bin/env python3
"""多特倍斯运营中台 MVP。

仅使用 Python 标准库，提供 SQLite/WAL、Cookie 会话、用户资产、AI画像、
Agent 多轮话术、会员/活动/社群/分析概览，以及与原 SecondBrain 兼容的
/api/search 和 /api/chat 接口。
"""

from __future__ import annotations

import hashlib
import hmac
import json
import mimetypes
import os
import re
import secrets
import sqlite3
import sys
import traceback
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from http import cookies
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import demo_backend

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = Path(os.environ.get("DB_PATH", str(BASE_DIR / "data.db")))
TEMPLATE_DIR = BASE_DIR / "templates"
ASSET_DIR = BASE_DIR / "assets"
PORT = int(os.environ.get("PORT", "8090"))
SESSION_HOURS = 12
TZ = timezone(timedelta(hours=8))
AUDIENCES = {
    "nmn": {"name": "NMN人群", "description": "关注细胞能量与健康管理", "color": "#c89b5a"},
    "ergothioneine": {"name": "麦角硫因人群", "description": "关注抗氧化与精细化养护", "color": "#9d7bea"},
    "coq10": {"name": "辅酶Q10人群", "description": "关注心脏活力与日常能量", "color": "#e16f62"},
    "regular": {"name": "常规品人群", "description": "基础营养与日常健康管理", "color": "#4aa88a"},
}

ROLE_PERMISSIONS = {
    "superadmin": {
        "customer:read",
        "customer:write",
        "conversation:reply",
        "task:update",
        "analytics:read",
        "governance:read",
        "admin:manage",
    },
    "manager": {
        "customer:read",
        "customer:write",
        "conversation:reply",
        "task:update",
        "analytics:read",
        "governance:read",
    },
    "operator": {
        "customer:read",
        "conversation:reply",
        "task:update",
    },
}


def now_iso() -> str:
    return datetime.now(TZ).replace(microsecond=0).isoformat()


def dt_days_ago(days: int, hour: int = 10) -> str:
    value = datetime.now(TZ) - timedelta(days=days)
    return value.replace(hour=hour, minute=0, second=0, microsecond=0).isoformat()


def connect(db_path: Path | str = DB_PATH) -> sqlite3.Connection:
    conn = sqlite3.connect(str(db_path), timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    return conn


def password_hash(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 210_000)
    return f"pbkdf2_sha256$210000${salt.hex()}${digest.hex()}"


def password_verify(password: str, encoded: str) -> bool:
    try:
        algorithm, iterations, salt_hex, digest_hex = encoded.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        digest = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), int(iterations)
        )
        return hmac.compare_digest(digest.hex(), digest_hex)
    except (TypeError, ValueError):
        return False


def user_can(user, permission: str) -> bool:
    """Check whether a user row grants the named permission."""
    role = user["role"] if user else ""
    return permission in ROLE_PERMISSIONS.get(role, set())


SCHEMA = """
CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'agent',
    data_scope TEXT NOT NULL DEFAULT 'all',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    nickname TEXT,
    phone TEXT,
    gender TEXT,
    city TEXT,
    source TEXT,
    owner TEXT,
    store TEXT,
    lifecycle_status TEXT NOT NULL DEFAULT 'prospect',
    marketing_consent INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS asset_audience_definitions (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS customer_asset_memberships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    audience_code TEXT NOT NULL REFERENCES asset_audience_definitions(code),
    basis_type TEXT NOT NULL,
    basis_label TEXT NOT NULL,
    score REAL NOT NULL DEFAULT 0,
    rule_version INTEGER NOT NULL DEFAULT 1,
    first_matched_at TEXT NOT NULL,
    last_matched_at TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    UNIQUE(customer_id, audience_code, basis_type, basis_label)
);

CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    order_no TEXT UNIQUE NOT NULL,
    product_name TEXT NOT NULL,
    audience_code TEXT REFERENCES asset_audience_definitions(code),
    amount_cents INTEGER NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'paid',
    purchased_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS interactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    channel TEXT NOT NULL,
    direction TEXT NOT NULL,
    scene TEXT,
    content TEXT NOT NULL,
    occurred_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS member_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER UNIQUE NOT NULL REFERENCES customers(id),
    member_no TEXT UNIQUE NOT NULL,
    level TEXT NOT NULL,
    points INTEGER NOT NULL DEFAULT 0,
    growth_value INTEGER NOT NULL DEFAULT 0,
    benefits_json TEXT NOT NULL DEFAULT '[]',
    joined_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS customer_feature_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    data_version TEXT NOT NULL,
    features_json TEXT NOT NULL,
    data_through_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(customer_id, data_version)
);

CREATE TABLE IF NOT EXISTS customer_ai_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    data_version TEXT NOT NULL,
    summary TEXT NOT NULL,
    tags_json TEXT NOT NULL,
    suggestions_json TEXT NOT NULL,
    evidence_json TEXT NOT NULL,
    confidence REAL NOT NULL,
    provider TEXT NOT NULL,
    prompt_version TEXT NOT NULL,
    generated_at TEXT NOT NULL,
    is_current INTEGER NOT NULL DEFAULT 1,
    UNIQUE(customer_id, data_version, prompt_version)
);

CREATE TABLE IF NOT EXISTS agent_conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    audience_code TEXT,
    scene TEXT NOT NULL DEFAULT 'consult',
    status TEXT NOT NULL DEFAULT 'active',
    summary TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES agent_conversations(id),
    sequence_no INTEGER NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    suggestion_json TEXT,
    created_at TEXT NOT NULL,
    UNIQUE(conversation_id, sequence_no)
);

CREATE TABLE IF NOT EXISTS campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    audience_code TEXT,
    status TEXT NOT NULL,
    goal TEXT,
    reached INTEGER NOT NULL DEFAULT 0,
    converted INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS communities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    theme TEXT,
    owner TEXT,
    member_count INTEGER NOT NULL DEFAULT 0,
    active_rate REAL NOT NULL DEFAULT 0,
    conversion_rate REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS knowledge (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT,
    tags TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT NOT NULL,
    object_type TEXT,
    object_id TEXT,
    detail_json TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_membership_audience ON customer_asset_memberships(audience_code, is_active, customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer_time ON orders(customer_id, purchased_at DESC);
CREATE INDEX IF NOT EXISTS idx_interactions_customer_time ON interactions(customer_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_customer_current ON customer_ai_profiles(customer_id, is_current, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_seq ON agent_messages(conversation_id, sequence_no);
"""


CUSTOMER_SEED = [
    ("示例用户01", "用户01", "00000000001", "未标注", "华东地区", "演示渠道A", "演示顾问A", "示例门店A", "active_member", 1),
    ("示例用户02", "用户02", "00000000002", "未标注", "华东地区", "演示渠道B", "演示顾问A", "示例门店B", "customer", 1),
    ("示例用户03", "用户03", "00000000003", "未标注", "华南地区", "演示渠道C", "演示顾问B", "示例门店C", "active_member", 1),
    ("示例用户04", "用户04", "00000000004", "未标注", "华北地区", "演示渠道D", "演示顾问C", "示例门店D", "prospect", 1),
    ("示例用户05", "用户05", "00000000005", "未标注", "华东地区", "演示渠道A", "演示顾问A", "示例门店E", "dormant", 1),
    ("示例用户06", "用户06", "00000000006", "未标注", "西南地区", "演示渠道E", "演示顾问D", "示例门店F", "active_member", 1),
    ("示例用户07", "用户07", "00000000007", "未标注", "华东地区", "演示渠道F", "演示顾问A", "示例门店G", "customer", 1),
    ("示例用户08", "用户08", "00000000008", "未标注", "华南地区", "演示渠道G", "演示顾问B", "示例门店H", "prospect", 1),
    ("示例用户09", "用户09", "00000000009", "未标注", "华北地区", "演示渠道B", "演示顾问C", "示例门店I", "active_member", 1),
    ("示例用户10", "用户10", "00000000010", "未标注", "华中地区", "演示渠道C", "演示顾问D", "示例门店J", "customer", 0),
    ("示例用户11", "用户11", "00000000011", "未标注", "华东地区", "演示渠道A", "演示顾问A", "示例门店K", "active_member", 1),
    ("示例用户12", "用户12", "00000000012", "未标注", "华东地区", "演示渠道D", "演示顾问A", "示例门店L", "prospect", 1),
]

MEMBERSHIP_SEED = [
    (1, "nmn", "order", "NMN焕活胶囊", 96), (1, "coq10", "interest", "咨询辅酶Q10", 72),
    (2, "coq10", "order", "辅酶Q10软胶囊", 91), (3, "ergothioneine", "order", "麦角硫因焕亮片", 94),
    (4, "nmn", "consult", "咨询NMN抗衰方案", 68), (5, "regular", "order", "复合维生素", 85),
    (6, "nmn", "order", "NMN焕活胶囊", 98), (6, "ergothioneine", "order", "麦角硫因焕亮片", 88),
    (7, "coq10", "order", "辅酶Q10软胶囊", 87), (8, "ergothioneine", "campaign", "焕亮主题活动", 63),
    (9, "regular", "order", "益生菌粉", 92), (10, "coq10", "consult", "咨询日常能量", 65),
    (11, "nmn", "order", "NMN焕活胶囊", 90), (11, "regular", "order", "鱼油软胶囊", 75),
    (12, "regular", "order", "钙维生素D片", 78),
]

ORDER_SEED = [
    (1, "NMN焕活胶囊", "nmn", 269900, 12), (1, "辅酶Q10软胶囊", "coq10", 69900, 65),
    (2, "辅酶Q10软胶囊", "coq10", 139800, 24), (3, "麦角硫因焕亮片", "ergothioneine", 189900, 8),
    (4, "NMN体验装", "nmn", 29900, 42), (5, "复合维生素", "regular", 39900, 150),
    (6, "NMN尊享套装", "nmn", 499900, 5), (6, "麦角硫因焕亮片", "ergothioneine", 189900, 38),
    (7, "辅酶Q10软胶囊", "coq10", 69900, 18), (8, "麦角硫因体验装", "ergothioneine", 19900, 31),
    (9, "益生菌粉", "regular", 59800, 16), (9, "鱼油软胶囊", "regular", 45900, 80),
    (10, "辅酶Q10体验装", "coq10", 19900, 55), (11, "NMN焕活胶囊", "nmn", 269900, 20),
    (11, "鱼油软胶囊", "regular", 45900, 11), (12, "钙维生素D片", "regular", 32900, 29),
]


def init_db(db_path: Path | str = DB_PATH) -> None:
    conn = connect(db_path)
    try:
        conn.executescript(SCHEMA)
        conn.execute("INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(1, ?)", (now_iso(),))
        seed(conn)
        conn.commit()
    finally:
        conn.close()


def seed(conn: sqlite3.Connection) -> None:
    if conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0:
        username = os.environ.get("ADMIN_USERNAME", "demo_operator")
        password = os.environ.get("ADMIN_PASSWORD", "demo")
        conn.execute(
            "INSERT INTO users(username,password_hash,display_name,role,data_scope,created_at) VALUES(?,?,?,?,?,?)",
            (username, password_hash(password), "演示运营", "superadmin", "all", now_iso()),
        )
    for index, (code, item) in enumerate(AUDIENCES.items(), 1):
        conn.execute(
            "INSERT OR IGNORE INTO asset_audience_definitions(code,name,description,color,sort_order) VALUES(?,?,?,?,?)",
            (code, item["name"], item["description"], item["color"], index),
        )
    if conn.execute("SELECT COUNT(*) FROM customers").fetchone()[0] == 0:
        for index, row in enumerate(CUSTOMER_SEED):
            created = dt_days_ago(220 - index * 12)
            conn.execute(
                """INSERT INTO customers(name,nickname,phone,gender,city,source,owner,store,lifecycle_status,
                   marketing_consent,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
                (*row, created, dt_days_ago(index + 1)),
            )
        for customer_id, audience, basis_type, label, score in MEMBERSHIP_SEED:
            conn.execute(
                """INSERT INTO customer_asset_memberships(customer_id,audience_code,basis_type,basis_label,score,
                   first_matched_at,last_matched_at) VALUES(?,?,?,?,?,?,?)""",
                (customer_id, audience, basis_type, label, score, dt_days_ago(100), dt_days_ago(customer_id)),
            )
        for index, (customer_id, product, audience, amount, days) in enumerate(ORDER_SEED, 1):
            conn.execute(
                "INSERT INTO orders(customer_id,order_no,product_name,audience_code,amount_cents,purchased_at) VALUES(?,?,?,?,?,?)",
                (customer_id, f"DB{20260000 + index}", product, audience, amount, dt_days_ago(days)),
            )
        interaction_texts = [
            "咨询服用周期，希望方案简单一些", "反馈最近工作忙，倾向晚上沟通", "询问产品差异和价格",
            "对体验装感兴趣，暂时不想一次购买太多", "已发送日常关怀，暂未回复", "认可产品，关注长期搭配",
            "希望了解与运动场景的搭配", "活动后留言询问使用方法", "社群打卡积极，愿意分享体验",
            "明确要求减少营销消息", "复购前咨询发货时间", "比较关注性价比与基础营养",
        ]
        for cid, content in enumerate(interaction_texts, 1):
            conn.execute(
                "INSERT INTO interactions(customer_id,channel,direction,scene,content,occurred_at) VALUES(?,?,?,?,?,?)",
                (cid, "企业微信", "inbound" if cid % 2 else "outbound", "consult", content, dt_days_ago(cid * 2)),
            )
        levels = ["黑金", "金卡", "铂金", "银卡", "银卡", "黑金", "金卡", "普通", "铂金", "普通", "金卡", "银卡"]
        for cid, level in enumerate(levels, 1):
            conn.execute(
                "INSERT INTO member_accounts(customer_id,member_no,level,points,growth_value,benefits_json,joined_at) VALUES(?,?,?,?,?,?,?)",
                (cid, f"M{20260000+cid}", level, 180 + cid * 73, 500 + cid * 420, json.dumps(["生日礼", "专属顾问"], ensure_ascii=False), dt_days_ago(180-cid)),
            )
        campaigns = [
            ("NMN老客复购关怀", "nmn", "running", "复购", 486, 71),
            ("麦角硫因焕亮体验季", "ergothioneine", "running", "体验装转化", 328, 49),
            ("辅酶Q10活力计划", "coq10", "scheduled", "预约咨询", 210, 18),
            ("秋季基础营养关怀", "regular", "draft", "会员活跃", 0, 0),
        ]
        for row in campaigns:
            conn.execute("INSERT INTO campaigns(name,audience_code,status,goal,reached,converted,created_at) VALUES(?,?,?,?,?,?,?)", (*row, now_iso()))
        communities = [
            ("示例健康管理群A", "健康管理", "演示顾问A", 120, 0.60, 0.15),
            ("示例营养交流社B", "麦角硫因", "演示顾问B", 90, 0.55, 0.12),
            ("示例活力打卡群C", "辅酶Q10", "演示顾问C", 150, 0.65, 0.18),
            ("示例会员服务群D", "综合营养", "演示顾问D", 200, 0.45, 0.10),
        ]
        for row in communities:
            conn.execute("INSERT INTO communities(name,theme,owner,member_count,active_rate,conversion_rate) VALUES(?,?,?,?,?,?)", row)
        knowledge = [
            ("NMN沟通要点", "先了解客户作息与健康管理目标，再介绍产品定位和使用周期。不得承诺治疗或逆转衰老。", "NMN", "NMN 健康管理 周期"),
            ("麦角硫因咨询话术", "围绕抗氧化营养支持和生活方式沟通，使用客观表述，避免功效绝对化。", "麦角硫因", "麦角硫因 抗氧化 焕亮"),
            ("辅酶Q10沟通要点", "从日常能量管理、运动习惯和营养补充需求切入，不替代医生诊断或药物。", "辅酶Q10", "辅酶Q10 活力 运动"),
            ("价格异议处理", "先认可预算顾虑，再基于实际需求说明产品组合与周期，提供低门槛体验方案，不制造虚假稀缺。", "通用", "价格 异议 体验"),
            ("投诉场景规范", "先道歉和共情，确认事实与诉求，给出明确处理节点并持续跟进。投诉过程中禁止推销。", "通用", "投诉 售后 共情"),
        ]
        for title, content, category, tags in knowledge:
            conn.execute("INSERT INTO knowledge(title,content,category,tags,created_at) VALUES(?,?,?,?,?)", (title, content, category, tags, now_iso()))
        conn.commit()
        for cid in range(1, len(CUSTOMER_SEED) + 1):
            refresh_profile(conn, cid, force=True)


def row_dict(row: sqlite3.Row | None):
    return dict(row) if row else None


def money(cents: int | None) -> float:
    return round((cents or 0) / 100, 2)


def masked_phone(phone: str | None) -> str:
    if not phone or len(phone) < 7:
        return phone or ""
    return phone[:3] + "****" + phone[-4:]


def customer_features(conn: sqlite3.Connection, customer_id: int) -> dict:
    customer = conn.execute("SELECT * FROM customers WHERE id=?", (customer_id,)).fetchone()
    if not customer:
        raise KeyError("customer_not_found")
    orders = conn.execute(
        "SELECT product_name,audience_code,amount_cents,purchased_at,status FROM orders WHERE customer_id=? ORDER BY purchased_at DESC",
        (customer_id,),
    ).fetchall()
    interactions = conn.execute(
        "SELECT channel,direction,scene,content,occurred_at FROM interactions WHERE customer_id=? ORDER BY occurred_at DESC LIMIT 20",
        (customer_id,),
    ).fetchall()
    memberships = conn.execute(
        "SELECT audience_code,basis_label,score,last_matched_at FROM customer_asset_memberships WHERE customer_id=? AND is_active=1 ORDER BY score DESC",
        (customer_id,),
    ).fetchall()
    member = conn.execute("SELECT * FROM member_accounts WHERE customer_id=?", (customer_id,)).fetchone()
    total_cents = sum(row["amount_cents"] for row in orders if row["status"] == "paid")
    feature = {
        "customer": {
            "id": customer["id"], "name": customer["name"], "city": customer["city"],
            "source": customer["source"], "owner": customer["owner"], "store": customer["store"],
            "lifecycle_status": customer["lifecycle_status"], "marketing_consent": bool(customer["marketing_consent"]),
        },
        "assets": [dict(row) for row in memberships],
        "consumption": {
            "order_count": len(orders), "total_amount": money(total_cents),
            "average_order_value": money(total_cents // max(1, len(orders))),
            "last_purchase_at": orders[0]["purchased_at"] if orders else None,
            "products": [row["product_name"] for row in orders[:5]],
        },
        "interaction": {
            "count": len(interactions),
            "last_interaction_at": interactions[0]["occurred_at"] if interactions else None,
            "last_content": interactions[0]["content"] if interactions else "暂无互动记录",
            "preferred_channel": interactions[0]["channel"] if interactions else "企业微信",
        },
        "membership": {
            "level": member["level"] if member else "非会员",
            "points": member["points"] if member else 0,
            "growth_value": member["growth_value"] if member else 0,
            "benefits": json.loads(member["benefits_json"]) if member else [],
        },
        "data_through_at": now_iso(),
    }
    return feature


def make_profile(features: dict) -> dict:
    customer = features["customer"]
    consumption = features["consumption"]
    interaction = features["interaction"]
    membership = features["membership"]
    assets = features["assets"]
    primary = AUDIENCES.get(assets[0]["audience_code"], {}).get("name", "健康管理") if assets else "健康管理"
    value_tag = "高价值" if consumption["total_amount"] >= 3000 else "成长型" if consumption["total_amount"] >= 800 else "体验型"
    active_tag = "近期活跃" if interaction["count"] else "待唤醒"
    consent_tag = "可触达" if customer["marketing_consent"] else "禁止营销"
    tags = [primary, value_tag, active_tag, membership["level"] + "会员", consent_tag]
    summary = (
        f"{customer['name']}来自{customer['source']}，由{customer['owner']}负责，当前处于"
        f"{customer['lifecycle_status']}阶段。主要关注{primary}，累计购买{consumption['order_count']}次，"
        f"累计消费¥{consumption['total_amount']:.2f}，客单约¥{consumption['average_order_value']:.2f}。"
        f"最近互动为“{interaction['last_content']}”，更适合通过{interaction['preferred_channel']}进行"
        f"简洁、基于事实的沟通。"
    )
    if not customer["marketing_consent"]:
        next_action = "当前已关闭营销授权，仅处理必要服务与售后需求。"
    elif value_tag == "体验型":
        next_action = "先确认核心关注点，优先提供低门槛体验与使用说明。"
    else:
        next_action = "结合最近购买周期做关怀，确认使用感受后再提出复购或搭配建议。"
    return {
        "summary": summary,
        "tags": tags,
        "suggestions": [next_action, "避免疾病诊断或绝对功效承诺。", "先回应客户当前问题，再给出单一明确下一步。"],
        "evidence": [
            {"type": "orders", "label": f"{consumption['order_count']}笔订单 / ¥{consumption['total_amount']:.2f}"},
            {"type": "interaction", "label": interaction["last_content"]},
            {"type": "membership", "label": f"{membership['level']} / {membership['points']}积分"},
        ],
        "confidence": 0.88 if consumption["order_count"] and interaction["count"] else 0.72,
    }


def refresh_profile(conn: sqlite3.Connection, customer_id: int, force: bool = False) -> dict:
    features = customer_features(conn, customer_id)
    canonical = json.dumps(features, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    versioned_features = dict(features)
    versioned_features.pop("data_through_at", None)
    version_source = json.dumps(versioned_features, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    data_version = hashlib.sha256(version_source.encode("utf-8")).hexdigest()[:16]
    current = conn.execute(
        "SELECT * FROM customer_ai_profiles WHERE customer_id=? AND is_current=1 ORDER BY id DESC LIMIT 1",
        (customer_id,),
    ).fetchone()
    if current and current["data_version"] == data_version and not force:
        return profile_payload(current, False)
    created_at = now_iso()
    conn.execute(
        "INSERT OR IGNORE INTO customer_feature_snapshots(customer_id,data_version,features_json,data_through_at,created_at) VALUES(?,?,?,?,?)",
        (customer_id, data_version, canonical, features["data_through_at"], created_at),
    )
    profile = make_profile(features)
    prompt_version = "profile-v1" if not force else "profile-v1-manual-" + datetime.now(TZ).strftime("%Y%m%d%H%M%S%f")
    conn.execute("UPDATE customer_ai_profiles SET is_current=0 WHERE customer_id=?", (customer_id,))
    conn.execute(
        """INSERT INTO customer_ai_profiles(customer_id,data_version,summary,tags_json,suggestions_json,evidence_json,
           confidence,provider,prompt_version,generated_at,is_current) VALUES(?,?,?,?,?,?,?,?,?,?,1)""",
        (
            customer_id, data_version, profile["summary"], json.dumps(profile["tags"], ensure_ascii=False),
            json.dumps(profile["suggestions"], ensure_ascii=False), json.dumps(profile["evidence"], ensure_ascii=False),
            profile["confidence"], "rules-fallback", prompt_version, created_at,
        ),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM customer_ai_profiles WHERE id=last_insert_rowid()").fetchone()
    return profile_payload(row, True)


def profile_payload(row: sqlite3.Row, refreshed: bool | None = None) -> dict:
    data = dict(row)
    data["tags"] = json.loads(data.pop("tags_json"))
    data["suggestions"] = json.loads(data.pop("suggestions_json"))
    data["evidence"] = json.loads(data.pop("evidence_json"))
    data["refreshed"] = refreshed
    return data


def get_profile(conn: sqlite3.Connection, customer_id: int) -> dict:
    row = conn.execute(
        "SELECT * FROM customer_ai_profiles WHERE customer_id=? AND is_current=1 ORDER BY id DESC LIMIT 1",
        (customer_id,),
    ).fetchone()
    return profile_payload(row) if row else refresh_profile(conn, customer_id)


def search_knowledge(conn: sqlite3.Connection, query: str, limit: int = 5) -> list[dict]:
    terms = [term for term in re.split(r"\s+", query.strip()) if term]
    rows = conn.execute("SELECT * FROM knowledge WHERE is_active=1").fetchall()
    scored = []
    for row in rows:
        score = 0
        text = f"{row['title']} {row['tags']} {row['content']}".lower()
        for term in terms or [query]:
            term = term.lower()
            if term and term in row["title"].lower():
                score += 10
            if term and term in (row["tags"] or "").lower():
                score += 3
            if term and term in text:
                score += 1
        if score:
            scored.append((score, row))
    scored.sort(key=lambda item: item[0], reverse=True)
    return [{**dict(row), "score": score} for score, row in scored[:limit]]


def llm_reply(system_prompt: str, user_prompt: str) -> str | None:
    base_url = os.environ.get("LLM_BASE_URL", "").rstrip("/")
    api_key = os.environ.get("LLM_API_KEY", "")
    model = os.environ.get("LLM_MODEL", "")
    if not base_url or not model:
        return None
    payload = json.dumps({
        "model": model,
        "messages": [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}],
        "temperature": 0.5,
    }, ensure_ascii=False).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    try:
        req = urllib.request.Request(f"{base_url}/chat/completions", data=payload, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=25) as response:
            result = json.loads(response.read().decode("utf-8"))
            return result["choices"][0]["message"]["content"].strip()
    except (urllib.error.URLError, KeyError, ValueError, TimeoutError):
        return None


def build_agent_suggestion(conn: sqlite3.Connection, customer_id: int, message: str, scene: str, history: list[dict] | None = None) -> dict:
    profile = get_profile(conn, customer_id)
    customer = conn.execute("SELECT * FROM customers WHERE id=?", (customer_id,)).fetchone()
    assets = conn.execute(
        "SELECT audience_code FROM customer_asset_memberships WHERE customer_id=? AND is_active=1 ORDER BY score DESC",
        (customer_id,),
    ).fetchall()
    audience_name = AUDIENCES.get(assets[0]["audience_code"], {}).get("name", "健康管理") if assets else "健康管理"
    sources = search_knowledge(conn, f"{audience_name} {message}", 3)
    scene_openers = {
        "ice_break": "您好，看到您最近一直在关注健康管理，我想先了解一下您目前最希望改善的是哪一方面？",
        "consult": "谢谢您把关注点告诉我。结合您之前的了解和购买习惯，我先把最关键的信息说清楚：",
        "objection": "能理解您的顾虑，尤其是长期健康投入确实需要认真比较。我们可以先从您最在意的一点逐项看：",
        "push": "结合您前面的需求，当前更适合先确定一个低门槛、容易坚持的方案：",
        "follow": "想关心一下您最近的使用感受，有没有哪一点需要我帮您再说明或调整？",
        "complaint": "很抱歉这次体验让您不满意。我先确认具体情况和您的诉求，并负责跟进到有明确结果。",
    }
    opener = scene_openers.get(scene, scene_openers["consult"])
    latest = message.strip() or "客户暂无明确问题"
    product_tip = sources[0]["content"] if sources else "先确认客户当前需求，再提供客观、简洁的产品信息。"
    primary = f"{customer['name']}，{opener}\n\n针对您刚才提到的“{latest}”，{product_tip}"
    if not customer["marketing_consent"]:
        primary = f"{customer['name']}，我已看到您的消息。当前仅就您主动提出的问题提供必要服务：{product_tip}"
    alternatives = [
        f"更简洁：先确认“{latest}”里您最在意的是效果预期、使用方式还是预算，我按这一点给您说明。",
        f"更温和：不用急着做决定，我们先结合您之前对{audience_name}的关注，把适合与不适合的情况说明白。",
    ]
    system = "你是多特倍斯健康顾问话术助手。只基于给定事实，禁止疾病诊断、治疗承诺、绝对功效和虚假稀缺。输出一段可直接发送的中文话术。"
    prompt = json.dumps({"profile": profile["summary"], "scene": scene, "customer_message": latest, "knowledge": [s["content"] for s in sources], "history": history or []}, ensure_ascii=False)
    generated = llm_reply(system, prompt)
    return {
        "reply": generated or primary,
        "alternatives": alternatives,
        "recommendation_reason": f"已结合{audience_name}归属、{len(profile['tags'])}个画像标签、最近互动和{scene}场景。",
        "suggested_actions": profile["suggestions"][:2],
        "policy_flags": ["非医疗诊断", "避免绝对功效"] + ([] if customer["marketing_consent"] else ["禁止营销，仅必要服务"]),
        "sources": [{"id": s["id"], "title": s["title"], "category": s["category"]} for s in sources],
        "profile_version": profile["data_version"],
        "provider": "llm" if generated else "rules-fallback",
    }


def customer_summary(conn: sqlite3.Connection, row: sqlite3.Row) -> dict:
    customer_id = row["id"]
    aggregate = conn.execute(
        "SELECT COUNT(*) order_count, COALESCE(SUM(amount_cents),0) total_cents, MAX(purchased_at) last_purchase FROM orders WHERE customer_id=? AND status='paid'",
        (customer_id,),
    ).fetchone()
    member = conn.execute("SELECT level,points FROM member_accounts WHERE customer_id=?", (customer_id,)).fetchone()
    interaction = conn.execute("SELECT content,occurred_at FROM interactions WHERE customer_id=? ORDER BY occurred_at DESC LIMIT 1", (customer_id,)).fetchone()
    profile = get_profile(conn, customer_id)
    memberships = conn.execute(
        "SELECT m.audience_code,d.name,m.basis_label,m.score FROM customer_asset_memberships m JOIN asset_audience_definitions d ON d.code=m.audience_code WHERE m.customer_id=? AND m.is_active=1 ORDER BY m.score DESC",
        (customer_id,),
    ).fetchall()
    return {
        "id": customer_id, "name": row["name"], "nickname": row["nickname"], "phone": masked_phone(row["phone"]),
        "city": row["city"], "source": row["source"], "owner": row["owner"], "store": row["store"],
        "lifecycle_status": row["lifecycle_status"], "marketing_consent": bool(row["marketing_consent"]),
        "order_count": aggregate["order_count"], "total_amount": money(aggregate["total_cents"]), "last_purchase_at": aggregate["last_purchase"],
        "member_level": member["level"] if member else "非会员", "points": member["points"] if member else 0,
        "last_interaction": interaction["content"] if interaction else "暂无互动", "last_interaction_at": interaction["occurred_at"] if interaction else None,
        "assets": [dict(item) for item in memberships],
        "profile": {"summary": profile["summary"], "tags": profile["tags"], "confidence": profile["confidence"], "generated_at": profile["generated_at"]},
    }


def customer_detail(conn: sqlite3.Connection, customer_id: int) -> dict:
    customer = conn.execute("SELECT * FROM customers WHERE id=?", (customer_id,)).fetchone()
    if not customer:
        raise KeyError("customer_not_found")
    base = customer_summary(conn, customer)
    base["phone"] = masked_phone(customer["phone"])
    base["gender"] = customer["gender"]
    base["created_at"] = customer["created_at"]
    base["orders"] = [{**dict(row), "amount": money(row["amount_cents"])} for row in conn.execute("SELECT * FROM orders WHERE customer_id=? ORDER BY purchased_at DESC", (customer_id,))]
    base["interactions"] = [dict(row) for row in conn.execute("SELECT * FROM interactions WHERE customer_id=? ORDER BY occurred_at DESC", (customer_id,))]
    member = conn.execute("SELECT * FROM member_accounts WHERE customer_id=?", (customer_id,)).fetchone()
    base["membership"] = dict(member) if member else None
    if base["membership"]:
        base["membership"]["benefits"] = json.loads(base["membership"].pop("benefits_json"))
    base["ai_profile"] = get_profile(conn, customer_id)
    base["conversations"] = [dict(row) for row in conn.execute("SELECT id,scene,status,created_at,updated_at FROM agent_conversations WHERE customer_id=? ORDER BY updated_at DESC LIMIT 10", (customer_id,))]
    return base


def dashboard(conn: sqlite3.Connection) -> dict:
    total = conn.execute("SELECT COUNT(*) FROM customers").fetchone()[0]
    consented = conn.execute("SELECT COUNT(*) FROM customers WHERE marketing_consent=1").fetchone()[0]
    members = conn.execute("SELECT COUNT(*) FROM member_accounts").fetchone()[0]
    revenue = money(conn.execute("SELECT COALESCE(SUM(amount_cents),0) FROM orders WHERE status='paid'").fetchone()[0])
    running = conn.execute("SELECT COUNT(*) FROM campaigns WHERE status='running'").fetchone()[0]
    profiles = conn.execute("SELECT COUNT(*) FROM customer_ai_profiles WHERE is_current=1").fetchone()[0]
    categories = asset_categories(conn)
    return {
        "metrics": {"customers": total, "reachable": consented, "members": members, "revenue": revenue, "running_campaigns": running, "profile_coverage": round(profiles / max(1, total) * 100, 1)},
        "categories": categories,
        "recent_customers": [customer_summary(conn, row) for row in conn.execute("SELECT * FROM customers ORDER BY updated_at DESC LIMIT 5")],
    }


def asset_categories(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute("SELECT * FROM asset_audience_definitions WHERE is_active=1 ORDER BY sort_order").fetchall()
    result = []
    for row in rows:
        count = conn.execute("SELECT COUNT(DISTINCT customer_id) FROM customer_asset_memberships WHERE audience_code=? AND is_active=1", (row["code"],)).fetchone()[0]
        avg_score = conn.execute("SELECT COALESCE(AVG(score),0) FROM customer_asset_memberships WHERE audience_code=? AND is_active=1", (row["code"],)).fetchone()[0]
        converted = conn.execute("SELECT COUNT(DISTINCT customer_id) FROM orders WHERE audience_code=? AND status='paid'", (row["code"],)).fetchone()[0]
        item = dict(row)
        item.update({"customer_count": count, "average_score": round(avg_score, 1), "buyers": converted})
        result.append(item)
    return result


def audit(conn: sqlite3.Connection, user_id: int | None, action: str, object_type: str = "", object_id: str = "", detail: dict | None = None) -> None:
    conn.execute(
        "INSERT INTO audit_logs(user_id,action,object_type,object_id,detail_json,created_at) VALUES(?,?,?,?,?,?)",
        (user_id, action, object_type, object_id, json.dumps(detail or {}, ensure_ascii=False), now_iso()),
    )
    conn.commit()


class Handler(BaseHTTPRequestHandler):
    server_version = "DotbestOps/1.0"

    def log_message(self, format, *args):
        sys.stdout.write(f"{now_iso()} {self.address_string()} {format % args}\n")

    def request_id(self) -> str:
        if not hasattr(self, "_request_id"):
            self._request_id = "req_" + secrets.token_hex(6)
        return self._request_id

    def json_response(self, status: int, data=None, error: dict | None = None, headers: dict | None = None):
        body = json.dumps({"success": error is None, "data": data, "error": error, "request_id": self.request_id()}, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        if length > 1_000_000:
            raise ValueError("request_too_large")
        raw = self.rfile.read(length) if length else b"{}"
        return json.loads(raw.decode("utf-8"))

    def current_user(self, conn: sqlite3.Connection):
        raw = self.headers.get("Cookie", "")
        jar = cookies.SimpleCookie()
        try:
            jar.load(raw)
            token = jar["session"].value if "session" in jar else None
        except cookies.CookieError:
            token = None
        if not token:
            return None
        return conn.execute(
            """SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id
               WHERE s.token=? AND s.expires_at>? AND u.is_active=1""",
            (token, now_iso()),
        ).fetchone()

    def require_user(self, conn: sqlite3.Connection):
        user = self.current_user(conn)
        if not user:
            self.json_response(401, error={"code": "UNAUTHORIZED", "message": "请先登录"})
        return user

    def require_permission(self, user, permission: str) -> bool:
        if not user_can(user, permission):
            self.json_response(403, error={"code": "FORBIDDEN", "message": "当前角色无权执行此操作"})
            return False
        return True

    def serve_file(self, path: Path, content_type: str | None = None):
        if not path.exists() or not path.is_file():
            self.send_error(404)
            return
        body = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type or mimetypes.guess_type(str(path))[0] or "application/octet-stream")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)
        if path in ("/", "/login", "/dashboard"):
            return self.serve_file(TEMPLATE_DIR / "index.html", "text/html; charset=utf-8")
        if path.startswith("/assets/"):
            name = Path(path).name
            if name not in {"app.css", "app.js"}:
                return self.send_error(404)
            return self.serve_file(ASSET_DIR / name)
        if path == "/health/live":
            return self.json_response(200, {"status": "ok", "time": now_iso()})
        conn = connect()
        try:
            user = self.require_user(conn)
            if not user:
                return
            if path == "/api/me":
                return self.json_response(200, {"id": user["id"], "username": user["username"], "display_name": user["display_name"], "role": user["role"]})
            if path == "/api/v1/private/dashboard":
                if not self.require_permission(user, "analytics:read"):
                    return
                return self.json_response(200, dashboard(conn))
            if path == "/api/v1/private/workbench":
                if not self.require_permission(user, "customer:read"):
                    return
                return self.json_response(200, demo_backend.demo_store.workbench())
            if path in ("/api/v1/private/user-assets", "/api/v1/private/user-assets/categories"):
                if not self.require_permission(user, "customer:read"):
                    return
                return self.json_response(200, demo_backend.demo_store.user_assets())
            match = re.fullmatch(r"/api/v1/private/user-assets/([a-z0-9_-]+)/customers", path)
            if match:
                if not self.require_permission(user, "customer:read"):
                    return
                code = match.group(1)
                data = demo_backend.demo_store.audience_customers(code, query.get("q", [""])[0].strip())
                if data is None:
                    return self.json_response(404, error={"code": "NOT_FOUND", "message": "用户资产分类不存在"})
                return self.json_response(200, data)
            match = re.fullmatch(r"/api/v1/private/customers/(\d+)", path)
            if match:
                if not self.require_permission(user, "customer:read"):
                    return
                customer = demo_backend.demo_store.get_customer(int(match.group(1)))
                if customer is None:
                    return self.json_response(404, error={"code": "NOT_FOUND", "message": "用户不存在"})
                return self.json_response(200, customer)
            match = re.fullmatch(r"/api/v1/private/conversations", path)
            if match:
                if not self.require_permission(user, "customer:read"):
                    return
                return self.json_response(200, demo_backend.demo_store.conversations_list())
            match = re.fullmatch(r"/api/v1/private/agent-conversations/(\d+)", path)
            if match:
                if not self.require_permission(user, "customer:read"):
                    return
                data = demo_backend.demo_store.get_conversation(int(match.group(1)))
                if data is None:
                    return self.json_response(404, error={"code": "NOT_FOUND", "message": "会话不存在"})
                return self.json_response(200, data)
            if path == "/api/v1/private/tasks":
                if not self.require_permission(user, "customer:read"):
                    return
                return self.json_response(200, demo_backend.demo_store.tasks_list(query.get("category", ["all"])[0]))
            match = re.fullmatch(r"/api/v1/private/tasks/([A-Za-z0-9_-]+)", path)
            if match:
                if not self.require_permission(user, "customer:read"):
                    return
                task = demo_backend.demo_store.get_task(match.group(1))
                if task is None:
                    return self.json_response(404, error={"code": "NOT_FOUND", "message": "任务不存在"})
                return self.json_response(200, task)
            if path == "/api/v1/private/scripts":
                if not self.require_permission(user, "governance:read"):
                    return
                return self.json_response(200, demo_backend.demo_store.scripts_payload())
            if path == "/api/v1/private/governance":
                if not self.require_permission(user, "governance:read"):
                    return
                return self.json_response(200, demo_backend.demo_store.governance())
            if path == "/api/v1/private/members":
                if not self.require_permission(user, "analytics:read"):
                    return
                rows = conn.execute("SELECT m.*,c.name,c.city,c.owner FROM member_accounts m JOIN customers c ON c.id=m.customer_id ORDER BY m.growth_value DESC").fetchall()
                return self.json_response(200, [{**dict(row), "benefits": json.loads(row["benefits_json"])} for row in rows])
            if path == "/api/v1/private/campaigns":
                if not self.require_permission(user, "analytics:read"):
                    return
                return self.json_response(200, [dict(row) for row in conn.execute("SELECT c.*,d.name audience_name FROM campaigns c LEFT JOIN asset_audience_definitions d ON d.code=c.audience_code ORDER BY c.id DESC")])
            if path == "/api/v1/private/communities":
                if not self.require_permission(user, "analytics:read"):
                    return
                return self.json_response(200, [dict(row) for row in conn.execute("SELECT * FROM communities ORDER BY member_count DESC")])
            if path == "/api/v1/private/analytics/overview":
                if not self.require_permission(user, "analytics:read"):
                    return
                categories = asset_categories(conn)
                for item in categories:
                    revenue = conn.execute("SELECT COALESCE(SUM(amount_cents),0) FROM orders WHERE audience_code=? AND status='paid'", (item["code"],)).fetchone()[0]
                    item["revenue"] = money(revenue)
                    item["conversion_rate"] = round(item["buyers"] / max(1, item["customer_count"]) * 100, 1)
                return self.json_response(200, {"categories": categories, "generated_at": now_iso()})
            if path == "/api/search":
                if not self.require_permission(user, "customer:read"):
                    return
                q = query.get("q", [""])[0]
                return self.json_response(200, search_knowledge(conn, q))
            return self.json_response(404, error={"code": "NOT_FOUND", "message": "接口不存在"})
        except KeyError:
            return self.json_response(404, error={"code": "NOT_FOUND", "message": "用户不存在"})
        except Exception as exc:  # noqa: BLE001 - handler boundary returns a JSON 500
            traceback.print_exc()
            return self.json_response(500, error={"code": "INTERNAL_ERROR", "message": str(exc)})
        finally:
            conn.close()

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        conn = connect()
        try:
            payload = self.read_json()
            if path == "/api/login":
                username = str(payload.get("username", "")).strip()
                password = str(payload.get("password", ""))
                user = conn.execute("SELECT * FROM users WHERE username=? AND is_active=1", (username,)).fetchone()
                if not user or not password_verify(password, user["password_hash"]):
                    return self.json_response(401, error={"code": "INVALID_CREDENTIALS", "message": "用户名或密码错误"})
                token = secrets.token_urlsafe(32)
                expires = (datetime.now(TZ) + timedelta(hours=SESSION_HOURS)).replace(microsecond=0).isoformat()
                conn.execute("DELETE FROM sessions WHERE expires_at<=?", (now_iso(),))
                conn.execute("INSERT INTO sessions(token,user_id,expires_at,created_at) VALUES(?,?,?,?)", (token, user["id"], expires, now_iso()))
                conn.commit()
                audit(conn, user["id"], "login", "session", str(user["id"]), {"username": user["username"]})
                header = f"session={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age={SESSION_HOURS*3600}"
                return self.json_response(200, {"display_name": user["display_name"], "role": user["role"]}, headers={"Set-Cookie": header})
            user = self.require_user(conn)
            if not user:
                return
            if path == "/api/logout":
                raw = self.headers.get("Cookie", "")
                jar = cookies.SimpleCookie(raw)
                if "session" in jar:
                    conn.execute("DELETE FROM sessions WHERE token=?", (jar["session"].value,))
                    conn.commit()
                    audit(conn, user["id"], "logout", "session", str(user["id"]))
                return self.json_response(200, {"logged_out": True}, headers={"Set-Cookie": "session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax"})
            if path == "/api/v1/private/customers":
                if not self.require_permission(user, "customer:write"):
                    return
                try:
                    customer = demo_backend.demo_store.create_customer(payload)
                except ValueError as exc:
                    return self.json_response(400, error={"code": "VALIDATION_ERROR", "message": str(exc)})
                audit(conn, user["id"], "customer_created", "customer", str(customer["id"]), {"name": customer["name"], "owner": customer["owner"]})
                return self.json_response(201, customer)
            if path == "/api/v1/private/customers/import":
                if not self.require_permission(user, "customer:write"):
                    return
                try:
                    rows = payload.get("rows") if isinstance(payload, dict) else None
                    result = demo_backend.demo_store.import_customers(rows or [])
                except (ValueError, TypeError) as exc:
                    return self.json_response(400, error={"code": "VALIDATION_ERROR", "message": str(exc)})
                audit(conn, user["id"], "customers_imported", "customer", str(result["imported"]), {"count": result["imported"]})
                return self.json_response(201, result)
            match = re.fullmatch(r"/api/v1/private/customers/(\d+)/ai-profile/refresh", path)
            if match:
                if not self.require_permission(user, "customer:read"):
                    return
                profile = demo_backend.demo_store.refresh_profile(int(match.group(1)))
                if profile is None:
                    return self.json_response(404, error={"code": "NOT_FOUND", "message": "用户不存在"})
                audit(conn, user["id"], "profile_refreshed", "customer", match.group(1))
                return self.json_response(200, profile)
            match = re.fullmatch(r"/api/v1/private/customers/(\d+)/agent-conversations", path)
            if match:
                if not self.require_permission(user, "customer:read"):
                    return
                conversation = demo_backend.demo_store.get_or_create_conversation(int(match.group(1)))
                if conversation is None:
                    return self.json_response(404, error={"code": "NOT_FOUND", "message": "用户不存在"})
                audit(conn, user["id"], "conversation_opened", "customer", match.group(1))
                return self.json_response(201, conversation)
            match = re.fullmatch(r"/api/v1/private/agent-conversations/(\d+)/messages", path)
            if match:
                if not self.require_permission(user, "conversation:reply"):
                    return
                conversation_id = int(match.group(1))
                message = str(payload.get("message") or "").strip()
                scene = str(payload.get("scene") or "")
                result = demo_backend.demo_store.post_message(conversation_id, message, scene, payload.get("task_id"))
                if result is None:
                    return self.json_response(404, error={"code": "NOT_FOUND", "message": "会话不存在"})
                audit(conn, user["id"], "suggestion_generated", "conversation", str(conversation_id), {"scene": scene})
                return self.json_response(200, result)
            match = re.fullmatch(r"/api/v1/private/agent-conversations/(\d+)/mark-sent", path)
            if match:
                if not self.require_permission(user, "conversation:reply"):
                    return
                conversation_id = int(match.group(1))
                result = demo_backend.demo_store.mark_sent(
                    conversation_id, str(payload.get("reply") or ""), payload.get("task_id")
                )
                if result is None:
                    return self.json_response(404, error={"code": "NOT_FOUND", "message": "会话不存在"})
                audit(conn, user["id"], "message_marked_sent", "conversation", str(conversation_id), {"task_id": payload.get("task_id")})
                return self.json_response(200, result)
            if path == "/api/v1/private/tasks/optimization/refresh":
                if not self.require_permission(user, "task:update"):
                    return
                audit(conn, user["id"], "optimization_refreshed", "tasks", "optimization")
                return self.json_response(200, demo_backend.demo_store.refresh_optimization())
            match = re.fullmatch(r"/api/v1/private/tasks/([A-Za-z0-9_-]+)/status", path)
            if match:
                if not self.require_permission(user, "task:update"):
                    return
                task_id = match.group(1)
                task = demo_backend.demo_store.set_task_status(task_id, payload.get("status"))
                if task is None:
                    return self.json_response(404, error={"code": "NOT_FOUND", "message": "任务不存在"})
                audit(conn, user["id"], "task_status_changed", "task", task_id, {"status": payload.get("status")})
                return self.json_response(200, task)
            if path == "/api/chat":
                if not self.require_permission(user, "conversation:reply"):
                    return
                question = str(payload.get("question", "")).strip()
                customer_id = payload.get("customer_id")
                if customer_id:
                    return self.json_response(200, build_agent_suggestion(conn, int(customer_id), question, payload.get("scene", "consult"), payload.get("history", [])))
                sources = search_knowledge(conn, question)
                reply = sources[0]["content"] if sources else "我会先确认客户的具体需求，再基于已审核知识提供客观建议。"
                return self.json_response(200, {"reply": reply, "sources": sources})
            return self.json_response(404, error={"code": "NOT_FOUND", "message": "接口不存在"})
        except (ValueError, json.JSONDecodeError) as exc:
            return self.json_response(400, error={"code": "VALIDATION_ERROR", "message": str(exc)})
        except KeyError:
            return self.json_response(404, error={"code": "NOT_FOUND", "message": "用户不存在"})
        except Exception as exc:  # noqa: BLE001 - handler boundary returns a JSON 500
            traceback.print_exc()
            return self.json_response(500, error={"code": "INTERNAL_ERROR", "message": str(exc)})
        finally:
            conn.close()


def main() -> None:
    init_db()
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"多特倍斯运营中台已启动：http://localhost:{PORT}")
    print("演示账号：" + os.environ.get("ADMIN_USERNAME", "demo_operator") + " / " + os.environ.get("ADMIN_PASSWORD", "demo"))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n正在停止服务…")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
