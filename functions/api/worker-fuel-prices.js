export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/run') {
      const result = await updatePrices(env);
      return new Response(JSON.stringify(result, null, 2), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response('fuel-price-worker is running. GET /run to trigger manually.');
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(updatePrices(env));
  }
};

async function updatePrices(env) {
  const sourceUrl = 'https://index.minfin.com.ua/ua/markets/fuel/tm/';
  const res = await fetch(sourceUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; RozmytnennyaFuelBot/1.0; +https://rozmytnennya.com.ua)'
    }
  });

  if (!res.ok) {
    return { ok: false, error: 'fetch_failed', status: res.status };
  }

  const html = await res.text();

  // Date lives inside <caption>...дд.мм.рррр...</caption> — scope the search to
  // the caption text only, so we never accidentally grab an unrelated date on the page.
  const captionMatch = html.match(/<caption>([\s\S]*?)<\/caption>/);
  const dateMatch = captionMatch ? captionMatch[1].match(/(\d{2}\.\d{2}\.\d{4})/) : null;
  const updatedDate = dateMatch ? dateMatch[1] : null;

  function cleanCell(raw) {
    return raw.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
  }
  function num(s) {
    s = (s || '').trim();
    if (!s) return null;
    const v = parseFloat(s.replace(',', '.'));
    return isNaN(v) ? null : v;
  }

  // Match only <tr> rows made of exactly 7 <td> cells — the header row uses <th>,
  // so it never matches this pattern and is skipped automatically.
  const rowRegex = /<tr>((?:<td[^>]*>[\s\S]*?<\/td>){7})<\/tr>/g;
  const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;

  const networks = [];
  let rowMatch;
  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const rowHtml = rowMatch[1];
    const cells = [];
    tdRegex.lastIndex = 0;
    let tdMatch;
    while ((tdMatch = tdRegex.exec(rowHtml)) !== null) {
      cells.push(cleanCell(tdMatch[1]));
    }
    if (cells.length !== 7) continue;

    const name = cells[0];
    if (!name) continue;

    // cells: [0]=name  [1]=icon(blank)  [2]=A95+  [3]=A95  [4]=A92  [5]=ДП  [6]=Газ
    networks.push({
      name,
      a96: num(cells[2]),
      a95: num(cells[3]),
      a92: num(cells[4]),
      dt: num(cells[5]),
      lpg: num(cells[6])
    });
  }

  if (networks.length === 0) {
    // Parsing failed (site structure likely changed) — don't overwrite good cached data with empty results.
    return { ok: false, error: 'no_rows_parsed' };
  }

  const payload = {
    updated: updatedDate || new Date().toISOString().slice(0, 10),
    fetchedAt: new Date().toISOString(),
    source: sourceUrl,
    networks
  };

  await env.FUEL_KV.put('fuel-prices', JSON.stringify(payload));

  return { ok: true, count: networks.length, updated: payload.updated, sample: networks[0] };
}
