import { expect, test } from "@playwright/test";
import { apiLogin, createRequestViaApi, openAppAs, users } from "./helpers";

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

  test("назначенный исполнитель получает уведомление", async ({ page, request }) => {
    const customerSession = await apiLogin(request, "customer");
    const created = await createRequestViaApi(request, customerSession, {
      title: `E2E назначение ${Date.now()}`,
    });

    await openAppAs(page, request, "manager", `/requests/${created.id}`);
    const assigneeCard = page.locator(".card").filter({ hasText: "Исполнитель" });
    await assigneeCard.getByPlaceholder("Найти исполнителя").fill(users.warehouse.username);
    const assigneeSelect = assigneeCard.locator("select");
    const warehouseOption = await assigneeSelect.locator("option", { hasText: users.warehouse.username }).first().getAttribute("value");
    test.skip(!warehouseOption, `Исполнитель ${users.warehouse.username} не найден в списке назначаемых.`);
    await assigneeSelect.selectOption(warehouseOption);
    await page.getByRole("button", { name: "Назначить" }).click();

    await openAppAs(page, request, "warehouse", "/requests");
    await page.getByLabel("Уведомления").click();
    await expect(page.locator(".notification-menu").getByText(new RegExp(created.number)).first()).toBeVisible();
  });
});
