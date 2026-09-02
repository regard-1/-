import unittest

import server


class SegmentTests(unittest.TestCase):
    def setUp(self):
        self.store = server.demo_backend.DemoStore()

    def test_workbench_exposes_two_segments(self):
        workbench = self.store.workbench()
        self.assertEqual(
            ["anti-aging", "basic-nutrition"],
            [item["code"] for item in workbench["segments"]],
        )

    def test_user_assets_groups_categories_into_segments(self):
        assets = self.store.user_assets()
        self.assertEqual(2, len(assets["segments"]))
        self.assertEqual(4493, assets["total_users"])
        anti_aging = next(
            item for item in assets["segments"] if item["code"] == "anti-aging"
        )
        self.assertEqual(["nmn", "ergothioneine"], anti_aging["category_codes"])
        self.assertEqual(4491, anti_aging["customer_count"])

    def test_audience_customers_supports_segment_or_category_code(self):
        segment = self.store.audience_customers("anti-aging")
        self.assertIsNotNone(segment)
        self.assertEqual("抗衰人群", segment["audience"]["name"])
        self.assertEqual(4491, segment["pagination"]["total"])
        category = self.store.audience_customers("nmn")
        self.assertEqual(4489, category["pagination"]["total"])

    def test_anti_aging_overview_orders_customers_by_action_tier(self):
        overview = self.store.segment_overview("anti-aging")
        self.assertEqual("抗衰人群", overview["segment"]["name"])
        self.assertEqual(4491, overview["metrics"]["total"])
        self.assertEqual(4489, overview["metrics"]["due"])
        self.assertEqual(2, overview["metrics"]["repurchase"])
        self.assertEqual(2, overview["metrics"]["nurture"])
        self.assertEqual(4485, overview["metrics"]["fresh"])
        self.assertEqual(1, overview["metrics"]["silent"])
        self.assertEqual(1, overview["metrics"]["paused"])
        self.assertEqual(
            ["repurchase", "core", "nurture", "fresh", "silent"],
            [tier["key"] for tier in overview["tiers"]],
        )
        self.assertEqual(6, len(overview["due_sample"]))
        self.assertTrue(all(item["phone"].isdigit() and len(item["phone"]) == 4 for item in overview["due_sample"]))

    def test_basic_nutrition_overview_uses_basic_purchase_keywords(self):
        overview = self.store.segment_overview("basic-nutrition")
        self.assertEqual(6, overview["metrics"]["total"])
        self.assertEqual(5, overview["metrics"]["due"])
        self.assertEqual(4, overview["metrics"]["repurchase"])
        self.assertEqual(1, overview["metrics"]["nurture"])
        self.assertEqual(1, overview["metrics"]["silent"])
        self.assertEqual(0, overview["metrics"]["fresh"])

    def test_segment_overview_returns_none_for_unknown_code(self):
        self.assertIsNone(self.store.segment_overview("not-a-segment"))


if __name__ == "__main__":
    unittest.main()
