const fs = require("fs");
const path = require("path");
const creds = JSON.parse(fs.readFileSync(path.join(process.env.USERPROFILE, ".ceragon", "credentials.json"), "utf8"));
const ids = [
  ["fastify@5.8.2", "20a64e80-ebaa-4ec6-958c-892bd9225de9"],
  ["axios@1.13.6", "6107066b-7a49-40f6-8bb3-39b1634e98d0"],
  ["yargs-parser@22.0.0", "0a6546c4-cd63-4638-8983-368d2eb238a4"]
];
Promise.all(ids.map(([name, id]) =>
  fetch(creds.apiBaseUrl + "/api/v1/packages/analysis/" + id, { headers: { Authorization: "Bearer " + creds.apiKey } })
    .then(r => r.json())
    .then(d => {
      const dec = d.decision;
      if (dec) {
        console.log(name + ": " + d.status + " -> " + dec.action + " score=" + dec.riskScore + " provider=" + (dec.provider || "N/A"));
        console.log("  reason: " + (dec.reason || "").substring(0, 200));
        if (dec.findings && dec.findings.length > 0) {
          dec.findings.slice(0, 5).forEach(f => console.log("  finding: [" + f.severity + "] " + (f.title || f.category || "untitled")));
        }
      } else {
        console.log(name + ": " + d.status + " (no decision yet)");
        console.log("  response: " + JSON.stringify(d).substring(0, 300));
      }
    })
)).catch(e => console.error(e));
