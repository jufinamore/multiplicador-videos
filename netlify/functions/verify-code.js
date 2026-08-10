const { getStore } = require("@netlify/blobs");

function accessCodesStore() {
  return getStore({
    name: "access-codes",
    siteID: process.env.NETLIFY_SITE_ID,
    token: process.env.NETLIFY_BLOBS_TOKEN,
  });
}

// ---------- Códigos de teste (beta) ----------
// Cada código agora tem sua própria data de validade.
// Pra adicionar um novo código individual, é só incluir uma linha no objeto abaixo.
var TRIAL_CODES = {
  "EKMQ0X88C": "2026-08-14T23:59:59-03:00",
  "GZHEYZ7NE": "2026-08-14T23:59:59-03:00",
  "39X3FI61R": "2026-08-14T23:59:59-03:00",
  "745K75BHV": "2026-08-14T23:59:59-03:00",
  "UUSTEPS75": "2026-08-14T23:59:59-03:00",
  "02NER2ZOZ": "2026-08-14T23:59:59-03:00",
  "A5Z44HNNP": "2026-08-14T23:59:59-03:00",
  "HH6W205CL": "2026-08-14T23:59:59-03:00",
  "91H48COU8": "2026-08-14T23:59:59-03:00",
  "RQ90KBU38": "2026-08-14T23:59:59-03:00",
  "FJRFQFMEO": "2026-08-14T23:59:59-03:00",
  "2RCV7B4TM": "2026-08-14T23:59:59-03:00",
  "E3S8KMQCJ": "2026-08-14T23:59:59-03:00",
  "DZ7MR4G3B": "2026-08-14T23:59:59-03:00",
  "TM4ZMSDVT": "2026-08-14T23:59:59-03:00",
  // Código específico — Mateus (retestando após correções de memória/performance)
  "Z0C0EKU4I": "2026-08-25T23:59:59-03:00"
};

function isValidTrialCode(code) {
  var expiry = TRIAL_CODES[code];
  if (!expiry) return false;
  return new Date() <= new Date(expiry);
}

exports.handler = async function (event) {
  var corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders, body: "" };
  }

  var code = "";
  if (event.httpMethod === "GET") {
    code = (event.queryStringParameters && event.queryStringParameters.code) || "";
  } else {
    try {
      var body = JSON.parse(event.body || "{}");
      code = body.code || "";
    } catch (e) {
      code = "";
    }
  }

  code = code.trim().toUpperCase();

  if (!code) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ valid: false, error: "missing code" }) };
  }

  // 1) Confere primeiro os códigos de teste (não gasta chamada ao banco de dados)
  if (isValidTrialCode(code)) {
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ valid: true, trial: true, plan: "trial" }) };
  }

  // 2) Confere os códigos de compras reais (Hotmart), guardados no Blobs
  var store = accessCodesStore();
  var raw = await store.get(code);

  if (!raw) {
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ valid: false }) };
  }

  var record = JSON.parse(raw);

  // Verifica expiração para plano anual
  if (record.plan === "annual" && record.expiresAt) {
    if (new Date() > new Date(record.expiresAt)) {
      await store.delete(code);
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ valid: false, reason: "expired" }) };
    }
  }

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({ valid: true, plan: record.plan || "unknown" })
  };
};
