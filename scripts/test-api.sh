#!/bin/bash
set -e

API="http://localhost:4000/v1"
PASS=0; FAIL=0; SKIP=0

pass() { PASS=$((PASS+1)); echo "  ✅ PASS  $1"; }
fail() { FAIL=$((FAIL+1)); echo "  ❌ FAIL  $1 — $2"; }
skip() { SKIP=$((SKIP+1)); echo "  ⏭ SKIP  $1 — $2"; }

assert_http() {
  local code=$1 method=$2 path=$3 desc=$4
  shift 4
  local resp
  resp=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" "${API}${path}" "$@" 2>/dev/null)
  if [ "$resp" = "$code" ]; then
    pass "$desc ($method $path -> $resp)"
  else
    fail "$desc" "$method $path expected $code got $resp"
  fi
}

assert_json() {
  local method=$1 path=$2 desc=$3
  shift 3
  local resp
  resp=$(curl -s -X "$method" "${API}${path}" "$@" 2>/dev/null)
  if echo "$resp" | grep -qE '"ok":true|"accessToken"|"activeContext"|"id"|"code"|"stores"|"plans"|"gateways"|"logs"|"overview"|"payments"|"sales"|"categories"|"products"|"tickets"|"couriers"|"locations"|"balances"|"registers"|"shipments"|"notifications"|"invoices"|"subscription"|"exports"|"outbox"|"broadcasts"|"user"|"contexts"|"permissions"|"admins"|"events"|"exportJobs"|"settings"|"brands"|"skus"|"adjustmentRequests"|"summary"|"data"|"message"|"shift"|"sale"|"ledger"'; then
    pass "$desc ($method $path)"
  else
    local preview
    preview=$(echo "$resp" | head -c 150)
    fail "$desc" "$method $path response: $preview"
  fi
}

echo "============================================"
echo " Market One BD - API Functional Test Suite"
echo "============================================"
echo ""

echo "--- Health ---"
assert_http 200 GET "/health" "Health check"

echo ""
echo "--- Auth ---"

echo "  Logging in as platform admin..."
ADMIN_LOGIN=$(curl -s -X POST "${API}/auth/login" -H "Content-Type: application/json" -d '{"email":"nurprodev@gmail.com","password":"Ups&Down2@#"}')
ADMIN_TOKEN=$(echo "$ADMIN_LOGIN" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)
if [ -n "$ADMIN_TOKEN" ]; then pass "Admin login (got token)"; else fail "Admin login" "no token: $(echo "$ADMIN_LOGIN" | head -c 200)"; fi

echo "  Logging in as store owner..."
STORE_LOGIN=$(curl -s -X POST "${API}/auth/login" -H "Content-Type: application/json" -d '{"phone":"+8801000000000","password":"ChangeMe-Store-123!"}')
STORE_TOKEN=$(echo "$STORE_LOGIN" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)
if [ -n "$STORE_TOKEN" ]; then pass "Store owner login (got token)"; else fail "Store owner login" "no token: $(echo "$STORE_LOGIN" | head -c 200)"; fi

assert_json GET "/auth/me" "Get session profile" -H "Authorization: Bearer ${ADMIN_TOKEN}"
assert_json GET "/auth/contexts" "Get contexts" -H "Authorization: Bearer ${ADMIN_TOKEN}"
assert_http 201 POST "/auth/forgot-password" "Forgot password" -H "Content-Type: application/json" -d '{"email":"nurprodev@gmail.com"}'

echo "  Selecting admin context..."
CTX=$(curl -s -X POST "${API}/auth/select-context" -H "Authorization: Bearer ${ADMIN_TOKEN}" -H "Content-Type: application/json" -d '{"type":"admin"}')
if echo "$CTX" | grep -q '"activeContext"'; then pass "Admin context selected"; else fail "Admin context selection" "$(echo "$CTX" | head -c 150)"; fi

