const fs = require('fs');
const lines = fs.readFileSync('frontend/src/App.jsx', 'utf8').split('\n');

// Find the start index for `<Route\n          path="master/demands"`
let startIndex = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('path="master/demands"') && lines[i-1].includes('<Route')) {
    startIndex = i - 1;
    break;
  }
}

// Find the end index for the LAST `</Route>` or `/>` before the main `</Route>` at the end of the `app` route.
// The main app layout ends right before `<Route path="/access-denied" element={<AccessDeniedPage />} />`
let endIndex = -1;
for (let i = startIndex; i < lines.length; i++) {
  if (lines[i].includes('<Route path="/access-denied"')) {
    // The previous line is `</Route>` (for the /app layout)
    // The line before that is the end of the last duplicate master route.
    endIndex = i - 2;
    break;
  }
}

console.log("Start index:", startIndex, "End index:", endIndex);

if (startIndex !== -1 && endIndex !== -1) {
  const newLines = [...lines.slice(0, startIndex), ...lines.slice(endIndex + 1)];
  fs.writeFileSync('frontend/src/App.jsx', newLines.join('\n'), 'utf8');
  console.log("Removed lines successfully.");
} else {
  console.log("Could not find start or end index.");
}
