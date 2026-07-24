export async function onRequestGet(context) {
  try {
    const raw = await context.env.FUEL_KV.get('fuel-prices');
    if (!raw) {
      return new Response(JSON.stringify({ error: 'no_data' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response(raw, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=1800'
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'kv_failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
