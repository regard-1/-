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

    def test_create_customer_inherits_owner_and_blank_profile(self):
        customer = server.demo_backend.demo_store.create_customer(
            {
                "name": "测试新客",
                "phone": "0823",
                "owner": "演示顾问A",
                "city": "华东地区",
                "product_focus": "辅酶Q10日常方案",
                "assetCodes": ["coq10", "regular"],
            }
        )
        self.assertGreater(customer["id"], 8)
        self.assertEqual("测试新客", customer["name"])
        self.assertEqual("演示顾问A", customer["owner"])
        self.assertEqual(["coq10", "regular"], customer["assetCodes"])
        self.assertEqual(0, customer["persona"]["intention_score"])
        self.assertIn("暂无足够事实", customer["ai_profile"]["summary"])

    def test_create_customer_requires_name_phone_and_owner(self):
        with self.assertRaises(ValueError):
            server.demo_backend.demo_store.create_customer({"phone": "0823", "owner": "演示顾问A"})
        with self.assertRaises(ValueError):
            server.demo_backend.demo_store.create_customer({"name": "测试新客", "owner": "演示顾问A"})
        with self.assertRaises(ValueError):
            server.demo_backend.demo_store.create_customer({"name": "测试新客", "phone": "0823"})

    def test_import_customers_creates_batch_and_returns_ids(self):
        result = server.demo_backend.demo_store.import_customers(
            [
                {"name": "批量客户A", "phone": "1101", "owner": "演示顾问A", "city": "华东地区", "product_focus": "辅酶Q10日常方案", "assetCodes": ["coq10"]},
                {"name": "批量客户B", "phone": "2202", "owner": "演示顾问B", "city": "华南地区", "product_focus": "NMN焕活方案", "assetCodes": ["nmn", "regular"]},
            ]
        )
        self.assertEqual(2, result["imported"])
        self.assertEqual(["批量客户A", "批量客户B"], [item["name"] for item in result["customers"]])
        self.assertEqual([item["id"] for item in result["customers"]], result["ids"])
        self.assertEqual(["coq10"], result["customers"][0]["assetCodes"])
        self.assertEqual(["nmn", "regular"], result["customers"][1]["assetCodes"])

    def test_import_customers_rejects_invalid_rows_without_partial_write(self):
        count_before = len(server.demo_backend.demo_store._customers)
        with self.assertRaises(ValueError):
            server.demo_backend.demo_store.import_customers(
                [
                    {"name": "本行有效", "phone": "3303", "owner": "演示顾问C", "assetCodes": ["regular"]},
                    {"name": "", "phone": "4404", "owner": "演示顾问D"},
                ]
            )
        self.assertEqual(count_before, len(server.demo_backend.demo_store._customers))


if __name__ == "__main__":
    unittest.main()
