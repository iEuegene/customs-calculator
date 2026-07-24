export async function onRequestGet() {
  try {
    const res = await fetch('https://bank.gov.ua/NBU_Exchange/exchange?json');
    if (!res.ok) {
      return new Response(JSON.stringify({ error: 'nbu_unavailable' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    const data = await res.json();
    return new Response(JSON.stringify(data), {
      headers: {
        'Content-Type': 'application/json',
        // cache for 1 hour at the edge — NBU updates rates once a day, no need to hit them on every visit
        'Cache-Control': 'public, max-age=3600'
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'proxy_failed' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
