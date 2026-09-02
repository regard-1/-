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


if __name__ == "__main__":
    unittest.main()
