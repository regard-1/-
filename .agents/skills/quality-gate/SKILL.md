---
name: "quality-gate"
description: "Pre-commit quality gate for pure-Python projects: ruff lint + unittest smoke + snapshot tests. Snapshot tests detect AI regressions in old features. Invoke when preparing to commit or deploy after modifying server.py or *.py. Trigger words: commit/提交/部署前/质量检查/regression/跑测试/unittest. Do not skip, do not modify tests to pass."
---

# 代码质量闸门（AI 改完代码 commit 前必跑）

本项目无 CI/CD，由 AI 协作开发。**改完任何 `.py` 文件准备 commit 前，必须跑完四道闸门**，禁止跳过、禁止 `--no-verify`、禁止改测试/改配置来"通过"。

---

## 前置：基础设施必须就位

闸门依赖下列工具，若缺失 AI 必须先协助配置：
- `ruff` —— lint（`pip install ruff`）
- `unittest` —— Python 标准库自带，无需安装
- `tests/` 目录 —— 测试用例（已有 `tests/test_core.py`）

若项目未装 ruff，AI 必须提示用户："质量闸门依赖 ruff，当前项目未配置，需先 `pip install ruff`，否则闸门无效。"

---

## 四道闸门（按顺序跑）

### 闸门 1：ruff lint（秒级，必跑）

```bash
ruff check .
```

- **0 error** 才能继续，warning 可接受
- 抓未使用 import、未定义变量、语法错、可变默认参数、重复变量名
- 失败必须修复，禁止 `--no-verify` 跳过
- 配置：项目根建 `ruff.toml` 或 `pyproject.toml` 的 `[tool.ruff]` 段

```toml
# ruff.toml 示例
target-version = "py310"
line-length = 120

[lint]
select = ["E", "F", "W", "I", "UP", "B"]
ignore = ["E501"]  # 行长已有 line-length 管
```

### 闸门 2：unittest 冒烟测试（分钟级，必跑）

```bash
python -m unittest discover -s tests -v
```

- 所有测试全绿才能继续
- 失败必须修复，禁止跳过、禁止删测试、禁止改断言来"通过"
- 现有测试在 `tests/test_core.py`，覆盖核心功能

### 闸门 3：快照测试（防篡改旧功能，必跑）

**这是专门防 AI 篡改旧功能的武器**。把关键 API 的响应结构"拍照"固化，AI 改了字段名/删了字段/改了返回结构 → 快照 diff 立刻失败。

#### 实现（用 unittest + json 比较）

```python
# tests/test_snapshots.py
import json
import os
import tempfile
import unittest
from pathlib import Path

import server


class SnapshotTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp_dir = tempfile.TemporaryDirectory()
        cls.db_path = Path(cls.temp_dir.name) / "test.db"
        server.init_db(cls.db_path)
        cls.snapshot_dir = Path(__file__).parent / "__snapshots__"
        cls.snapshot_dir.mkdir(exist_ok=True)
    
    @classmethod
    def tearDownClass(cls):
        cls.temp_dir.cleanup()
    
    def _snapshot(self, name: str, data):
        """对比快照，不存在则创建"""
        snapshot_file = self.snapshot_dir / f"{name}.json"
        actual = json.dumps(data, ensure_ascii=False, sort_keys=True, indent=2)
        if snapshot_file.exists():
            expected = snapshot_file.read_text(encoding="utf-8")
            self.assertEqual(actual, expected, 
                f"快照 {name} 不匹配，响应结构变了。\n"
                f"如果是预期变更，删除 {snapshot_file} 重新跑生成新快照")
        else:
            snapshot_file.write_text(actual, encoding="utf-8")
            self.fail(f"快照 {name} 首次创建，请检查 {snapshot_file} 后重跑")
    
    def test_asset_categories_snapshot(self):
        conn = server.connect(self.db_path)
        try:
            result = server.asset_categories(conn)
            self._snapshot("asset_categories", result)
        finally:
            conn.close()
    
    def test_customer_detail_snapshot(self):
        conn = server.connect(self.db_path)
        try:
            result = server.customer_detail(conn, 1)
            self._snapshot("customer_detail_1", result)
        finally:
            conn.close()
```

#### 运行

```bash
python -m unittest tests.test_snapshots -v
```

#### 快照变化处理
- 快照失败 = 响应结构变了
- **必须人工确认**：是预期变更还是 AI 篡改？
- 预期变更：删除对应快照文件，重跑生成新快照，commit message 说明
- 非预期：AI 改坏了，回滚

### 闸门 4：手动 diff review（秒级，必跑）

```bash
git diff
git diff --cached
```

- AI 必须自己 review 改动，确认：
  - 没有意外改动无关文件
  - 没有删除/修改 `tests/__snapshots__/` 下的快照（除非确认预期变更）
  - 没有引入新依赖（除非用户要求）
  - 没有改动 `.gitignore` 排除的文件

---

## 失败处理

| 闸门 | 失败原因 | 处理 |
|------|---------|------|
| ruff | 语法错/坏味道 | 修复，禁止跳过 |
| unittest | 功能坏了 | 修复，禁止删测试 |
| 快照 | 响应结构变了 | 确认预期性，预期则 update，非预期则回滚 |
| diff review | 改了不该改的 | 回退无关改动 |

**铁律**：任何一道失败都不许 commit。不许 `--no-verify`。不许改测试来"通过"。不许删快照来"通过"。

---

## 快照管理

- 快照文件在 `tests/__snapshots__/` 下，`.json` 格式
- 快照**入库**（不是运行时产物，是测试资产）
- 快照变化必须在 commit message 说明："refactor: 客户详情加 mobile 字段，更新快照"
- 禁止 AI 自行删除快照文件（必须人工确认）

---

## AI 自检清单

改完代码 commit 前逐项核对：

- [ ] `ruff check .` 0 error
- [ ] `python -m unittest discover -s tests -v` 全绿
- [ ] `python -m unittest tests.test_snapshots -v` 全绿
- [ ] 快照变化已人工确认（如有）
- [ ] `git diff` review 过，无意外改动
- [ ] 没有改动 `tests/__snapshots__/` 下的快照（除非确认预期变更）
- [ ] 没有引入新依赖（除非用户要求）
- [ ] commit message 符合规范（`feat/fix/refactor: 说明`）
