const fs = require('fs');

let lines = fs.readFileSync('frontend/src/App.jsx', 'utf8').split('\n');

// The duplicate block of master routes is from line 672 to 759 (as found in previous steps).
// But let's find it dynamically: it's the SECOND occurrence of `<Route path="master/committee"`
let committeeCount = 0;
let dupStart = -1;
let dupEnd = -1;

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('path="master/committee"')) {
    committeeCount++;
    if (committeeCount === 2) {
      dupStart = i - 1; // <Route
      // Find the end of this block which is the </Route> of no-interest-members/:id
      // We'll search forward for path="master/no-interest-members/:id"
      for (let j = i; j < lines.length; j++) {
        if (lines[j].includes('path="master/no-interest-members/:id"')) {
          // Find the closing /> or </Route> for this element.
          for (let k = j; k < j + 10; k++) {
             if (lines[k].includes('/>') || lines[k].includes('</Route>')) {
                dupEnd = k;
                break;
             }
          }
          break;
        }
      }
      break;
    }
  }
}

if (dupStart !== -1 && dupEnd !== -1) {
  lines.splice(dupStart, dupEnd - dupStart + 1);
  console.log("Removed duplicate master block");
}

fs.writeFileSync('frontend/src/App.jsx', lines.join('\n'), 'utf8');

