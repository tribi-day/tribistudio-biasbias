// 핀터레스트 공개 보드 RSS 파싱 — 여러 프록시 fallback 체인
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');

  const { board } = req.query;
  if (!board) return res.status(400).json({ error: 'board required' });

  const cleaned = board
    .replace(/^https?:\/\/(www\.)?pinterest\.[a-z.]+\//, '')
    .replace(/\/$/, '')
    .replace(/\.rss$/, '');

  const rssUrl = `https://www.pinterest.com/${cleaned}.rss`;
  const errors = [];

  // XML에서 핀 추출
  function parseXml(xml) {
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let m;
    while ((m = itemRegex.exec(xml)) !== null) {
      const block = m[1];
      const imgMatch = block.match(/<img[^>]+src="([^"]+)"/) || block.match(/src=&quot;([^&]+)&quot;/);
      const linkMatch = block.match(/<link>([^<]+)<\/link>/);
      const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/);
      if (imgMatch) {
        items.push({
          img: imgMatch[1].replace('/236x/', '/736x/'),
          link: linkMatch ? linkMatch[1] : '',
          title: titleMatch ? titleMatch[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : '',
        });
      }
    }
    return items;
  }

  // 방법 1: 직접 fetch
  try {
    const r = await fetch(rssUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      },
    });
    if (r.ok) {
      const items = parseXml(await r.text());
      if (items.length > 0) return res.status(200).json({ count: items.length, pins: items, via: 'direct' });
      errors.push('direct: 0 items');
    } else {
      errors.push(`direct: ${r.status}`);
    }
  } catch (e) { errors.push(`direct: ${e.message}`); }

  // 방법 2: rss2json
  try {
    const r = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`);
    const data = await r.json();
    if (data.status === 'ok' && data.items) {
      const items = [];
      for (const item of data.items) {
        const html = item.description || item.content || '';
        const imgMatch = html.match(/<img[^>]+src="([^"]+)"/);
        if (imgMatch) {
          items.push({
            img: imgMatch[1].replace('/236x/', '/736x/'),
            link: item.link || '',
            title: (item.title || '').trim(),
          });
        }
      }
      if (items.length > 0) return res.status(200).json({ count: items.length, pins: items, via: 'rss2json' });
      errors.push('rss2json: 0 items');
    } else {
      errors.push(`rss2json: ${data.message || 'failed'}`);
    }
  } catch (e) { errors.push(`rss2json: ${e.message}`); }

  // 방법 3: allorigins
  try {
    const r = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(rssUrl)}`);
    if (r.ok) {
      const items = parseXml(await r.text());
      if (items.length > 0) return res.status(200).json({ count: items.length, pins: items, via: 'allorigins' });
      errors.push('allorigins: 0 items');
    } else {
      errors.push(`allorigins: ${r.status}`);
    }
  } catch (e) { errors.push(`allorigins: ${e.message}`); }

  // 방법 4: corsproxy.io
  try {
    const r = await fetch(`https://corsproxy.io/?url=${encodeURIComponent(rssUrl)}`);
    if (r.ok) {
      const items = parseXml(await r.text());
      if (items.length > 0) return res.status(200).json({ count: items.length, pins: items, via: 'corsproxy' });
      errors.push('corsproxy: 0 items');
    } else {
      errors.push(`corsproxy: ${r.status}`);
    }
  } catch (e) { errors.push(`corsproxy: ${e.message}`); }

  res.status(500).json({ error: '모든 방법 실패', details: errors });
}
