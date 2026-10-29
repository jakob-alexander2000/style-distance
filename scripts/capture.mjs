import { chromium } from "@playwright/test"
import { mkdir } from "node:fs/promises"

const base = process.env.BASE_URL ?? "http://127.0.0.1:4173"
await mkdir("docs/screenshots", { recursive: true })
await mkdir("tmp/video", { recursive: true })

const browser = await chromium.launch()

async function shot(width, height, file) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
  await page.goto(base)
  await page.getByRole("button", { name: "Brand-voice demo" }).click()
  await page.getByTestId("draft-reading").waitFor()
  await page.waitForTimeout(900)
  await page.screenshot({ path: file })
  await page.close()
}

await shot(1440, 900, "docs/screenshots/desktop-1440x900.png")
await shot(390, 844, "docs/screenshots/mobile-390x844.png")

const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  recordVideo: { dir: "tmp/video", size: { width: 1280, height: 800 } },
})
const page = await context.newPage()
await page.goto(base)
await page.waitForTimeout(600)
await page.getByRole("button", { name: "Brand-voice demo" }).click()
await page.getByTestId("draft-reading").waitFor()
await page.waitForTimeout(2800)
await context.close()
await browser.close()
console.log("captured")
