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

  const rows = [];
  let current = null;
  let updatedDate = null;

  const rewriter = new HTMLRewriter()
    .on('caption', {
      text(t) {
        const m = t.text.match(/(\d{2}\.\d{2}\.\d{4})/);
        if (m) updatedDate = m[1];
      }
    })
    .on('table.zebra tbody tr', {
      element(el) {
        current = [];
        const rowRef = current;
        el.onEndTag(() => {
          if (rowRef.length >= 7) rows.push(rowRef.slice());
        });
      }
    })
    .on('table.zebra tbody tr td', {
      element() {
        if (current) current.push('');
      },
      text(t) {
        if (current && current.length) current[current.length - 1] += t.text;
      }
    });

  await rewriter.transform(res).arrayBuffer();

  function num(s) {
    s = (s || '').replace(/\u00a0/g, '').trim();
    if (!s) return null;
    const v = parseFloat(s.replace(',', '.'));
    return isNaN(v) ? null : v;
  }

  const networks = rows
    .map(cells => ({
      name: (cells[0] || '').trim(),
      a95p: num(cells[1]),
      a95: num(cells[2]),
      a92: num(cells[3]),
      dt: num(cells[4]),
      lpg: num(cells[5])
    }))
    .filter(r => r.name);

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
