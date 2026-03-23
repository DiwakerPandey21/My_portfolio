const fs = require('fs');
const filePath = 'd:/My_Portfolio/index.html';

try {
  let html = fs.readFileSync(filePath, 'utf8');

  const imStartIdx = html.indexOf('var IM={');
  if (imStartIdx === -1) {
    console.error("Could not find var IM={");
    process.exit(1);
  }

  const imEndIdx = html.indexOf('};', imStartIdx);
  if (imEndIdx === -1) {
    console.error("Could not find the end of var IM object");
    process.exit(1);
  }

  const imString = html.substring(imStartIdx, imEndIdx + 2);
  
  // Extract p1 value: p1:"(data:image/x;base64,...)"
  const p1Match = imString.match(/p1:"([^"]+)"/);
  if (!p1Match) {
    console.error("Could not extract p1 value from", imString.substring(0, 100));
    process.exit(1);
  }

  const p1Value = p1Match[1];
  console.log("Found p1 base64 string, length:", p1Value.length);

  // Construct new IM block
  const newImBlock = `var IM={av:"${p1Value}",wall:"${p1Value}",p1:"${p1Value}",p2:"${p1Value}"};`;

  // Replace old block
  const newHtml = html.substring(0, imStartIdx) + newImBlock + html.substring(imEndIdx + 2);

  fs.writeFileSync(filePath, newHtml, 'utf8');
  console.log("Success! Original length:", html.length, "New length:", newHtml.length);
} catch (e) {
  console.error("Error:", e.message);
  process.exit(1);
}
