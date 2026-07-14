// 핀터레스트 공개 보드 RSS를 파싱해서 이미지 목록 반환
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate'); // 1시간 캐시

  const { board } = req.query;
  if (!board) return res.status(400).json({ error: 'board required' });

  try {
    // board는 "username/boardname" 형식
    const cleaned = board
      .replace(/^https?:\/\/(www\.)?pinterest\.[a-z.]+\//, '')
      .replace(/\/$/, '')
      .replace(/\.rss$/, '');

    const rssUrl = `https://www.pinterest.com/${cleaned}.rss`;
    const r = await fetch(rssUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8',
        'Referer': 'https://www.pinterest.com/',
      },
    });
    if (!r.ok) return res.status(500).json({ error: `RSS fetch failed (${r.status})` });

    const xml = await r.text();

    // <item> 블록에서 이미지 추출
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let m;
    while ((m = itemRegex.exec(xml)) !== null) {
      const block = m[1];
      const imgMatch = block.match(/<img src="([^"]+)"/) || block.match(/src=&quot;([^&]+)&quot;/);
      const linkMatch = block.match(/<link>([^<]+)<\/link>/);
      const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/);
      if (imgMatch) {
        // 더 큰 이미지로 변환 (236x -> 736x)
        const img = imgMatch[1].replace('/236x/', '/736x/');
        items.push({
          img,
          link: linkMatch ? linkMatch[1] : '',
          title: titleMatch ? titleMatch[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : '',
        });
      }
    }

    res.status(200).json({ count: items.length, pins: items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
