const puppeteer = require('puppeteer');
const http = require('http');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  // Capture console messages
  page.on('console', msg => {
    console.log(`PAGE LOG [${msg.type()}]:`, msg.text());
  });

  page.on('pageerror', err => {
    console.log('PAGE ERROR:', err.toString());
  });

  try {
    await page.goto('http://localhost:4173', { waitUntil: 'networkidle0' });
    console.log("Page loaded successfully.");
    
    // Log the inner HTML of the body to see if it's empty
    const bodyHTML = await page.evaluate(() => document.body.innerHTML);
    console.log("Body length:", bodyHTML.length);
    if (bodyHTML.length < 500) {
      console.log("Body HTML:", bodyHTML);
    }
  } catch (err) {
    console.error("Navigation error:", err);
  } finally {
    await browser.close();
  }
})();
