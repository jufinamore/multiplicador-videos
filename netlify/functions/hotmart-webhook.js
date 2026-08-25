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

// Validade do trial: 3 dias a partir de agora
function getTrialExpiresAt() {
  var exp = new Date();
  exp.setDate(exp.getDate() + 3);
  return exp.toISOString();
}

// Eventos que liberam acesso pago
const APPROVED_EVENTS = ["PURCHASE_APPROVED", "PURCHASE_COMPLETE"];

// Eventos que podem indicar início de trial (Hotmart varia conforme config)
const TRIAL_EVENTS = ["PURCHASE_TRIAL", "TRIAL_STARTED", "SUBSCRIPTION_TRIAL"];

// Eventos que removem acesso
const REVOKE_EVENTS = [
  "PURCHASE_CANCELED",
  "PURCHASE_REFUNDED",
  "PURCHASE_CHARGEBACK",
  "PURCHASE_EXPIRED",
  "PURCHASE_PROTEST",
  "SUBSCRIPTION_CANCELLATION"
];

// Eventos de renovação
const RENEWAL_EVENTS = ["SUBSCRIPTION_CHARGE_SUCCESS"];

// Detecta se a compra é um trial olhando os próprios dados (não só o nome do evento).
// A Hotmart pode marcar trial de várias formas dependendo da configuração da oferta.
function looksLikeTrial(purchase) {
  if (!purchase) return false;

  // Status explícito de trial
  var status = (purchase.status || "").toString().toUpperCase();
  if (status.indexOf("TRIAL") !== -1) return true;

  // Flag booleana de trial
  if (purchase.is_trial === true) return true;

  // Objeto de trial presente
  if (purchase.trial || purchase.trial_period) return true;

  // Valor zero com assinatura (típico de trial gratuito)
  var price = purchase.price || {};
  var value = (typeof price.value !== "undefined") ? price.value : purchase.full_price && purchase.full_price.value;
  if (value === 0 || value === "0" || value === 0.0) return true;

  return false;
}

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

  // 1) TRIAL — reconhece pelo nome do evento OU pelos dados da compra.
  //    Grava o código com validade de 3 dias, pra o cliente entrar no portal na hora.
  var isTrialEvent = TRIAL_EVENTS.indexOf(eventType) !== -1;
  var isApprovedButTrial = (APPROVED_EVENTS.indexOf(eventType) !== -1) && looksLikeTrial(purchase);

  if (isTrialEvent || isApprovedButTrial) {
    await store.set(codeKey, JSON.stringify({
      email: buyerEmail,
      name: buyerName,
      status: "trial",
      plan: "trial",
      expiresAt: getTrialExpiresAt(),
      event: eventType,
      updatedAt: new Date().toISOString()
    }));
    return { statusCode: 200, body: "ok (trial)" };
  }

  // 2) COMPRA APROVADA (paga, não-trial)
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
    return { statusCode: 200, body: "ok (approved)" };
  }

  // 3) RENOVAÇÃO — mantém ativo (e converte trial em pago quando a primeira cobrança entra)
  if (RENEWAL_EVENTS.indexOf(eventType) !== -1) {
    var existing = await store.get(codeKey);
    var current = existing ? JSON.parse(existing) : { email: buyerEmail, name: buyerName, plan: plan };
    await store.set(codeKey, JSON.stringify({
      ...current,
      status: "active",
      plan: (current.plan === "trial" || !current.plan) ? plan : current.plan,
      expiresAt: getExpiresAt((current.plan === "trial" || !current.plan) ? plan : current.plan),
      event: eventType,
      renewedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }));
    return { statusCode: 200, body: "ok (renewal)" };
  }

  // 4) CANCELAMENTO / REEMBOLSO — remove o acesso
  if (REVOKE_EVENTS.indexOf(eventType) !== -1) {
    await store.delete(codeKey);
    return { statusCode: 200, body: "ok (revoked)" };
  }

  return { statusCode: 200, body: "ok (ignored: " + eventType + ")" };
};
