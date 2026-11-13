import config from '../content/analytics-sites.json' with { type: 'json' };

function validate(input) {
  const panel=new URL(input.panelOrigin);
  if(panel.protocol!=='https:'||panel.origin!==input.panelOrigin)throw Error('The analytics panel needs an HTTPS origin.');
  const paths=new Set(),ids=new Set();
  for(const installation of input.installations) {
    const {path,offer}=installation;
    if(!/^\/(?:[a-z0-9-]+\/)*$/i.test(path)||paths.has(path))throw Error('Invalid or duplicate analytics installation path.');
    if(!offer?.id||ids.has(offer.id)||!/^[a-zA-Z0-9_-]{24,80}$/.test(offer.publicKey||''))throw Error('Invalid analytics installation identifiers.');
    if(!offer.name||!Array.isArray(offer.origins)||!offer.origins.length||offer.origins.some(origin=>new URL(origin).origin!==origin))throw Error('Invalid installation name or origins.');
    if(!Array.isArray(offer.steps)||offer.steps.length<2||offer.steps.length>100||offer.steps.some(s=>!s.label||!/^[a-zA-Z0-9_.:-]{1,100}$/.test(s.id))||new Set(offer.steps.map(s=>s.id)).size!==offer.steps.length)throw Error('Invalid installation steps.');
    paths.add(path);ids.add(offer.id);
  }
  return input;
}

export const analyticsSetup=validate(config);

export function injectCollector(html,installation) {
  if(/data-ponto-installation/.test(html))throw Error('Collector already installed; build from the preserved source HTML.');
  const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const attrs=installation.flow?` data-flow="${escape(JSON.stringify(installation.flow))}" data-version="${escape(installation.version)}" data-lead-storage="${escape(installation.leadStorageKey)}" data-funnel-storage="${escape(installation.funnelStorageKey)}" data-ab-storage="${escape(installation.abStorageKey)}"`:'';
  const script=`<script defer src="${escape(analyticsSetup.panelOrigin)}/quiz-analytics.js" data-ponto-installation="${escape(installation.offer.id)}" data-offer="${escape(installation.offer.id)}" data-key="${escape(installation.offer.publicKey)}" data-endpoint="${escape(analyticsSetup.panelOrigin)}/api/q/"${attrs}></script>`;
  if(!/<\/body>/i.test(html))throw Error('Quiz HTML has no closing body.');
  return html.replace(/<\/body>/i,script+'\n</body>');
}

export async function seedInstalledOffers(query,{enabled=true,now=Date.now()}={}) {
  if(!enabled)return;
  for(const {offer} of analyticsSetup.installations)await query(
    'INSERT INTO qa_offers(id,name,origins,steps,public_key,created_at,demo) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO NOTHING',
    [offer.id,offer.name,JSON.stringify(offer.origins),JSON.stringify(offer.steps),offer.publicKey,now,0],
  );
}
