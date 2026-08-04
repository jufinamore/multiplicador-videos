const { getStore } = require("@netlify/blobs");

function accessCodesStore() {
  return getStore({
    name: "access-codes",
    siteID: process.env.NETLIFY_SITE_ID,
    token: process.env.NETLIFY_BLOBS_TOKEN,
  });
}

// IDs dos produtos na Hotmart
const PRODUCT_ANNUAL_ID = 8068529;
const PRODUCT_MONTHLY_ID = 8249853;

function getPlan(productId) {
  if (productId === PRODUCT_ANNUAL_ID) return "annual";
  if (productId === PRODUCT_MONTHLY_ID) return "monthly";
  return "unknown";
}

function getExpiresAt(plan) {
  var now = new Date();
  if (plan === "annual") {
    var exp = new Date(now);
    exp.setFullYear(exp.getFullYear() + 1);
    return exp.toISOString();
  }
  // Mensal não tem expiração fixa — controlado pela renovação/cancelamento
  return null;
}

const APPROVED_EVENTS = ["PURCHASE_APPROVED", "PURCHASE_COMPLETE"];
const REVOKE_EVENTS = [
  "PURCHASE_CANCELED",
  "PURCHASE_REFUNDED",
  "PURCHASE_CHARGEBACK",
  "PURCHASE_EXPIRED",
  "PURCHASE_PROTEST",
  "SUBSCRIPTION_CANCELLATION"
];
const RENEWAL_EVENTS = ["SUBSCRIPTION_CHARGE_SUCCESS"];

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  var receivedToken = event.headers["x-hotmart-hottok"] || event.headers["X-HOTMART-HOTTOK"];
  if (!receivedToken || receivedToken !== process.env.HOTMART_HOTTOK) {
    return { statusCode: 401, body: "Hottok inválido" };
  }

  var payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, body: "JSON inválido" };
  }

  var eventType = payload.event || "";
  var data = payload.data || {};
  var purchase = data.purchase || {};
  var buyer = data.buyer || {};
  var product = data.product || {};

  var transaction = purchase.transaction || payload.transaction || null;
  var buyerEmail = buyer.email || payload.email || "desconhecido";
  var buyerName = buyer.name || "desconhecido";
  var productId = product.id || null;

  if (!transaction) {
    return { statusCode: 200, body: "Sem transaction id, ignorado" };
  }

  var plan = getPlan(productId);
  var store = accessCodesStore();
  var codeKey = String(transaction).trim().toUpperCase();

  if (APPROVED_EVENTS.indexOf(eventType) !== -1) {
    var expiresAt = getExpiresAt(plan);
    await store.set(codeKey, JSON.stringify({
      email: buyerEmail,
      name: buyerName,
      status: "active",
      plan: plan,
      expiresAt: expiresAt,
      event: eventType,
      updatedAt: new Date().toISOString()
    }));
  } else if (RENEWAL_EVENTS.indexOf(eventType) !== -1) {
    var existing = await store.get(codeKey);
    var current = existing ? JSON.parse(existing) : { email: buyerEmail, name: buyerName, plan: plan };
    await store.set(codeKey, JSON.stringify({
      ...current,
      status: "active",
      event: eventType,
      renewedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }));
  } else if (REVOKE_EVENTS.indexOf(eventType) !== -1) {
    await store.delete(codeKey);
  }

  return { statusCode: 200, body: "ok" };
};
