"""SYNTHETIC markup tests, not real MLB records."""
import importlib.util
import unittest
spec = importlib.util.spec_from_file_location('official', 'pipeline/official.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class OfficialTests(unittest.TestCase):
    def test_verbatim_rows_with_official_links(self):
        rows = module.parse('<h2>2026 Regular Season</h2><p>001. SYNTHETIC &amp; quoted <strong>text</strong>.</p>')
        self.assertEqual(rows, [{'season': '2026', 'id': '001', 'text': 'SYNTHETIC & quoted text.', 'source': module.SOURCE}])

    def test_no_season_inference(self):
        with self.assertRaises(ValueError):
            module.parse('<p>001. SYNTHETIC entry without year.</p>')

    def test_no_script_injection_and_duplicate_rows(self):
        rows = module.parse('<h3>2025 Regular Season</h3><script>001. fake</script><p>001. SYNTHETIC text.</p><p>001. SYNTHETIC text.</p>')
        self.assertEqual(len(rows), 1)

    def test_multiple_years(self):
        rows = module.parse('<h3>2026 Regular Season</h3><p>001. SYNTHETIC newer.</p><h3>2025 Regular Season</h3><p>001. SYNTHETIC older.</p>')
        self.assertEqual([r['season'] for r in rows], ['2026', '2025'])

if __name__ == '__main__':
    unittest.main()
