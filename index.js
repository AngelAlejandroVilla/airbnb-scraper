import express from "express";
import cors from "cors";
import puppeteer from "puppeteer";

const app = express();
app.use(cors());
app.use(express.json());

app.post("/scrape-airbnb", async (req, res) => {
  const { airbnbUrl } = req.body;

  if (!airbnbUrl) {
    return res.status(400).json({ error: "airbnbUrl is required" });
  }

  // 👇 Forzamos a que siempre tenga el modal de fotos
  const urlWithModal = airbnbUrl.includes("modal=PHOTO_TOUR_SCROLLABLE")
    ? airbnbUrl
    : airbnbUrl +
      (airbnbUrl.includes("?") ? "&" : "?") +
      "modal=PHOTO_TOUR_SCROLLABLE";

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.goto(urlWithModal, {
      waitUntil: "networkidle2",
      timeout: 60000,
    });

    // Esperamos a que exista el modal
    await page.waitForSelector('div[role="dialog"] img', { timeout: 60000 });

    // 🔥 Scroll dentro del modal para disparar lazy-loading
    await autoScrollModal(page);

    // 🔥 Tomar SOLO las imágenes dentro del modal
    const imageUrls = await page.evaluate(() => {
      const dialog = document.querySelector('div[role="dialog"]');
      if (!dialog) return [];

      const imgs = Array.from(dialog.querySelectorAll("img"));

      return imgs
        .map((img) => img.src)
        .filter(
          (src) =>
            src &&
            src.includes("muscache.com") && // imágenes reales de Airbnb
            !src.includes("AirbnbPlatformAssets") // fuera íconos y assets de UI
        );
    });

    const uniqueImages = [...new Set(imageUrls)];

    await browser.close();

    return res.json({
      urlUsed: urlWithModal,
      totalImages: uniqueImages.length,
      images: uniqueImages,
    });
  } catch (error) {
    console.error("❌ Error scraping Airbnb:", error);
    if (browser) await browser.close();
    return res.status(500).json({ error: "Scraping failed" });
  }
});

// 👇 Scroll dentro del contenedor del modal
async function autoScrollModal(page) {
  await page.evaluate(async () => {
    const dialog = document.querySelector('div[role="dialog"]');
    if (!dialog) return;

    // Intenta encontrar el contenedor scrollable interno
    const scrollContainer =
      dialog.querySelector('[data-testid="photo-tour-scrollable"]') ||
      dialog.querySelector('[data-testid="media-viewer"]') ||
      dialog;

    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 400;

      const timer = setInterval(() => {
        const { scrollHeight, clientHeight } = scrollContainer;

        scrollContainer.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= scrollHeight - clientHeight - 10) {
          clearInterval(timer);
          resolve();
        }
      }, 250);
    });
  });
}

const PORT = 3004;
app.listen(PORT, () =>
  console.log(`🚀 Scraper listo en http://localhost:${PORT}`)
);
