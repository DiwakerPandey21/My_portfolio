const fs = require('fs');

(async () => {
    // Read the base64 from index.html
    const html = fs.readFileSync('d:/My_Portfolio/index.html', 'utf8');
    const match = html.match(/var IM=\{av:"([^"]+)"/);
    if(!match) { console.log('Could not find IM.av'); process.exit(1); }
    const base64Str = match[1];

    const testHtml = `
    <html><body>
    <canvas id="cv" width="1044" height="710"></canvas>
    <div id="out">Validating...</div>
    <script>
        setTimeout(() => {
            const cv = document.getElementById('cv');
            const ctx = cv.getContext('2d');
            const img = new Image();
            img.onload = function() {
                try {
                    const ar = img.naturalWidth / img.naturalHeight;
                    let dw = cv.width, dh = cv.width / ar;
                    if(dh < cv.height){ dh = cv.height; dw = cv.height * ar; }
                    const dx = (cv.width - dw) / 2, dy = (cv.height - dh) / 2;
                    
                    document.getElementById('out').innerText = 'ar=' + ar + ' dw=' + Math.round(dw) + ' dh=' + Math.round(dh) + ' dx=' + Math.round(dx) + ' dy=' + Math.round(dy) + ' img.nCols=' + img.naturalWidth + 'x' + img.naturalHeight;
                    ctx.drawImage(img, dx, dy, dw, dh);
                    
                    const d = ctx.getImageData(0,0,10,10).data;
                    let sum = 0; for(let i=0; i<d.length; i++) sum += d[i];
                    document.getElementById('out').innerText += ' | sum=' + sum;
                } catch(e) {
                    document.getElementById('out').innerText += ' | ERROR: ' + e;
                }
            };
            img.src = "${base64Str}";
        }, 500);
    </script>
    </body></html>
    `;
    
    fs.writeFileSync('d:/My_Portfolio/tmp/test.html', testHtml);
    console.log("Written test.html");
})();
