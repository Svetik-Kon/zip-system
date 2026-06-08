import { expect, test } from "@playwright/test";

export const authUrl = process.env.E2E_AUTH_URL || "http://localhost:8001";
export const inventoryUrl = process.env.E2E_INVENTORY_URL || "http://localhost:8003";

export const users = {
  admin: {
    username: process.env.E2E_ADMIN_USER || "admin",
    password: process.env.E2E_ADMIN_PASSWORD || "P@ssw0rd",
  },
  manager: {
    username: process.env.E2E_MANAGER_USER || "manager",
    password: process.env.E2E_MANAGER_PASSWORD || "P@ssw0rd",
  },
  warehouse: {
    username: process.env.E2E_WAREHOUSE_USER || "storage",
    password: process.env.E2E_WAREHOUSE_PASSWORD || "P@ssw0rd",
  },
  customer: {
    username: process.env.E2E_CUSTOMER_USER || "customer",
    password: process.env.E2E_CUSTOMER_PASSWORD || "111111",
  },
  engineer: {
    username: process.env.E2E_ENGINEER_USER || "ingeneer",
    password: process.env.E2E_ENGINEER_PASSWORD || "P@ssw0rd",
  },
  procurement: {
    username: process.env.E2E_PROCUREMENT_USER || "buy",
    password: process.env.E2E_PROCUREMENT_PASSWORD || "P@ssw0rd",
  },
};

export async function apiLogin(request, role) {
  const credentials = users[role];
  const loginResponse = await request.post(`${authUrl}/api/auth/login/`, {
    data: credentials,
  });

  test.skip(!loginResponse.ok(), `Нет доступной учетной записи ${role}. Проверь E2E_${role.toUpperCase()}_USER/PASSWORD.`);

  const authData = await loginResponse.json();
  const meResponse = await request.get(`${authUrl}/api/auth/me/`, {
    headers: { Authorization: `Bearer ${authData.access}` },
  });
  expect(meResponse.ok()).toBeTruthy();

  return {
    auth: authData,
    me: await meResponse.json(),
  };
}

export async function loginAs(page, request, role) {
  const session = await apiLogin(request, role);
  await page.addInitScript(({ auth, me }) => {
    window.localStorage.setItem("access", auth.access);
    window.localStorage.setItem("refresh", auth.refresh);
    window.localStorage.setItem("me", JSON.stringify(me));
  }, session);
  return session;
}

export async function openAppAs(page, request, role, path = "/requests") {
  const session = await loginAs(page, request, role);
  await page.goto(path);
  await expect(page.getByText("ZIPTrack")).toBeVisible();
  return session;
}

export async function createRequestViaApi(request, customerSession, overrides = {}) {
  const response = await request.post("http://localhost:8002/api/requests/", {
    headers: { Authorization: `Bearer ${customerSession.auth.access}` },
    data: {
      title: `E2E заявка ${Date.now()}`,
      description: "Создано автоматическим e2e-сценарием",
      request_type: "equipment_replacement",
      priority: "medium",
      equipment_name: "Тестовое оборудование",
      equipment_model: "E2E",
      serial_number: `E2E-${Date.now()}`,
      site_name: "Тестовая площадка",
      allow_analog: true,
      ...overrides,
    },
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

export async function createQuantityStockFixture(request, warehouseSession, prefix = "E2E") {
  const marker = `${prefix}-${Date.now()}`;
  const headers = { Authorization: `Bearer ${warehouseSession.auth.access}` };

  const itemResponse = await request.post(`${inventoryUrl}/api/catalog/items/`, {
    headers,
    data: {
      sku: marker,
      name: `Тестовая позиция ЗИП ${marker}`,
      manufacturer: "E2E",
      unit: "pcs",
      item_type: "spare_part",
      tracking_type: "quantity",
      description: "Создано автоматическим e2e-сценарием",
    },
  });
  expect(itemResponse.ok()).toBeTruthy();
  const item = await itemResponse.json();

  const sourceResponse = await request.post(`${inventoryUrl}/api/locations/`, {
    headers,
    data: {
      name: `E2E склад ${marker}`,
      location_type: "warehouse",
      address: "E2E source",
    },
  });
  expect(sourceResponse.ok()).toBeTruthy();
  const sourceLocation = await sourceResponse.json();

  const destinationResponse = await request.post(`${inventoryUrl}/api/locations/`, {
    headers,
    data: {
      name: `E2E транзит ${marker}`,
      location_type: "transit",
      address: "E2E destination",
    },
  });
  expect(destinationResponse.ok()).toBeTruthy();
  const destinationLocation = await destinationResponse.json();

  const receiptResponse = await request.post(`${inventoryUrl}/api/transactions/`, {
    headers,
    data: {
      operation_kind: "supplier_receipt",
      source_location: null,
      destination_location: sourceLocation.id,
      related_request_id: null,
      customer_name: "",
      contract: null,
      responsible_person: "",
      due_date: null,
      reason: `E2E приемка ${marker}`,
      comment: "Начальный остаток для e2e-сценария",
      items: [{
        item: item.id,
        quantity: 5,
        equipment_units: [],
        reservation: null,
        serial_numbers: [],
      }],
    },
  });
  expect(receiptResponse.ok()).toBeTruthy();

  return { marker, item, sourceLocation, destinationLocation, headers };
}

export async function createInventoryTransaction(request, warehouseSession, payload) {
  const response = await request.post(`${inventoryUrl}/api/transactions/`, {
    headers: { Authorization: `Bearer ${warehouseSession.auth.access}` },
    data: payload,
  });

  expect(response.ok()).toBeTruthy();
  return response.json();
}
