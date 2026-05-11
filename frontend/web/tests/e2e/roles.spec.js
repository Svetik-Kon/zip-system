import { expect, test } from "@playwright/test";
import { openAppAs } from "./helpers";

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

  test("снабжение не может проводить складские движения", async ({ page, request }) => {
    await openAppAs(page, request, "procurement", "/requests");

    await expect(page.getByRole("link", { name: /Движения/ })).toHaveCount(0);
    await page.goto("/inventory");
    await expect(page.getByRole("heading", { name: "Склад" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Резерв" })).toHaveCount(0);
  });

  test("складовщик видит движения и может открыть приемку CSV", async ({ page, request }) => {
    await openAppAs(page, request, "warehouse", "/movements");

    await expect(page.getByRole("heading", { name: "Движения ЗИП" })).toBeVisible();
    await page.getByRole("button", { name: "Приемка CSV" }).click();
    await expect(page.getByRole("heading", { name: "Приемка CSV" })).toBeVisible();
    await expect(page.getByText("Скачать шаблон CSV")).toBeVisible();
  });
});
