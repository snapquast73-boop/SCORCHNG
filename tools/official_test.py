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

    def test_actual_ordered_list_markup_and_start_value(self):
        html = '<nav><li>2025 Regular Season</li></nav><p><strong>2026 Regular Season</strong></p><ol start="3"><li><p>3/30 SYN@TH -- SYNTHETIC official wording.</p></li><li value="8"><p>4/1 SYN@TH2 -- SYNTHETIC second wording.</p></li></ol>'
        rows = module.parse(html)
        self.assertEqual([r['id'] for r in rows], ['003', '008'])
        self.assertEqual([r['season'] for r in rows], ['2026', '2026'])

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
