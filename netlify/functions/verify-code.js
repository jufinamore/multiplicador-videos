const { getStore } = require("@netlify/blobs");

function accessCodesStore() {
  return getStore({
    name: "access-codes",
    siteID: process.env.NETLIFY_SITE_ID,
    token: process.env.NETLIFY_BLOBS_TOKEN,
  });
}

var TRIAL_EXPIRES_AT = "2026-08-14T23:59:59-03:00";
var TRIAL_CODES = [
  "EKMQ0X88C", "GZHEYZ7NE", "39X3FI61R", "745K75BHV", "UUSTEPS75",
  "02NER2ZOZ", "A5Z44HNNP", "HH6W205CL", "91H48COU8",
  "RQ90KBU38", "FJRFQFMEO", "2RCV7B4TM", "E3S8KMQCJ", "DZ7MR4G3B", "TM4ZMSDVT"
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

  // 1) Códigos de teste
  if (isValidTrialCode(code)) {
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ valid: true, trial: true, plan: "trial" }) };
  }

  // 2) Códigos reais (Hotmart)
  var store = accessCodesStore();
  var raw = await store.get(code);

  if (!raw) {
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ valid: false }) };
  }

  var record = JSON.parse(raw);

  // Verifica expiração para plano anual
  if (record.plan === "annual" && record.expiresAt) {
    if (new Date() > new Date(record.expiresAt)) {
      await store.delete(code); // limpa automaticamente
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ valid: false, reason: "expired" }) };
    }
  }

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({ valid: true, plan: record.plan || "unknown" })
  };
};
