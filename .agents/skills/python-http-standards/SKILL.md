***

name: "python-http-standards"
description: "Code conventions for pure-Python http.server + sqlite3 projects (no FastAPI). Unified JSON response, error handling, sqlite3 connection patterns, Cookie session, route dispatch. Invoke when creating or modifying server.py, routes, handlers, or sqlite operations. Trigger words: 新增接口/改后端/server.py/路由/handler/sqlite/SQLite/BaseHTTPRequestHandler. Do not invoke for frontend, static assets, or non-Python files."
----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

# 纯 Python http.server 代码规范

本项目使用 Python 标准库 `http.server.BaseHTTPRequestHandler` + `sqlite3`，**不使用 FastAPI/Flask/Django**。所有后端代码在 `server.py` 单文件或少量辅助模块中。

AI 改后端代码前必须遵守本规范，禁止引入 FastAPI/Flask 等框架，禁止引入 ORM（SQLAlchemy），保持纯标准库。

***

## 一、统一响应格式

### 1. 所有 API 接口返回统一 JSON 结构

```python
{
    "code": 200,           # Integer，成功200，业务异常≥1000，系统异常≥5000
    "msg": "操作成功",     # String，成功为"操作成功"，异常为具体提示
    "data": {...},         # 业务数据，无数据返回 None 或空集合
    "timestamp": 1695628800000  # Long，毫秒级时间戳
}
```

### 2. 响应码规范

* 成功：200

* 业务异常：1001（参数校验失败）、1002（数据不存在）、1003（权限不足）、1004（状态非法）

* 系统异常：5000（服务器内部错误）、5001（数据库异常）、5002（第三方接口调用失败）

### 3. 辅助函数（必须使用，禁止手搓）

```python
def _send_json(self, code: int, msg: str, data=None, status_code: int = 200):
    """统一 JSON 响应"""
    body = json.dumps({
        "code": code,
        "msg": msg,
        "data": data,
        "timestamp": int(datetime.now(TZ).timestamp() * 1000),
    }, ensure_ascii=False, default=str).encode("utf-8")
    self.send_response(status_code)
    self.send_header("Content-Type", "application/json; charset=utf-8")
    self.send_header("Content-Length", str(len(body)))
    self.end_headers()
    self.wfile.write(body)

def _ok(self, data=None, msg: str = "操作成功"):
    """成功响应"""
    self._send_json(200, msg, data)

def _fail(self, code: int, msg: str, status_code: int = 400):
    """失败响应"""
    self._send_json(code, msg, None, status_code)
```

### 4. 禁止行为

* 禁止直接 `self.wfile.write(json.dumps(...))` 不走统一响应

* 禁止返回非 JSON（除静态文件下载外）

* 禁止返回结构不统一的 JSON（必须含 code/msg/data/timestamp 四字段）

***

## 二、错误处理

### 1. 全局异常捕获

所有 handler 方法必须用 try/except 包裹：

```python
def do_POST(self):
    try:
        # 业务逻辑
        ...
        self._ok(data)
    except BizError as e:
        self._fail(e.code, e.msg)
    except sqlite3.Error as e:
        self._fail(5001, f"数据库异常: {e}")
    except Exception as e:
        traceback.print_exc()
        self._fail(5000, f"服务器内部错误: {e}", status_code=500)
```

### 2. 业务异常类

```python
class BizError(Exception):
    """业务异常，带响应码"""
    def __init__(self, code: int, msg: str):
        self.code = code
        self.msg = msg
        super().__init__(msg)
```

### 3. 禁止行为

* 禁止裸 `except:` 吞掉异常不返回

* 禁止 `raise` 到顶层让 server 崩溃

* 禁止把完整堆栈 `traceback.format_exc()` 放进 `msg` 返回前端（泄露内部信息）

***

## 三、数据库（sqlite3）规范

### 1. 连接管理

```python
def connect(db_path: Path) -> sqlite3.Connection:
    """获取数据库连接，每请求新建，用完即关"""
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row  # 行字典化，禁止用元组下标
    conn.execute("PRAGMA journal_mode=WAL")  # WAL 模式，并发读不阻塞
    conn.execute("PRAGMA foreign_keys=ON")
    return conn
```

### 2. 查询规范

* **必须用参数化查询**，禁止字符串拼接 SQL（防注入）：

  ```python
  # 正确
  conn.execute("SELECT * FROM customers WHERE id=?", (customer_id,))

  # 错误（SQL 注入）
  conn.execute(f"SELECT * FROM customers WHERE id={customer_id}")
  ```

* 查询返回 `sqlite3.Row`，通过 `row["column"]` 访问，禁止 `row[0]` 下标

* 批量查询返回 `list[dict]`，用 `dict(row)` 转换

### 3. 表结构

* 表名用 `snake_case` 复数（`customers`、`outreach_tasks`、`messages`）

