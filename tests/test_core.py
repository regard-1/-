import tempfile
import unittest
from pathlib import Path

import server


class CoreTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "test.db"
        server.init_db(self.db_path)
        self.conn = server.connect(self.db_path)

    def tearDown(self):
        self.conn.close()
        self.temp_dir.cleanup()

    def test_seed_and_four_asset_categories(self):
        self.assertEqual(12, self.conn.execute("SELECT COUNT(*) FROM customers").fetchone()[0])
        categories = server.asset_categories(self.conn)
        self.assertEqual(["nmn", "ergothioneine", "coq10", "regular"], [item["code"] for item in categories])
        self.assertTrue(all(item["customer_count"] > 0 for item in categories))

    def test_customer_can_belong_to_multiple_assets(self):
        codes = [row[0] for row in self.conn.execute(
            "SELECT audience_code FROM customer_asset_memberships WHERE customer_id=1 ORDER BY audience_code"
        )]
        self.assertEqual(["coq10", "nmn"], codes)
        detail = server.customer_detail(self.conn, 1)
        self.assertEqual(2, len(detail["assets"]))

    def test_profile_is_evidence_based_and_stable(self):
        before = server.get_profile(self.conn, 1)
        count_before = self.conn.execute("SELECT COUNT(*) FROM customer_ai_profiles WHERE customer_id=1").fetchone()[0]
        same = server.refresh_profile(self.conn, 1, force=False)
        count_after = self.conn.execute("SELECT COUNT(*) FROM customer_ai_profiles WHERE customer_id=1").fetchone()[0]
        self.assertEqual(before["data_version"], same["data_version"])
        self.assertEqual(count_before, count_after)
        self.assertGreaterEqual(len(before["evidence"]), 3)
        self.assertIn("累计消费", before["summary"])

    def test_agent_suggestion_uses_profile_and_policy(self):
        suggestion = server.build_agent_suggestion(self.conn, 1, "我担心价格太贵", "objection")
        self.assertTrue(suggestion["reply"])
        self.assertGreaterEqual(len(suggestion["alternatives"]), 2)
        self.assertIn("非医疗诊断", suggestion["policy_flags"])
        self.assertTrue(suggestion["profile_version"])

    def test_password_hash(self):
        encoded = server.password_hash("correct horse battery staple")
        self.assertTrue(server.password_verify("correct horse battery staple", encoded))
        self.assertFalse(server.password_verify("wrong", encoded))


if __name__ == "__main__":
    unittest.main()
