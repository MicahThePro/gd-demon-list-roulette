export default async function run(page) {
  const out = {}
  for (const h of [900, 700, 500]) {
    await page.setViewportSize({ width: 1280, height: h })
    await page.goto('http://localhost:5199/', { waitUntil: 'load' })
    await page.waitForSelector('.app-shell', { timeout: 15000 })
    await page.waitForTimeout(300)
    out[h] = await page.evaluate(() => {
      const s = document.querySelector('.app-shell')
      return {
        scrollable: s.scrollHeight > s.clientHeight,
        scrollHeight: s.scrollHeight,
        clientHeight: s.clientHeight,
        bodyOverflowX: document.body.scrollWidth > window.innerWidth,
        docScrollable: document.documentElement.scrollHeight > window.innerHeight,
      }
    })
  }
  return out
}
