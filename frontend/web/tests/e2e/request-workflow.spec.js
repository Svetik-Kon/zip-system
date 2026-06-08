import { expect, test } from "@playwright/test";
import {
  apiLogin,
  createInventoryTransaction,
  createQuantityStockFixture,
  createRequestViaApi,
  openAppAs,
} from "./helpers";

test.describe("Заявка, workflow, комментарии и уведомления", () => {
  test("клиент создает заявку, менеджер переводит ее на согласование, автор получает уведомление о статусе", async ({ page, request }) => {
    const customerSession = await apiLogin(request, "customer");
    const created = await createRequestViaApi(request, customerSession);

    await openAppAs(page, request, "manager", `/requests/${created.id}`);
    await expect(page.getByRole("heading", { name: created.number })).toBeVisible();

    const statusCard = page.locator(".card").filter({ hasText: "Сменить статус" });
    await statusCard.getByPlaceholder("Найти статус").fill("соглас");
    await statusCard.locator("select").selectOption("in_review");
    await page.getByRole("button", { name: "Изменить статус" }).click();
    await expect(page.locator(".badge-row .badge", { hasText: "На согласовании" })).toBeVisible();

    await openAppAs(page, request, "customer", "/requests");
    await page.getByLabel("Уведомления").click();
    await expect(page.locator(".notification-menu").getByText(new RegExp(created.number)).first()).toBeVisible();
  });

  test("внутренний комментарий виден сотруднику с бейджем и скрыт от заказчика", async ({ page, request }) => {
    const customerSession = await apiLogin(request, "customer");
    const created = await createRequestViaApi(request, customerSession, {
      title: `E2E внутренний комментарий ${Date.now()}`,
    });

    await openAppAs(page, request, "manager", `/requests/${created.id}`);
    await page.getByPlaceholder("Новый комментарий").fill("Внутреннее замечание E2E");
    await page.getByLabel("Внутренний комментарий").check();
    await page.getByRole("button", { name: "Добавить комментарий" }).click();
    await expect(page.locator(".comment-badge", { hasText: "Внутренний" })).toBeVisible();

    await openAppAs(page, request, "customer", `/requests/${created.id}`);
    await expect(page.getByText("Внутреннее замечание E2E")).toHaveCount(0);
    await expect(page.locator(".comment-badge", { hasText: "Внутренний" })).toHaveCount(0);
  });

  test("складовщик проводит перемещение ЗИП между локациями", async ({ page, request }) => {
    const warehouseSession = await apiLogin(request, "warehouse");
    const fixture = await createQuantityStockFixture(request, warehouseSession, "E2E-MOVE");
    const movementComment = `E2E перемещение ${fixture.marker}`;

    await createInventoryTransaction(request, warehouseSession, {
      operation_kind: "warehouse_transfer",
      source_location: fixture.sourceLocation.id,
      destination_location: fixture.destinationLocation.id,
      related_request_id: null,
      customer_name: "",
      contract: null,
      responsible_person: "",
      due_date: null,
      reason: "Перемещение тестового остатка",
      comment: movementComment,
      items: [{
        item: fixture.item.id,
        quantity: 2,
        equipment_units: [],
        reservation: null,
        serial_numbers: [],
      }],
    });

    await openAppAs(page, request, "warehouse", "/movements");
    await page.getByPlaceholder(/Поиск по позиции/).fill(fixture.item.sku);

    const movementRow = page.locator("tbody tr").filter({ hasText: movementComment });
    await expect(movementRow).toBeVisible();
    await expect(movementRow.getByText(/Перемещение между локациями/)).toBeVisible();
    await expect(movementRow.getByRole("cell", { name: `${fixture.item.sku} x 2` })).toBeVisible();
  });
});
