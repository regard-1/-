import json
import tempfile
import unittest
from pathlib import Path

import server


class PermissionAndAuditTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "test.db"
        server.init_db(self.db_path)
        self.conn = server.connect(self.db_path)

    def tearDown(self):
        self.conn.close()
        self.temp_dir.cleanup()

    def test_role_permission_matrix(self):
        self.assertTrue(server.user_can({"role": "superadmin"}, "admin:manage"))
        self.assertTrue(server.user_can({"role": "manager"}, "customer:write"))
        self.assertTrue(server.user_can({"role": "operator"}, "customer:read"))
        self.assertFalse(server.user_can({"role": "operator"}, "customer:write"))
        self.assertFalse(server.user_can({"role": "operator"}, "analytics:read"))

    def test_audit_writes_masked_structured_log(self):
        user_id = self.conn.execute("SELECT id FROM users WHERE username=?", ("demo_operator",)).fetchone()["id"]
        server.audit(self.conn, user_id, "task_status_changed", "task", "t1", {"status": "done"})
        row = self.conn.execute("SELECT * FROM audit_logs ORDER BY id DESC LIMIT 1").fetchone()
        self.assertEqual("task_status_changed", row["action"])
        self.assertEqual(user_id, row["user_id"])
        self.assertEqual("t1", row["object_id"])
        self.assertEqual({"status": "done"}, json.loads(row["detail_json"]))


if __name__ == "__main__":
    unittest.main()
