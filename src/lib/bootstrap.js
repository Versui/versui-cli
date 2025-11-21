/**
 * @typedef {Object} BootstrapConfig
 * @property {string} site_name - Site name
 * @property {string} aggregator_url - Walrus aggregator URL
 * @property {string} index_blob_id - Blob ID for index.html
 * @property {Object} service_worker - Service worker configuration
 * @property {'none' | 'workbox' | 'custom'} service_worker.type - Service worker type
 * @property {string | null} service_worker.path - Service worker path
 * @property {string} [service_worker.blob_id] - Blob ID for service worker (if type !== 'none')
 */

/**
 * Escape HTML to prevent XSS
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escape_html(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Generate bootstrap HTML for Versui site
 * Creates minimal self-contained loader (target: 2KB)
 * @param {BootstrapConfig} config - Bootstrap configuration
 * @returns {string} Bootstrap HTML
 */
export function generate_bootstrap_html(config) {
  const escaped_name = escape_html(config.site_name)
  const { aggregator_url, index_blob_id, service_worker } = config

  // Service worker registration script (only if SW exists)
  const sw_script =
    service_worker.type !== 'none'
      ? `
    // ${service_worker.type} service worker
    if('serviceWorker' in navigator){
      navigator.serviceWorker.register('${aggregator_url}/v1/blobs/${service_worker.blob_id}')
        .catch(e=>console.error('SW error:',e));
    }
  `
      : ''

  // Minified bootstrap HTML (inline everything, no external resources)
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escaped_name}</title>
<style>body{margin:0;padding:20px;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f5f5f5}.loader{text-align:center}.spinner{border:3px solid #f3f3f3;border-top:3px solid #3498db;border-radius:50%;width:40px;height:40px;animation:spin 1s linear infinite;margin:0 auto 16px}@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}.error{color:#e74c3c;padding:16px;background:#fff;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1)}</style>
</head>
<body>
<div class="loader">
<div class="spinner"></div>
<div id="msg">Loading ${escaped_name}...</div>
</div>
<script>
${sw_script}
(async()=>{
  try{
    const r=await fetch('${aggregator_url}/v1/blobs/${index_blob_id}');
    if(!r.ok)throw new Error('Failed to load site: '+r.status);
    const html=await r.text();
    document.open();
    document.write(html);
    document.close();
  }catch(e){
    document.getElementById('msg').innerHTML='<div class="error">Error loading site: '+e.message+'</div>';
  }
})();
</script>
</body>
</html>`
}
