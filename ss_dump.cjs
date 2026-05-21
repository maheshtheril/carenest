const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  try {
    await page.goto('http://localhost:4175', { waitUntil: 'networkidle0' });
    await page.evaluate(() => {
      localStorage.setItem('carenest_token', 'mock_token');
      localStorage.setItem('carenest_user', JSON.stringify({id: 1, name: 'Alice', role: 'patient'}));
    });
    await page.reload({ waitUntil: 'networkidle0' });
    
    await new Promise(r => setTimeout(r, 2000));
    
    const html = await page.evaluate(() => {
      const grid = document.querySelector('.portal-grid');
      return grid ? grid.outerHTML : "NO PORTAL GRID FOUND";
    });
    console.log("PORTAL GRID HTML:\n", html.substring(0, 5000));

    const computedStyle = await page.evaluate(() => {
      const grid = document.querySelector('.portal-grid');
      if(!grid) return "null";
      const style = window.getComputedStyle(grid);
      return `width: ${style.width}, height: ${style.height}, display: ${style.display}`;
    });
    console.log("COMPUTED STYLE:\n", computedStyle);
    
  } catch (err) {
    console.error(err);
  } finally {
    await browser.close();
  }
})();
