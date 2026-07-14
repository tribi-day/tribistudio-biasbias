// 핀터레스트 공개 보드 RSS → rss2json 경유로 파싱 (Vercel IP 차단 우회)
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate'); // 1시간 캐시

  const { board } = req.query;
  if (!board) return res.status(400).json({ error: 'board required' });

  try {
    const cleaned = board
      .replace(/^https?:\/\/(www\.)?pinterest\.[a-z.]+\//, '')
      .replace(/\/$/, '')
      .replace(/\.rss$/, '');

    const rssUrl = `https://www.pinterest.com/${cleaned}.rss`;
    const proxyUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`;

    const r = await fetch(proxyUrl);
    if (!r.ok) return res.status(500).json({ error: `proxy fetch failed (${r.status})` });

    const data = await r.json();
    if (data.status !== 'ok' || !data.items) {
      return res.status(500).json({ error: data.message || 'RSS parse failed' });
    }

    const items = [];
    for (const item of data.items) {
      // description/content 안의 <img src="..."> 추출
      const html = item.description || item.content || '';
      const imgMatch = html.match(/<img[^>]+src="([^"]+)"/);
      if (imgMatch) {
        const img = imgMatch[1].replace('/236x/', '/736x/');
        items.push({
          img,
          link: item.link || '',
          title: (item.title || '').trim(),
        });
      }
    }

    res.status(200).json({ count: items.length, pins: items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
