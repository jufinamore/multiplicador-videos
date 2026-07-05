const { getStore } = require("@netlify/blobs");

// Eventos que LIBERAM acesso
const APPROVED_EVENTS = ["PURCHASE_APPROVED", "PURCHASE_COMPLETE"];
// Eventos que REVOGAM acesso
const REVOKE_EVENTS = ["PURCHASE_CANCELED", "PURCHASE_REFUNDED", "PURCHASE_CHARGEBACK", "PURCHASE_EXPIRED", "PURCHASE_PROTEST"];

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  // Confere se a notificação realmente veio da Hotmart
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

  var transaction = purchase.transaction || payload.transaction || null;
  var buyerEmail = buyer.email || payload.email || "desconhecido";
  var buyerName = buyer.name || "desconhecido";

  if (!transaction) {
    // Não veio um código de transação identificável — ignora sem erro.
    return { statusCode: 200, body: "Sem transaction id, ignorado" };
  }

  var store = getStore("access-codes");
  var codeKey = String(transaction).trim().toUpperCase();

  if (APPROVED_EVENTS.indexOf(eventType) !== -1) {
    await store.set(codeKey, JSON.stringify({
      email: buyerEmail,
      name: buyerName,
      status: "active",
      event: eventType,
      updatedAt: new Date().toISOString()
    }));
  } else if (REVOKE_EVENTS.indexOf(eventType) !== -1) {
    await store.delete(codeKey);
  }
  // Outros eventos (ex: aguardando pagamento) são ignorados de propósito.

  return { statusCode: 200, body: "ok" };
};
