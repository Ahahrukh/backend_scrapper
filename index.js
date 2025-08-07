import express from 'express';
import puppeteer from 'puppeteer';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright-core';
import chromiumBinary from '@sparticuz/chromium';

const app = express();

// ✅ Enable all CORS permissions
app.use(cors({
  origin: '*', // Allow all origins
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());
app.use(express.static('public'));

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

app.get('/scrape', async (req, res) => {
  let browser = null;

  try {
    const executablePath = await chromiumBinary.executablePath();

    browser = await chromium.launch({
      args: chromiumBinary.args,
      executablePath,
      headless: chromiumBinary.headless,
    });

    const page = await browser.newPage();

    await page.goto('https://omni.axisbank.co.in/axisretailbanking/', {
      waitUntil: 'networkidle',
    });

    await page.type('#custid', 'centfxbgd', { delay: 100 });
    await page.type('#pass', 'centfxb@d23', { delay: 100 });

    const [loginButton] = await page.$x('//*[@id="APLOGIN"]/span[1]');
    if (loginButton) await loginButton.click();

    await page.waitForTimeout(10000);

    const data = await page.evaluate(() => {
      try {
        const iframe = document.getElementById("bankFrame");
        if (!iframe) return { error: 'Iframe not found' };

        const frameDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!frameDoc) return { error: 'Could not access iframe content (possibly cross-origin)' };

        const rows = frameDoc.querySelectorAll("table tr");
        const extracted = [];

        rows.forEach((row, i) => {
          if (i === 0) return;
          const cols = row.querySelectorAll("td");
          if (cols.length >= 3) {
            extracted.push({
              txn_id: cols[0].innerText.trim(),
              upi_id: cols[1].innerText.trim(),
              amount: parseFloat(cols[2].innerText.trim()),
            });
          }
        });

        return { extracted };
      } catch (e) {
        return { error: 'Scraping failed inside page.evaluate: ' + e.message };
      }
    });

    res.json({ success: true, data });

  } catch (err) {
    console.error('[Scraping Error]', err);
    res.json({
      success: false,
      message: 'Scraping failed. Details: ' + err.message,
    });
  } finally {
    if (browser) await browser.close();
  }
});

app.listen(3000, () => console.log('✅ Server running on http://localhost:3000'));
