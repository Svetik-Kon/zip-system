import { expect, test } from "@playwright/test";
import { apiLogin, createQuantityStockFixture, openAppAs } from "./helpers";

test.describe("Ролевой доступ", () => {
  test("инженер видит склад и каталог только на чтение", async ({ page, request }) => {
    await openAppAs(page, request, "engineer", "/inventory");

    await expect(page.getByRole("heading", { name: "Склад" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Резерв" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Локация" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Движения/ })).toHaveCount(0);

    await page.goto("/catalog");
    await expect(page.getByRole("heading", { name: "Каталог ЗИП" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Новая позиция" })).toHaveCount(0);
  });

  test("складовщик создает резерв по позиции ЗИП", async ({ page, request }) => {
    const warehouseSession = await apiLogin(request, "warehouse");
    const fixture = await createQuantityStockFixture(request, warehouseSession, "E2E-RESERVE");

    await openAppAs(page, request, "warehouse", "/inventory");

    await page.getByPlaceholder(/Найти позицию/).fill(fixture.item.sku);
    await page.getByRole("button", { name: new RegExp(fixture.item.sku) }).click();
    await page.getByRole("button", { name: "Зарезервировать" }).click();
    await page.locator(".modal-panel").getByPlaceholder("Заказчик").fill("E2E заказчик резерв");
    await page.locator(".modal-panel").getByPlaceholder("Комментарий").fill(fixture.marker);
    await page.locator(".modal-panel").getByRole("button", { name: "Зарезервировать" }).click();

    const reservationRow = page.locator(".reservation-detail-row").filter({ hasText: "E2E заказчик резерв" });
    await expect(reservationRow).toBeVisible();
    await expect(reservationRow.getByText(fixture.marker)).toBeVisible();
  });

  test("складовщик видит движения и может открыть приемку CSV", async ({ page, request }) => {
    await openAppAs(page, request, "warehouse", "/movements");

    await expect(page.getByRole("heading", { name: "Движения ЗИП" })).toBeVisible();
    await page.getByRole("button", { name: "Приемка CSV" }).click();
    await expect(page.getByRole("heading", { name: "Приемка CSV" })).toBeVisible();
    await expect(page.getByText("Скачать шаблон CSV")).toBeVisible();
  });
});
