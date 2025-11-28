import { MIME_TYPES_BROWSER } from './mime-browser.js'

/**
 * Generate bootstrap HTML and SW for a Versui site
 * @param {string} site_name - Site name
 * @param {string[]} aggregators - List of aggregator URLs
 * @param {Object<string, string>} resource_map - Map of path to blob_hash
 * @returns {{html: string, sw: string}} Bootstrap HTML and SW
 */
export function generate_bootstrap(site_name, aggregators, resource_map) {
  // XSS: escape for HTML context
  const escaped_html = site_name
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
  const resources = JSON.stringify(resource_map)
  const agg_json = JSON.stringify(aggregators)

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escaped_html}</title>
<style>body{margin:0;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;background:#111;font-family:system-ui,sans-serif}.s{width:16px;height:16px;border:2px solid #333;border-top-color:#fff;border-radius:50%;animation:r .6s linear infinite}@keyframes r{to{transform:rotate(360deg)}}.e{text-align:center;max-width:400px;padding:2em}.e h1{color:#f97316;font-size:1.1em;margin:0 0 .4em;font-weight:500}.e p{color:#555;font-size:.75em;margin:0 0 1.2em;line-height:1.4}.retry{display:flex;align-items:center;justify-content:center;gap:6px;color:#333;font-size:.65em}.retry .s{width:10px;height:10px;border-width:1.5px}.nosw{color:#666;font-size:.8em;text-align:center;max-width:300px;line-height:1.5}</style>
</head>
<body>
<div class="s" id="l"></div>
<div class="e" id="err" style="display:none"><h1>Site Storage Expired</h1><p>This site's storage has expired on Walrus. It will automatically load once the administrator restores it.</p><div class="retry"><div class="s"></div><span>Retrying...</span></div></div>
<div class="nosw" id="nosw" style="display:none">Your browser doesn't support Service Workers.<br>Please use a modern browser to view this site.</div>
<script>
(()=>{
if(!('serviceWorker'in navigator)){document.getElementById('l').style.display='none';document.getElementById('nosw').style.display='block';return}
let d=5000;
const check=async()=>{try{
if(!navigator.serviceWorker.controller){await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;location.reload();return}
const i=await fetch('/index.html');if(!i.ok)throw new Error('expired');
const h=await i.text();document.open();document.write(h);document.close()
}catch(e){document.getElementById('l').style.display='none';document.getElementById('err').style.display='block';setTimeout(check,d);d=Math.min(d*1.5,60000)}};
check()})();
</script>
</body>
</html>`

  const sw = `const A=${agg_json},R=${resources};
const M=${JSON.stringify(MIME_TYPES_BROWSER)};
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(clients.claim()));
self.addEventListener('fetch',e=>{
  const p=new URL(e.request.url).pathname;
  const b=R[p];
  if(b){
    if(!/^[a-zA-Z0-9_-]+$/.test(b))return e.respondWith(new Response('invalid',{status:400}));
    e.respondWith((async()=>{
      for(const a of A){try{const r=await fetch(a+'/v1/blobs/by-quilt-patch-id/'+b);if(r.ok){const ext=p.match(/\\.[^.]+$/)?.[0]||'';const type=M[ext]||'application/octet-stream';return new Response(await r.blob(),{headers:{'Content-Type':type}})}}catch(e){}}
      return new Response('expired',{status:404});
    })());
  }
});`

  return { html, sw }
}
