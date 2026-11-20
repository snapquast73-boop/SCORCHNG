(async () => {
  const node = document.getElementById('collection');
  try {
    const response = await fetch('data/official.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    node.textContent = `Collection attempted: ${data.retrievedAt}. Status: ${data.status}. Published paragraphs: ${data.rows?.length ?? ''}. ${data.warning || data.note || ''}`;
  } catch (error) { node.textContent = `UNVERIFIED / unavailable: ${error.message}. No data has been filled in. Use the official MLB source linked above.`; }
})();
