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

  const cells = [];
  let updatedDate = null;

  const rewriter = new HTMLRewriter()
    .on('caption', {
      text(t) {
        const m = t.text.match(/(\d{2}\.\d{2}\.\d{4})/);
        if (m) updatedDate = m[1];
      }
    })
    .on('table.zebra tbody tr td', {
      element() {
        cells.push('');
      },
      text(t) {
        if (cells.length) cells[cells.length - 1] += t.text;
      }
    });

  await rewriter.transform(res).arrayBuffer();

  function num(s) {
    s = (s || '').replace(/\u00a0/g, '').trim();
    if (!s) return null;
    const v = parseFloat(s.replace(',', '.'));
    return isNaN(v) ? null : v;
  }

  const networks = [];
  for (let i = 0; i + 7 <= cells.length; i += 7) {
    const name = (cells[i] || '').trim();
    if (!name) continue;
    networks.push({
      name,
      a96: num(cells[i + 2]),
      a95: num(cells[i + 3]),
      a92: num(cells[i + 4]),
      dt: num(cells[i + 5]),
      lpg: num(cells[i + 6])
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

  return { ok: true, count: networks.length, updated: payload.updated };
}
