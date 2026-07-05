const { getStore } = require("@netlify/blobs");

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

  var store = getStore("access-codes");
  var record = await store.get(code);

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({ valid: !!record })
  };
};
