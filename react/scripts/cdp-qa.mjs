import { writeFile } from 'node:fs/promises';
const pages = await fetch('http://127.0.0.1:9222/json/list').then(r => r.json());
const ws = new WebSocket(pages[0].webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let id = 0;
const pending = new Map();
ws.onmessage = ({ data }) => {
  const msg = JSON.parse(data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
};
function call(method, params = {}) {
  const callId = ++id;
  ws.send(JSON.stringify({ id: callId, method, params }));
  return new Promise(resolve => pending.set(callId, resolve));
}
await call('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
await call('Page.navigate', { url: 'http://127.0.0.1:4173/?instance=gpu-server-01' });
await new Promise(r => setTimeout(r, 12000));
const expression = `(() => ({
  url: location.href,
  viewport: [innerWidth, innerHeight],
  gauges: [...document.querySelectorAll('.gauge')].map(g => ({
    value: g.querySelector('.c3-gauge-value')?.textContent,
    chart: (() => { const r=g.querySelector('.gauge__chart')?.getBoundingClientRect(); return r&&[r.width,r.height]; })(),
    svg: (() => { const r=g.querySelector('svg')?.getBoundingClientRect(); return r&&[r.width,r.height]; })(),
    paths: [...g.querySelectorAll('path')].map(p=>p.getAttribute('d')).filter(Boolean)
  })),
  nanPaths: [...document.querySelectorAll('path')].filter(p=>/NaN|Infinity/.test(p.getAttribute('d')||'')).length
}))()`;
const evalResult = await call('Runtime.evaluate', { expression, returnByValue: true });
console.log(JSON.stringify(evalResult.result.result.value, null, 2));
const shot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
await writeFile('D:/company/hynix_practice/top_view_react/docs/evidence-grafana-charts-1600-cdp.png', Buffer.from(shot.result.data, 'base64'));
ws.close();
