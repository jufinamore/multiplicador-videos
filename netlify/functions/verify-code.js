const { getStore } = require("@netlify/blobs");

function accessCodesStore() {
  return getStore({
    name: "access-codes",
    siteID: process.env.NETLIFY_SITE_ID,
    token: process.env.NETLIFY_BLOBS_TOKEN,
  });
}

// ---------- Códigos de teste (beta) ----------
// 15 códigos únicos, válidos até a data abaixo. Depois disso, o acesso
// é revogado automaticamente (o app já reconfirma o código a cada abertura).
// Pra trocar a data de expiração ou os códigos, é só editar aqui e publicar de novo.
var TRIAL_EXPIRES_AT = "2026-08-07T23:59:59-03:00"; // válido até 07/08/2026
var TRIAL_CODES = [
  "EKMQ0X88C", "GZHEYZ7NE", "39X3FI61R", "745K75BHV", "UUSTEPS75",
  "02NER2ZOZ", "A5Z44HNNP", "HH6W205CL", "91H48COU8", "WI4O79XI1",
  "RQ90KBU38", "FJRFQFMEO", "2RCV7B4TM", "E3S8KMQCJ", "DZ7MR4G3B"
];

function isValidTrialCode(code) {
  if (TRIAL_CODES.indexOf(code) === -1) return false;
  return new Date() <= new Date(TRIAL_EXPIRES_AT);
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
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ valid: true, trial: true }) };
  }

  // 2) Confere os códigos de compras reais (Hotmart), guardados no Blobs
  var store = accessCodesStore();
  var record = await store.get(code);

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({ valid: !!record })
  };
};
