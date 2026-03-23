const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    
    page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
    page.on('pageerror', err => console.log('BROWSER ERROR:', err));
    
    await page.goto('http://localhost:3000', { waitUntil: 'load' });
    
    await page.evaluate(() => {
        // Force the execution to see what happens
        window.bPct = 100;
        if(window.showLogin) window.showLogin();
        setTimeout(() => {
            if(window.doLogin) {
                document.getElementById('lg-in').value = '123a';
                window.doLogin();
            }
        }, 500);
    });

    await page.waitForTimeout(3000);
    
    // Check specific canvas data
    const canvasStatus = await page.evaluate(() => {
        const cv = document.getElementById('wall-cv');
        if(!cv) return "No canvas";
        const ctx = cv.getContext('2d');
        const data = ctx.getImageData(0,0,10,10).data;
        let sum = 0;
        for(let i=0; i<data.length; i++) sum += data[i];
        
        let wallStatus = "IM.wall is set: " + !!IM.wall;
        return { sum: sum, wallStatus: wallStatus };
    });
    
    console.log('CANVAS DATA SUM:', canvasStatus);
    
    await browser.close();
})();
