import { createHmac,timingSafeEqual,createHash } from 'node:crypto';
const fail=(status,message)=>Object.assign(Error(message),{status});
export const purchaseConnected=()=>process.env.CHECKOUT_WEBHOOK_SECRET?.length>=32&&process.env.CHECKOUT_ENABLED==='1';
// Provider adapters must validate their payment status, then sign this canonical envelope.
// A browser/thank-you-page visit is never accepted as a confirmed payment.
export async function recordPurchase(db,data,signature) {
  if(!purchaseConnected())throw fail(503,'Checkout não conectado.');
  const envelope={offer:String(data.offer||''),transaction:String(data.transaction||''),email:String(data.email||'').trim().toLowerCase(),at:Number(data.at)};
  if(!envelope.offer||!envelope.transaction||envelope.transaction.length>160||!envelope.email.includes('@')||!Number.isFinite(envelope.at)||Math.abs(Date.now()-envelope.at)>86400000)throw fail(400,'Confirmação inválida.');
  const expected=createHmac('sha256',process.env.CHECKOUT_WEBHOOK_SECRET).update(JSON.stringify(envelope)).digest('hex'),supplied=String(signature||'');
  if(supplied.length!==expected.length||!timingSafeEqual(Buffer.from(supplied),Buffer.from(expected)))throw fail(403,'Assinatura inválida.');
  const receipt=createHash('sha256').update(envelope.offer+':'+envelope.transaction).digest('hex');
  const [lead]=await db.query('SELECT id FROM qa_leads WHERE offer_id=$1 AND email=$2 AND is_test=0',[envelope.offer,envelope.email]);
  const [visit]=lead?await db.query('SELECT v.id,v.qa FROM qa_lead_sessions s JOIN qa_visits v ON v.id=s.session_id AND v.offer_id=s.offer_id WHERE s.lead_id=$1 AND v.first_at<=$2 ORDER BY v.last_at DESC LIMIT 1',[lead.id,envelope.at]):[];
  // Unmatched purchases remain recorded without attributing them to a random visit.
  await db.query('INSERT INTO qa_purchases(id,offer_id,visit_id,lead_id,occurred_at,qa) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO NOTHING',[receipt,envelope.offer,visit?.id||null,lead?.id||null,envelope.at,visit?.qa||0]);
  return {accepted:true,linked:!!visit};
}
