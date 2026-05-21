const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));

  try {
    await page.goto('http://localhost:4175', { waitUntil: 'networkidle0' });
    console.log("Navigated to Landing Page");
    
    // Click 'I Need Care' (Patient role)
    const cards = await page.$$('.landing-card');
    if(cards.length > 0) {
      await cards[0].click();
      console.log("Clicked I Need Care");
    }

    await page.waitForSelector('input[type="email"]');
    await page.type('input[type="email"]', 'alice@gmail.com');
    await page.type('input[type="password"]', 'carenest123');
    
    const submitBtn = await page.$('.btn-primary');
    await submitBtn.click();
    console.log("Clicked Login");

    // Wait for the portal to load
    await new Promise(r => setTimeout(r, 2000));
    
    await page.screenshot({ path: 'test_patient.png' });
    console.log("Saved test_patient.png");

  } catch (err) {
    console.error(err);
  } finally {
    await browser.close();
  }
})();