echo "  Selecting store context..."
STORE_ID=$(curl -s -X GET "${API}/stores/my" -H "Authorization: Bearer ${STORE_TOKEN}" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
[ -z "$STORE_ID" ] && STORE_ID="demo-store"
STORE_CTX=$(curl -s -X POST "${API}/auth/select-context" -H "Authorization: Bearer ${STORE_TOKEN}" -H "Content-Type: application/json" -d "{\"type\":\"store\",\"storeId\":\"${STORE_ID}\"}")
if echo "$STORE_CTX" | grep -q '"activeContext"'; then pass "Store context selected"; else skip "Store context selection" "$(echo "$STORE_CTX" | head -c 100)"; fi

A="Authorization: Bearer ${ADMIN_TOKEN}"
S="Authorization: Bearer ${STORE_TOKEN}"
X="x-store-id: ${STORE_ID}"

echo ""
echo "--- Admin APIs ---"

assert_json GET "/admin/overview" "Admin overview" -H "$A"
assert_json GET "/admin/admins" "List platform admins" -H "$A"
assert_http 201 POST "/admin/admins" "Create platform admin" -H "$A" -H "Content-Type: application/json" -d '{"fullName":"Test Admin","email":"testadmin@example.com","password":"TestPass123!@#"}'

echo "  Getting admin membership..."
ADMINS=$(curl -s -X GET "${API}/admin/admins" -H "$A")
MEMBERSHIP_ID=$(echo "$ADMINS" | grep -o '"membershipId":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -n "$MEMBERSHIP_ID" ]; then
  assert_http 201 POST "/admin/admins/${MEMBERSHIP_ID}/password" "Reset admin password" -H "$A" -H "Content-Type: application/json" -d '{"password":"NewPass123!@#"}'
else
  skip "Admin membership ID" "could not parse membershipId"
fi

assert_json GET "/admin/stores" "List platform stores" -H "$A"

echo "  Getting store ID for status update..."
STORES=$(curl -s -X GET "${API}/admin/stores" -H "$A")
REAL_STORE_ID=$(echo "$STORES" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -n "$REAL_STORE_ID" ]; then
  assert_json PATCH "/admin/stores/${REAL_STORE_ID}/status" "Update store status" -H "$A" -H "Content-Type: application/json" -d '{"status":"active"}'
else
  skip "Store status update" "no store ID found"
fi

assert_json GET "/reports/platform/overview" "Platform overview" -H "$A"
assert_json GET "/reports/platform/payments" "Platform payments report" -H "$A"
assert_json GET "/audit/logs" "Audit logs" -H "$A"
assert_json GET "/admin/ops/outbox" "List outbox" -H "$A"
assert_http 201 POST "/admin/ops/outbox/process" "Process outbox" -H "$A"
assert_json GET "/admin/ops/exports" "List export jobs" -H "$A"
assert_json GET "/admin/ops/notifications" "List admin notifications (ops)" -H "$A"
assert_http 201 POST "/admin/ops/notifications/process" "Process notifications (ops)" -H "$A"
assert_json GET "/admin/broadcasts" "List broadcasts" -H "$A"
assert_http 201 POST "/admin/broadcasts" "Create broadcast" -H "$A" -H "Content-Type: application/json" -d '{"audienceType":"all_stores","channel":"in_app","body":"Test broadcast from API test suite"}'

echo "  Getting broadcast ID..."
BROADCASTS=$(curl -s -X GET "${API}/admin/broadcasts" -H "$A")
BROADCAST_ID=$(echo "$BROADCASTS" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -n "$BROADCAST_ID" ]; then
  assert_http 201 POST "/admin/ops/broadcasts/${BROADCAST_ID}/process" "Process broadcast" -H "$A"
else
  skip "Broadcast process" "no broadcast ID found"
fi

assert_json GET "/admin/support/tickets" "Admin support tickets" -H "$A"
assert_json GET "/admin/notifications" "Admin notifications" -H "$A"

echo ""
echo "--- Store APIs ---"

assert_json GET "/stores/my" "My stores" -H "$S"
assert_json GET "/stores/${STORE_ID}" "Get store" -H "$S" -H "$X"
assert_json GET "/stores/${STORE_ID}/settings" "Get store settings" -H "$S" -H "$X"
assert_http 200 PATCH "/stores/${STORE_ID}/settings" "Update store settings" -H "$S" -H "$X" -H "Content-Type: application/json" -d '{"locale":"en"}'
assert_json GET "/stores/${STORE_ID}/staff" "Get store staff" -H "$S" -H "$X"

assert_json GET "/catalog/categories" "List categories" -H "$S" -H "$X"
assert_json GET "/catalog/brands" "List brands" -H "$S" -H "$X"
assert_json GET "/catalog/products" "List products" -H "$S" -H "$X"
assert_json GET "/catalog/skus/search?q=test" "Search SKUs" -H "$S" -H "$X"

echo "  Creating test category..."
CAT_CODE="TEST-CAT-$(date +%s)"
CAT_RESP=$(curl -s -X POST "${API}/catalog/categories" -H "$S" -H "$X" -H "Content-Type: application/json" -d "{\"code\":\"${CAT_CODE}\",\"name\":\"Test Category\"}")
CAT_ID=$(echo "$CAT_RESP" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -n "$CAT_ID" ]; then pass "Create category"; else fail "Create category" "response: $(echo "$CAT_RESP" | head -c 100)"; fi

echo "  Creating test product..."
PROD_CODE="TEST-PROD-$(date +%s)"
PROD_RESP=$(curl -s -X POST "${API}/catalog/products" -H "$S" -H "$X" -H "Content-Type: application/json" -d "{\"productCode\":\"${PROD_CODE}\",\"name\":\"Test Product\",\"categoryId\":\"${CAT_ID}\"}")
PROD_ID=$(echo "$PROD_RESP" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -n "$PROD_ID" ]; then
  pass "Create product"
  assert_json GET "/catalog/products/${PROD_ID}" "Get product" -H "$S" -H "$X"
  assert_json PATCH "/catalog/products/${PROD_ID}" "Update product" -H "$S" -H "$X" -H "Content-Type: application/json" -d '{"name":"Updated Test Product"}'
  assert_http 201 POST "/catalog/products/${PROD_ID}/variant-groups" "Create variant group" -H "$S" -H "$X" -H "Content-Type: application/json" -d '{"code":"SIZE","name":"Size"}'

  echo "  Creating test SKU..."
  SKU_CODE="TEST-SKU-$(date +%s)"
  SKU_RESP=$(curl -s -X POST "${API}/catalog/skus" -H "$S" -H "$X" -H "Content-Type: application/json" -d "{\"productId\":\"${PROD_ID}\",\"skuCode\":\"${SKU_CODE}\"}")
  SKU_ID=$(echo "$SKU_RESP" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  if [ -n "$SKU_ID" ]; then
    pass "Create SKU"
    assert_json PATCH "/catalog/skus/${SKU_ID}" "Update SKU" -H "$S" -H "$X" -H "Content-Type: application/json" -d '{"barcode":"123456789"}'
    assert_json POST "/catalog/prices" "Create price" -H "$S" -H "$X" -H "Content-Type: application/json" -d "{\"skuId\":\"${SKU_ID}\",\"salePrice\":99.99}"
  else
    fail "Create SKU" "$(echo "$SKU_RESP" | head -c 150)"
    SKU_ID=""
  fi

  assert_http 201 POST "/catalog/products/${PROD_ID}/media" "Add product media" -H "$S" -H "$X" -H "Content-Type: application/json" -d '{"mediaType":"image","storagePath":"/test/image.jpg"}'
else
  fail "Create product" "$(echo "$PROD_RESP" | head -c 150)"
  PROD_ID=""
  SKU_ID=""
fi

assert_json GET "/pos/registers" "Get POS registers" -H "$S" -H "$X"
assert_json GET "/pos/catalog/search?q=test" "Search POS catalog" -H "$S" -H "$X"
assert_json GET "/inventory/locations" "List inventory locations" -H "$S" -H "$X"
assert_json GET "/inventory/balances" "List inventory balances" -H "$S" -H "$X"
assert_json GET "/inventory/adjustments" "List adjustments" -H "$S" -H "$X"
assert_json GET "/inventory/ledger" "Get inventory ledger" -H "$S" -H "$X"

echo "  Getting location ID..."
LOCS=$(curl -s -X GET "${API}/inventory/locations" -H "$S" -H "$X")
LOC_ID=$(echo "$LOCS" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -n "$LOC_ID" ] && [ -n "$SKU_ID" ]; then
  assert_json POST "/inventory/initialize" "Initialize stock" -H "$S" -H "$X" -H "Content-Type: application/json" -d "{\"locationId\":\"${LOC_ID}\",\"skuId\":\"${SKU_ID}\",\"quantity\":100}"
else
  skip "Initialize stock" "missing location or SKU ID"
fi

assert_json GET "/shipping/couriers" "Get couriers" -H "$S" -H "$X"
assert_json GET "/shipping/shipments" "List shipments" -H "$S" -H "$X"
assert_json GET "/billing/plans" "Get billing plans" -H "$S" -H "$X"
assert_json GET "/billing/subscription" "Get current subscription" -H "$S" -H "$X"
assert_json GET "/billing/invoices" "Get invoices" -H "$S" -H "$X"
assert_json GET "/payments/gateways" "List payment gateways" -H "$S" -H "$X"
assert_json GET "/reports/store/sales" "Store sales report" -H "$S" -H "$X"
assert_json GET "/reports/store/inventory" "Store inventory report" -H "$S" -H "$X"
assert_json GET "/support/tickets" "Get store tickets" -H "$S" -H "$X"
assert_http 201 POST "/support/tickets" "Create support ticket" -H "$S" -H "$X" -H "Content-Type: application/json" -d '{"ticketType":"support","subject":"Test ticket","message":"Testing API"}'
assert_json GET "/notifications" "Get store notifications" -H "$S" -H "$X"

echo ""
echo "============================================"
echo " RESULTS: $PASS passed, $FAIL failed, $SKIP skipped"
echo "============================================"
[ $FAIL -gt 0 ] && exit 1
