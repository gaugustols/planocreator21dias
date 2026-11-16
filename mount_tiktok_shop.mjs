import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {analyzeJavaScript,filesBelow,literal} from './lib/assets.mjs';
import {adaptTikTokShop} from './content/tiktok-shop-adaptation.mjs';

const sourceRoot='site/br',targetRoot='site/tiktok-shop',base='/tiktok-shop/';
const sha=x=>createHash('sha256').update(x).digest('hex');
const key=p=>p.key?.name??p.key?.value;
const relocate=s=>s.replaceAll('/br/',base).replaceAll('ugc-br-','ugc-shop-');
const files=[];let adapted;
const originalScratchGate='e.kind!==`scratch`||w.scratch.enabled&&$e()>0';
const planScratchGate='e.kind!==`scratch`||w.scratch.enabled&&(w.scratch.revealPlan||$e()>0)';

function nodesFor(info){const content=info.nodes.find(n=>n.type==='VariableDeclarator'&&n.init?.type==='ObjectExpression'&&n.init.properties.some(p=>key(p)==='landing'));const market=info.nodes.find(n=>n.type==='VariableDeclarator'&&n.init?.type==='ObjectExpression'&&n.init.properties.some(p=>key(p)==='siteUrl'));return {content,market};}
function normalizedRenderer(source){
  source=source.replace(planScratchGate,originalScratchGate);
  const info=analyzeJavaScript(source),{content,market}=nodesFor(info);const ranges=[content?.init,market?.init].filter(Boolean);
  const inData=n=>ranges.some(r=>n.start>=r.start&&n.end<=r.end);
  function clean(node){
    if(!node||typeof node!=='object')return node;if(Array.isArray(node))return node.map(clean);
    if(inData(node))return {type:'ContentData'};
    if(node.type==='Literal'&&typeof node.value==='string')return {type:'String',value:node.value.replaceAll(base,'/br/').replaceAll('ugc-shop-','ugc-br-')};
    if(node.type==='TemplateLiteral'&&!node.expressions.length)return {type:'String',value:node.quasis[0].value.cooked.replaceAll(base,'/br/').replaceAll('ugc-shop-','ugc-br-')};
    return Object.fromEntries(Object.entries(node).filter(([k])=>!['start','end','raw'].includes(k)).map(([k,v])=>[k,clean(v)]));
  }
  return sha(JSON.stringify(clean(info.ast)));
}
function javascript(source,name){
  const info=analyzeJavaScript(source),{content,market}=nodesFor(info),edits=[];
  if(content&&market){
    const marketConfig=market.init.properties.find(p=>key(p)==='config').value,marketStrings=market.init.properties.find(p=>key(p)==='strings').value;
    adapted=adaptTikTokShop(literal(content.init),literal(marketConfig),literal(marketStrings));
    edits.push({start:content.init.start,end:content.init.end,text:JSON.stringify(adapted.content)},{start:marketConfig.start,end:marketConfig.end,text:JSON.stringify(adapted.config)},{start:marketStrings.start,end:marketStrings.end,text:JSON.stringify(adapted.strings)});
  }
  for(const n of info.nodes){if(edits.some(r=>n.start>=r.start&&n.end<=r.end))continue;const value=n.type==='Literal'&&typeof n.value==='string'?n.value:n.type==='TemplateLiteral'&&!n.expressions.length?n.quasis[0].value.cooked:null;if(value===null)continue;const next=relocate(value);if(next!==value)edits.push({start:n.start,end:n.end,text:JSON.stringify(next)});}
  let output=source;for(const edit of edits.sort((a,b)=>b.start-a.start))output=output.slice(0,edit.start)+edit.text+output.slice(edit.end);
  // Keep the original scratch activity when revealing a plan, without requiring
  // an invented crossed-out price or discount. Its canvas/component is untouched.
  if(content){assert.equal(output.split(originalScratchGate).length,2);output=output.replace(originalScratchGate,planScratchGate);}
  assert.equal(normalizedRenderer(output),normalizedRenderer(source),'Renderer changed: '+name);
  return {output,rendererUnchanged:true};
}
function html(source,name){
  let output=relocate(source).replaceAll('Trilha UGC 21 Dias','Plano TikTok Shop 21 Dias').replaceAll('Trilha UGC','Trilha Shop').replaceAll('Desistir da compra','Sobre as inscrições');
  if(name==='index.html'){
    output=output.replaceAll('Uma renda sua com vídeos para marcas','Um plano de 21 dias para começar do zero').replaceAll('sem seguidores e sem aparecer','aparecendo ou com apoio de IA').replaceAll('Teste como é fazer vídeos UGC para marcas: um quiz grátis de 4 minutos, pelo celular. Mesmo sem seguidores.','Experimente três missões para começar no TikTok Shop, com o mesmo quiz de 4 minutos, aparecendo ou com apoio de IA.');
    output=output.replace('// A returning visitor resumes mid-quiz:',"try { localStorage.setItem('ugc-shop-m-off','1'); } catch (e) {}\n      // A returning visitor resumes mid-quiz:");
    assert.ok(adapted,'Adapt content before mounting the HTML');
    const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
    output=output.replace(/(<p[^>]*>)Quiz gratuito para maiores de 18 anos;[^<]*(<\/p>)/,'$1'+escape(adapted.content.legal.simulationDisclaimer.replace('{price}','R$ 29,90'))+'$2');
    output=output.replace(/(<p[^>]*>)Este site não tem vínculo[^<]*(<\/p>)/,'$1'+escape(adapted.content.legal.notAffiliated)+'$2');
  }
  return output;
}
for(const sourceFile of await filesBelow(sourceRoot)){
  const relative=path.relative(sourceRoot,sourceFile).split(path.sep).join('/'),target=path.join(targetRoot,relative),original=await readFile(sourceFile);let bytes=original,rendererUnchanged;
  if(/\.m?js$/i.test(relative)){const result=javascript(original.toString('utf8'),relative);bytes=Buffer.from(result.output);rendererUnchanged=result.rendererUnchanged;}
  else if(/\.html$/i.test(relative))bytes=Buffer.from(html(original.toString('utf8'),relative));
  else if(/\.(?:css|svg|xml|json|txt)$/i.test(relative))bytes=Buffer.from(relocate(original.toString('utf8')));
  await mkdir(path.dirname(target),{recursive:true});await writeFile(target,bytes);
  files.push({source:sourceFile.split(path.sep).join('/'),file:target.split(path.sep).join('/'),originalSha256:sha(original),sha256:sha(bytes),bytes:bytes.length,...(rendererUnchanged?{rendererUnchanged}:{}),kind:/\.m?js$/i.test(relative)?'existing renderer and adapted data':/\.html$/i.test(relative)?'existing markup and adapted text':/\.css$/i.test(relative)?'existing styles with relocated paths':'existing asset'});
}
assert.ok(adapted,'Brazilian content was not found');
const legalTemplate=await readFile(path.join(targetRoot,'arrependimento/index.html'),'utf8');
const head=legalTemplate.slice(0,legalTemplate.indexOf('<body>')).replace('Arrependimento e reembolso · Trilha Shop','Plano TikTok Shop · inscrições');
const availability=head+`<body><main><div class="brand"><span class="logo"><i></i></span>Trilha Shop</div><h1>Seu plano de 21 dias está pronto para conhecer.</h1><p>A entrega é um plano digital com passo a passo para começar no TikTok Shop, por <strong>R$ 29,90</strong>, aparecendo ou com apoio de IA.</p><div class="card"><p><strong>As inscrições ainda não estão abertas.</strong></p><p>O checkout exclusivo desta oferta será disponibilizado antes da contratação. Nenhum pagamento é solicitado nesta prévia.</p></div><a class="btn" href="/tiktok-shop/?ver=oferta">Voltar ao meu plano →</a><footer><p>GAL NEGOCIOS DIGITAIS LTDA · Projeto educativo independente, sem vínculo oficial com o TikTok. As missões e as comissões do quiz são simuladas; não há saldo para saque.</p><nav><a href="/tiktok-shop/#termini">Termos</a><a href="/tiktok-shop/#privacy">Privacidade</a></nav></footer></main></body></html>`;
await mkdir(path.join(targetRoot,'inscricoes'),{recursive:true});await writeFile(path.join(targetRoot,'inscricoes/index.html'),availability);await writeFile(path.join(targetRoot,'arrependimento/index.html'),availability);
await mkdir('reports/tiktok-shop',{recursive:true});
await writeFile('reports/tiktok-shop/adapted-data.json',JSON.stringify({config:adapted.config,content:adapted.content},null,2));
const legalEntry=files.find(f=>f.file.endsWith('/arrependimento/index.html'));legalEntry.sha256=sha(Buffer.from(availability));legalEntry.bytes=Buffer.byteLength(availability);
await writeFile('reports/tiktok-shop/clone-manifest.json',JSON.stringify({source:sourceRoot,destination:targetRoot,basePath:base,storagePrefix:'ugc-shop-',files,stages:adapted.content.steps.length+1,unchangedRenderers:files.filter(f=>f.rendererUnchanged).length,flowAdjustment:'Retain the existing scratch screen for a plan reveal without a discount or anchor price.',price:adapted.config.price},null,2));
console.log(JSON.stringify({copiedFiles:files.length,stages:adapted.content.steps.length+1,unchangedRenderers:files.filter(f=>f.rendererUnchanged).length,basePath:base}));