* 字段名用 `snake_case`（`customer_id`、`created_at`、`is_deleted`）

* 逻辑删除字段统一 `is_deleted INTEGER DEFAULT 0`（0=未删，1=已删），禁用 BOOLEAN

* 时间字段用 `TEXT` 存 ISO8601 字符串（`datetime.now(TZ).isoformat()`），不用 TIMESTAMP 类型

* 主键统一 `id INTEGER PRIMARY KEY AUTOINCREMENT`

### 4. 初始化

* `init_db(db_path)` 函数负责建表 + 种子数据

* 用 `CREATE TABLE IF NOT EXISTS`，保证幂等

* 每次启动都调用，不破坏已有数据

### 5. 禁止行为

* 禁止全局连接（多线程会串数据），每请求新建连接

* 禁止字符串拼接 SQL

* 禁止用 `row[0]` 访问列

* 禁止用 ORM（SQLAlchemy/Tortoise），保持纯 sqlite3

***

## 四、路由分发

### 1. 统一路由表

`do_GET` / `do_POST` / `do_PUT` / `do_DELETE` 只做路由分发，业务逻辑写在独立函数：

```python
def do_GET(self):
    path = urlparse(self.path).path
    try:
        if path == "/api/customers":
            self._handle_list_customers()
        elif path.startswith("/api/customers/"):
            customer_id = int(path.rsplit("/", 1)[-1])
            self._handle_get_customer(customer_id)
        elif path == "/api/health":
            self._ok({"status": "ok"})
        else:
            self._fail(1002, "接口不存在", status_code=404)
    except BizError as e:
        self._fail(e.code, e.msg)
    except Exception as e:
        traceback.print_exc()
        self._fail(5000, str(e), status_code=500)

def _handle_list_customers(self):
    # 业务逻辑
    ...
    self._ok({"items": customers, "total": total})
```

### 2. 路径规范

* API 路径统一 `/api/` 前缀

* 资源用复数：`/api/customers`、`/api/messages`

* 资源详情用路径参数：`/api/customers/{id}`

* 静态文件不走 `/api/`

### 3. 禁止行为

* 禁止在 `do_GET` 里写长业务逻辑（必须抽成 `_handle_xxx` 函数）

* 禁止用 if-elif 链超过 20 个分支（考虑用路由字典）

* 禁止把业务异常直接 `raise` 到 `do_GET` 外层

***

## 五、会话与权限

### 1. Cookie 会话（现有机制）

* 登录后下发 `session_id` Cookie，`HttpOnly` + `SameSite=Strict`

* 服务端用 `sessions` 表存 session\_id → user\_id 映射，带过期时间

* 每请求校验 Cookie，过期或不存在返回 401

### 2. 权限校验

* 每个 `_handle_xxx` 开头必须校验登录状态（除登录/健康检查接口）

* 敏感操作（删除、批量操作）必须校验角色权限

* 运营人员只能看自己负责的用户（`WHERE owner_id = ?`）

### 3. 禁止行为

* 禁止把 user\_id 放在 URL 或 query 参数里（必须从 session 取，防越权）

* 禁止 Cookie 不设 HttpOnly（XSS 可偷）

* 禁止跨用户查询（必须带 owner\_id 过滤）

***

## 六、参数校验

### 1. 必填字段校验

```python
def _require_fields(data: dict, fields: list[str]) -> None:
    """校验必填字段，缺字段抛 BizError"""
    missing = [f for f in fields if f not in data or data[f] in (None, "")]
    if missing:
        raise BizError(1001, f"缺少必填字段: {', '.join(missing)}")
```

### 2. 类型与范围

* 字符串：`isinstance(v, str) and v.strip()`

* 整数：`isinstance(v, int) and v > 0`

* 枚举：`v in ("nmn", "ergothioneine", "coq10", "regular")`

* 日期：`datetime.strptime(v, "%Y-%m-%d")`

### 3. 禁止行为

* 禁止直接用未校验的入参拼 SQL 或写库

* 禁止用 `eval()` 或 `exec()` 处理入参

* 禁止信任前端传来的 user\_id/role（必须从 session 取）

***

## 七、AI 自检清单

* [ ] 所有 API 响应走 `_ok` / `_fail`，结构含 code/msg/data/timestamp

* [ ] 所有 handler 有 try/except，异常返回统一错误响应

* [ ] SQL 全部参数化，无字符串拼接

* [ ] sqlite3 连接每请求新建，用完关闭

* [ ] 查询结果用 `row["column"]`，不用 `row[0]`

* [ ] 业务逻辑抽成 `_handle_xxx` 函数，不在 `do_GET` 里堆

* [ ] 必填字段校验走 `_require_fields`

* [ ] 权限校验从 session 取 user\_id，不从入参取

* [ ] 逻辑删除用 `is_deleted`，不用 DELETE

* [ ] 时间字段存 ISO8601 字符串

