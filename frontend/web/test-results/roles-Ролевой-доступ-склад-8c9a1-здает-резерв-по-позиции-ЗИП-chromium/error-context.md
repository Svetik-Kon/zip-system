# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: roles.spec.js >> Ролевой доступ >> складовщик создает резерв по позиции ЗИП
- Location: tests\e2e\roles.spec.js:18:3

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5174/inventory
Call log:
  - navigating to "http://localhost:5174/inventory", waiting until "load"

```

# Test source

```ts
  1   | import { expect, test } from "@playwright/test";
  2   | 
  3   | export const authUrl = process.env.E2E_AUTH_URL || "http://localhost:8001";
  4   | export const inventoryUrl = process.env.E2E_INVENTORY_URL || "http://localhost:8003";
  5   | 
  6   | export const users = {
  7   |   admin: {
  8   |     username: process.env.E2E_ADMIN_USER || "admin",
  9   |     password: process.env.E2E_ADMIN_PASSWORD || "P@ssw0rd",
  10  |   },
  11  |   manager: {
  12  |     username: process.env.E2E_MANAGER_USER || "manager",
  13  |     password: process.env.E2E_MANAGER_PASSWORD || "P@ssw0rd",
  14  |   },
  15  |   warehouse: {
  16  |     username: process.env.E2E_WAREHOUSE_USER || "storage",
  17  |     password: process.env.E2E_WAREHOUSE_PASSWORD || "P@ssw0rd",
  18  |   },
  19  |   customer: {
  20  |     username: process.env.E2E_CUSTOMER_USER || "customer",
  21  |     password: process.env.E2E_CUSTOMER_PASSWORD || "111111",
  22  |   },
  23  |   engineer: {
  24  |     username: process.env.E2E_ENGINEER_USER || "ingeneer",
  25  |     password: process.env.E2E_ENGINEER_PASSWORD || "P@ssw0rd",
  26  |   },
  27  |   procurement: {
  28  |     username: process.env.E2E_PROCUREMENT_USER || "buy",
  29  |     password: process.env.E2E_PROCUREMENT_PASSWORD || "P@ssw0rd",
  30  |   },
  31  | };
  32  | 
  33  | export async function apiLogin(request, role) {
  34  |   const credentials = users[role];
  35  |   const loginResponse = await request.post(`${authUrl}/api/auth/login/`, {
  36  |     data: credentials,
  37  |   });
  38  | 
  39  |   test.skip(!loginResponse.ok(), `Нет доступной учетной записи ${role}. Проверь E2E_${role.toUpperCase()}_USER/PASSWORD.`);
  40  | 
  41  |   const authData = await loginResponse.json();
  42  |   const meResponse = await request.get(`${authUrl}/api/auth/me/`, {
  43  |     headers: { Authorization: `Bearer ${authData.access}` },
  44  |   });
  45  |   expect(meResponse.ok()).toBeTruthy();
  46  | 
  47  |   return {
  48  |     auth: authData,
  49  |     me: await meResponse.json(),
  50  |   };
  51  | }
  52  | 
  53  | export async function loginAs(page, request, role) {
  54  |   const session = await apiLogin(request, role);
  55  |   await page.addInitScript(({ auth, me }) => {
  56  |     window.localStorage.setItem("access", auth.access);
  57  |     window.localStorage.setItem("refresh", auth.refresh);
  58  |     window.localStorage.setItem("me", JSON.stringify(me));
  59  |   }, session);
  60  |   return session;
  61  | }
  62  | 
  63  | export async function openAppAs(page, request, role, path = "/requests") {
  64  |   const session = await loginAs(page, request, role);
> 65  |   await page.goto(path);
      |              ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5174/inventory
  66  |   await expect(page.getByText("ZIPTrack")).toBeVisible();
  67  |   return session;
  68  | }
  69  | 
  70  | export async function createRequestViaApi(request, customerSession, overrides = {}) {
  71  |   const response = await request.post("http://localhost:8002/api/requests/", {
  72  |     headers: { Authorization: `Bearer ${customerSession.auth.access}` },
  73  |     data: {
  74  |       title: `E2E заявка ${Date.now()}`,
  75  |       description: "Создано автоматическим e2e-сценарием",
  76  |       request_type: "equipment_replacement",
  77  |       priority: "medium",
  78  |       equipment_name: "Тестовое оборудование",
  79  |       equipment_model: "E2E",
  80  |       serial_number: `E2E-${Date.now()}`,
  81  |       site_name: "Тестовая площадка",
  82  |       allow_analog: true,
  83  |       ...overrides,
  84  |     },
  85  |   });
  86  |   expect(response.ok()).toBeTruthy();
  87  |   return response.json();
  88  | }
  89  | 
  90  | export async function createQuantityStockFixture(request, warehouseSession, prefix = "E2E") {
  91  |   const marker = `${prefix}-${Date.now()}`;
  92  |   const headers = { Authorization: `Bearer ${warehouseSession.auth.access}` };
  93  | 
  94  |   const itemResponse = await request.post(`${inventoryUrl}/api/catalog/items/`, {
  95  |     headers,
  96  |     data: {
  97  |       sku: marker,
  98  |       name: `Тестовая позиция ЗИП ${marker}`,
  99  |       manufacturer: "E2E",
  100 |       unit: "pcs",
  101 |       item_type: "spare_part",
  102 |       tracking_type: "quantity",
  103 |       description: "Создано автоматическим e2e-сценарием",
  104 |     },
  105 |   });
  106 |   expect(itemResponse.ok()).toBeTruthy();
  107 |   const item = await itemResponse.json();
  108 | 
  109 |   const sourceResponse = await request.post(`${inventoryUrl}/api/locations/`, {
  110 |     headers,
  111 |     data: {
  112 |       name: `E2E склад ${marker}`,
  113 |       location_type: "warehouse",
  114 |       address: "E2E source",
  115 |     },
  116 |   });
  117 |   expect(sourceResponse.ok()).toBeTruthy();
  118 |   const sourceLocation = await sourceResponse.json();
  119 | 
  120 |   const destinationResponse = await request.post(`${inventoryUrl}/api/locations/`, {
  121 |     headers,
  122 |     data: {
  123 |       name: `E2E транзит ${marker}`,
  124 |       location_type: "transit",
  125 |       address: "E2E destination",
  126 |     },
  127 |   });
  128 |   expect(destinationResponse.ok()).toBeTruthy();
  129 |   const destinationLocation = await destinationResponse.json();
  130 | 
  131 |   const receiptResponse = await request.post(`${inventoryUrl}/api/transactions/`, {
  132 |     headers,
  133 |     data: {
  134 |       operation_kind: "supplier_receipt",
  135 |       source_location: null,
  136 |       destination_location: sourceLocation.id,
  137 |       related_request_id: null,
  138 |       customer_name: "",
  139 |       contract: null,
  140 |       responsible_person: "",
  141 |       due_date: null,
  142 |       reason: `E2E приемка ${marker}`,
  143 |       comment: "Начальный остаток для e2e-сценария",
  144 |       items: [{
  145 |         item: item.id,
  146 |         quantity: 5,
  147 |         equipment_units: [],
  148 |         reservation: null,
  149 |         serial_numbers: [],
  150 |       }],
  151 |     },
  152 |   });
  153 |   expect(receiptResponse.ok()).toBeTruthy();
  154 | 
  155 |   return { marker, item, sourceLocation, destinationLocation, headers };
  156 | }
  157 | 
  158 | export async function createInventoryTransaction(request, warehouseSession, payload) {
  159 |   const response = await request.post(`${inventoryUrl}/api/transactions/`, {
  160 |     headers: { Authorization: `Bearer ${warehouseSession.auth.access}` },
  161 |     data: payload,
  162 |   });
  163 | 
  164 |   expect(response.ok()).toBeTruthy();
  165 |   return response.json();
```