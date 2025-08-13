export default function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  // CDN cache en Vercel Edge (10 min) con stale (1 día)
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=86400');

  const v = (k, def = '') => process.env[k] || def;
  const toInt = (x) => {
    const n = parseInt(x || '', 10);
    return Number.isFinite(n) ? n : 0;
  };

  res.status(200).json({
    ok: true,
    currency: v('CURRENCY', 'USD'),
    yappy_display_name: v('YAPPY_DISPLAY_NAME', 'IngresoU'),
    yappy_phone: v('YAPPY_PHONE', '+50760000000'),
    prices: {
      mensual_cents: toInt(process.env.PRICE_MENSUAL_CENTS),
      trimestral_cents: toInt(process.env.PRICE_TRIMESTRAL_CENTS),
      anual_cents: toInt(process.env.PRICE_ANUAL_CENTS),
    },
  });
}
