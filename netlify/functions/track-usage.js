const { getStore } = require("@netlify/blobs");

function accessCodesStore() {
  return getStore({
    name: "access-codes",
    siteID: process.env.NETLIFY_SITE_ID,
    token: process.env.NETLIFY_BLOBS_TOKEN,
  });
}

var MONTHLY_LIMIT = 1000;

function currentMonthKey() {
  var now = new Date();
  return now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
}

exports.handler = async function (event) {
  var corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  var body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "JSON inválido" }) };
  }

  var code = (body.code || "").trim().toUpperCase();
  var requested = parseInt(body.count, 10) || 0;

  if (!code || requested <= 0) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "code e count são obrigatórios" }) };
  }

  // Código universal (master) não tem limite — não passa pelo Blobs
  if (code === "JUFAMILIA2026") {
    return {
      statusCode: 200, headers: corsHeaders,
      body: JSON.stringify({ allowed: true, unlimited: true, remaining: null, limit: null })
    };
  }

  var store = accessCodesStore();
  var raw = await store.get(code);

  if (!raw) {
    return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: "Código não encontrado" }) };
  }

  var record = JSON.parse(raw);
  var monthKey = currentMonthKey();

  // Reseta a contagem se mudou o mês
  if (record.monthKey !== monthKey) {
    record.monthKey = monthKey;
    record.videosThisMonth = 0;
  }
  if (typeof record.videosThisMonth !== "number") record.videosThisMonth = 0;

  var used = record.videosThisMonth;
  var remaining = MONTHLY_LIMIT - used;

  if (requested > remaining) {
    // Não incrementa — devolve quanto ainda pode gerar nesse mês
    return {
      statusCode: 200, headers: corsHeaders,
      body: JSON.stringify({ allowed: false, remaining: Math.max(0, remaining), limit: MONTHLY_LIMIT, used: used })
    };
  }

  // Reserva o uso (incrementa) e salva
  record.videosThisMonth = used + requested;
  await store.set(code, JSON.stringify(record));

  return {
    statusCode: 200, headers: corsHeaders,
    body: JSON.stringify({
      allowed: true,
      remaining: MONTHLY_LIMIT - record.videosThisMonth,
      limit: MONTHLY_LIMIT,
      used: record.videosThisMonth
    })
  };
};
