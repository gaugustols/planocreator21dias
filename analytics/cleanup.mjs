// Owner-only cleanup. The predicate is fixed: this cannot delete ordinary traffic.
export async function purgeTests(db,offer) {
  const [count]=await db.query('SELECT COUNT(*) AS total FROM qa_visits WHERE offer_id=$1 AND qa=1',[offer.id]);
  await db.transaction(async q=>{
    const selected='SELECT e.id FROM qa_events e JOIN qa_visits v ON v.offer_id=e.offer_id AND v.id=e.session_id WHERE v.offer_id=$1 AND v.qa=1';
    await q('DELETE FROM qa_event_details WHERE event_id IN ('+selected+')',[offer.id]);
    await q('DELETE FROM qa_purchases WHERE offer_id=$1 AND visit_id IN(SELECT id FROM qa_visits WHERE offer_id=$1 AND qa=1)',[offer.id]);
    await q('DELETE FROM qa_events WHERE id IN ('+selected+')',[offer.id]);
    await q('DELETE FROM qa_lead_sessions WHERE offer_id=$1 AND session_id IN(SELECT id FROM qa_visits WHERE offer_id=$1 AND qa=1)',[offer.id]);
    await q('DELETE FROM qa_leads WHERE offer_id=$1 AND is_test=1 AND NOT EXISTS(SELECT 1 FROM qa_lead_sessions s WHERE s.lead_id=qa_leads.id)',[offer.id]);
    await q('DELETE FROM qa_visits WHERE offer_id=$1 AND qa=1',[offer.id]);
    // Earlier activation tests predate the test flag; only the two exact QA campaigns qualify.
    await q("DELETE FROM qa_events WHERE offer_id=$1 AND source='ponto_validacao' AND campaign IN('ativacao_painel','teste_navegador') AND NOT EXISTS(SELECT 1 FROM qa_visits v WHERE v.offer_id=qa_events.offer_id AND v.id=qa_events.session_id)",[offer.id]);
  });
  return {deletedVisits:Number(count.total)};
}
