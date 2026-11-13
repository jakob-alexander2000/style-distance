import { expect, test } from "@playwright/test"

test("brand demo: drifted drafts are off-voice and the held-out chunk is close", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("button", { name: "Brand-voice demo" }).click()
  await expect(page.getByTestId("draft-reading")).toHaveText("off-voice")
  await expect(page.getByTestId("heldout-reading")).toHaveText("close")
  const distance = await page.getByTestId("draft-distance").innerText()
  expect(Number(distance)).toBeGreaterThan(1)
})

test("authorship demo attributes the held-out chapter to Austen", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("button", { name: "Authorship demo" }).click()
  await expect(page.getByTestId("attribution")).toContainText("Austen")
  const austen = Number(await page.getByTestId("voice-austen").getAttribute("data-delta"))
  const bronte = Number(await page.getByTestId("voice-bronte").getAttribute("data-delta"))
  expect(austen).toBeLessThan(bronte)
})

test("reduced motion still shows the off-voice reading", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" })
  const page = await context.newPage()
  await page.goto("/")
  await page.getByRole("button", { name: "Brand-voice demo" }).click()
  await expect(page.getByTestId("draft-reading")).toHaveText("off-voice")
  const first = page.locator(".rank").first()
  await expect(first).toHaveAttribute("data-rank", "0")
  await context.close()
})

test("each Remove button names the text and column it removes", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByRole("button", { name: "Remove Text 1 from Reference" })).toBeVisible()
  const names = await page.getByRole("button", { name: /^Remove / }).evaluateAll((buttons) =>
    buttons.map((button) => button.getAttribute("aria-label")),
  )
  expect(names.length).toBeGreaterThan(1)
  expect(new Set(names).size).toBe(names.length)
})
