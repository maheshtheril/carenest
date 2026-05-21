const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));

  try {
    await page.goto('http://localhost:4175', { waitUntil: 'networkidle0' });
    
    // Inject mock auth token to force customer portal
    await page.evaluate(() => {
      localStorage.setItem('carenest_token', 'mock_token');
      localStorage.setItem('carenest_user', JSON.stringify({id: 1, name: 'Alice', role: 'patient'}));
    });

    // Reload page to trigger authenticated flow
    await page.reload({ waitUntil: 'networkidle0' });
    
    console.log("Reloaded with patient auth");
    await new Promise(r => setTimeout(r, 2000));
    
    await page.screenshot({ path: 'test_portal.png' });
    console.log("Saved test_portal.png");

  } catch (err) {
    console.error(err);
  } finally {
    await browser.close();
  }
})();
