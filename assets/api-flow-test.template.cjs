/* %PROJECT_TITLE% · api-flow-test.cjs — end-to-end API integration test (throwaway) */
'use strict';
const BASE = 'http://localhost:%PORT_DEFAULT%';
// 默认测试角色/嫌疑 id；构建脚本会替换为剧本具体值（见 references/12-script-paradigms.md）
const A_ID = 'A_CHAR_ID';
const B_ID = 'B_CHAR_ID';
const A_VOTE = 'A_VOTE_ID';
const B_VOTE = 'B_VOTE_ID';
const AP_DEFAULT = 8;
const j = async (p, m, body, token) => {
  const h = { 'Content-Type': 'application/json' };
  if (token) h['x-token'] = token;
  const r = await fetch(BASE + p, { method: m || 'GET', headers: h, body: body ? JSON.stringify(body) : undefined });
  return r.json();
};
async function raw(p, token) {
  const r = await fetch(BASE + p, { headers: token ? { 'x-token': token } : {} });
  return r.status;
}
function assert(cond, msg) { if (!cond) { console.log('❌ FAIL: ' + msg); process.exitCode = 1; } else console.log('✅ ' + msg); }

(async () => {
  const dm = await j('/api/dm/login', 'POST', {});
  assert(dm.ok, 'DM login');
  let dt = dm.token;
  await j('/api/dm/reset', 'POST', {}, dt);   // clean slate (clears all sessions ≤ we re-login)
  dt = (await j('/api/dm/login', 'POST', {})).token;  // fresh DM session after reset

  const c = d => d.state.characters.find(x => x.id === d._)?._ ?? null;
  // create 2 players（characterId 由构建脚本替换；A/B 默认从 data.json 头两位角色推断）
  const a = await j('/api/dm/players/create', 'POST', { playerName: 'TestPlayerA', characterId: A_ID, ap: AP_DEFAULT }, dt);
  const b = await j('/api/dm/players/create', 'POST', { playerName: 'TestPlayerB', characterId: B_ID, ap: AP_DEFAULT }, dt);
  assert(a.ok && b.ok, 'DM created players');
  const codeA = a.player.claimCode, codeB = b.player.claimCode;
  assert(/^\d{4}$/.test(codeA) && /^\d{4}$/.test(codeB), 'claim codes are 4-digit numbers: ' + codeA + ' / ' + codeB);

  const ca = await j('/api/claim', 'POST', { code: codeA });
  assert(ca.ok, 'Player A claim');
  const tA = ca.token;
  const stA = ca.state;
  assert(Array.isArray(stA.characters) && stA.characters.length >= 2, 'player state exposes all characters (got ' + stA.characters.length + ')');
  assert(stA.me.characterId === A_ID, 'A is ' + A_ID);
  assert(stA.scriptPages && stA.scriptPages.length > 0, 'A has script pages');
  assert(stA.me.vote === null, 'vote initially null');

  // multi-page script resource must be accessible (fix: page 2+ returned 403)
  const pagePaths = stA.scriptPages || [stA.script].filter(Boolean);
  for (const p of pagePaths) {
    const code = await raw('/res?p=' + encodeURIComponent(p) + '&t=' + encodeURIComponent(tA));
    assert(code === 200, 'script page accessible: ' + p + ' → ' + code);
  }

  // 剧情推进：走 DM 界面唯一路径 /api/dm/step（phase 由 currentStep 派生）。
  // 若剧本按 unlockStep 分轮放线索，逐步推进（仍在 started 段内）直到出现可搜线索。
  const dms0 = await j('/api/dm/state', 'GET', null, dt);
  const maxStartedStep = Math.max(0, ((dms0.state.timeline || []).length - 2));
  const cands = stA.areas.filter(x => !(x.owner || []).includes(A_ID) && !x.locked && (x.clues || []).length > 0 && (x.clues || []).some(cl => cl.state === 'locked'));
  assert(cands.length > 0, 'A has a searchable area');
  const area = cands[0];
  let s = null;
  for (let st = 0; st <= maxStartedStep; st++) {
    await j('/api/dm/step', 'POST', { step: st }, dt);
    const r = await j('/api/player/search', 'POST', { token: tA, areaId: area.id });
    if (r.ok && !r.empty) { s = r; break; }
  }
  assert(s.ok && !s.empty, 'A searched area and got a clue: ' + (s.clue ? s.clue.title : 'empty'));
  assert(s.clue && /^\d{4}$/.test(s.clue.code), 'clue code is 4-digit number: ' + (s.clue && s.clue.code));
  console.log('   clue code: ' + (s.clue ? s.clue.code : s.error));

  // public clue visible to everyone, including the owner (only if a clue was returned)
  if (s.clue) {
    const vis = await j('/api/player/visible', 'POST', { token: tA, clueId: s.clue.id, visible: 'public' });
    assert(vis.ok, 'A made the clue public');
    const stPub = (await j('/api/player/state', 'GET', null, tA)).state;
    assert(stPub.publicClues.some(x => x.id === s.clue.id), 'owner sees own public clue in publicClues');
    assert(stPub.myClues.some(x => x.id === s.clue.id), 'owner still sees own public clue in myClues');
  } else {
    console.log('ℹ no clue returned (empty search); skipping public-visibility asserts');
  }

  // vote (投凶目标由构建脚本替换)。R57：若剧本设 settings.voteFromStep 分轮开放投票，先推进到该剧情步
  const voteFrom = (dms0.state.settings && typeof dms0.state.settings.voteFromStep === 'number') ? dms0.state.settings.voteFromStep : 0;
  let curStep = (await j('/api/dm/state', 'GET', null, dt)).state.game.currentStep;
  if (curStep < voteFrom) await j('/api/dm/step', 'POST', { step: voteFrom }, dt);
  let v = await j('/api/player/vote', 'POST', { token: tA, suspectId: A_VOTE });
  assert(v.ok, 'A votes for ' + A_VOTE);
  // try self-vote reject
  v = await j('/api/player/vote', 'POST', { token: tA, suspectId: A_ID });
  assert(!v.ok, 'self-vote rejected');
  // inspect dm voteSummary
  let dms = await j('/api/dm/state', 'GET', null, dt);
  let vs = dms.state.voteSummary;
  assert(vs && vs.some(r => r.suspectId === A_VOTE && r.count === 1), 'dm voteSummary shows ' + A_VOTE + ' has 1 vote');

  // claim B and vote
  const cb = await j('/api/claim', 'POST', { code: codeB });
  const tB = cb.token;
  const vb = await j('/api/player/vote', 'POST', { token: tB, suspectId: B_VOTE });
  assert(vb.ok, 'B votes for ' + B_VOTE);

  // timer state: startedAt + phaseHistory recorded after step advance
  dms = await j('/api/dm/state', 'GET', null, dt);
  const g = dms.state.game;
  assert(g.startedAt > 0, 'game.startedAt recorded after step advance');
  assert(Array.isArray(g.phaseHistory) && g.phaseHistory.length > 0, 'game.phaseHistory recorded phase switches');

  // truth unlock
  const tr = await j('/api/dm/truth', 'POST', { unlock: true }, dt);
  assert(tr.ok, 'DM unlock truth');
  const stA2 = (await j('/api/player/state', 'GET', null, tA)).state;
  assert(!!stA2.truth, 'A sees truth after unlock');
  assert(stA2.game.voteResult && stA2.game.voteResult.length === 2, 'voteResult exposed after reveal (2 suspects)');

  // mvp
  const m = await j('/api/dm/mvp', 'POST', { playerId: a.player.id }, dt);
  assert(m.ok && m.mvp === a.player.id, 'MVP set to A');
  const stA3 = (await j('/api/player/state', 'GET', null, tA)).state;
  assert(stA3.game.mvp === a.player.id, 'A sees MVP in own state');

  console.log('\n=== FLOW PASSED (if no FAIL above) ===');
})().catch(e => { console.error('test crashed: ' + (e && e.stack || e)); process.exitCode = 1; });