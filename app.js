const $ = (id) => document.getElementById(id);
const apiBase = (window.TENNIS_CONFIG?.apiBaseUrl || '').trim().replace(/\/$/, '');
const isDemo = !apiBase;
const cacheKey = 'ranking-tenis-demo-v1';
const SEED = {
  players: [
    { id: 'p_mario', name: 'Mario' }, { id: 'p_olavo', name: 'Olavo' },
    { id: 'p_franco', name: 'Franco' }, { id: 'p_diogo', name: 'Diogo' },
    { id: 'p_thomaz', name: 'Thomaz' }
  ],
  matches: [
    {id:'j_20261107_01',set_format:'mini',mode:'doubles',a1:'p_olavo',a2:'p_franco',b1:'p_diogo',b2:'p_thomaz',score_a:1,score_b:3,played_on:'2026-11-07',first_server:'p_olavo',recorded_by:'Registro inicial'},
    {id:'j_20261107_02',set_format:'mini',mode:'doubles',a1:'p_olavo',a2:'p_diogo',b1:'p_thomaz',b2:'p_mario',score_a:3,score_b:0,played_on:'2026-11-07',first_server:'p_mario',recorded_by:'Registro inicial'},
    {id:'j_20261107_03',set_format:'mini',mode:'doubles',a1:'p_franco',a2:'p_thomaz',b1:'p_diogo',b2:'p_mario',score_a:0,score_b:3,played_on:'2026-11-07',first_server:'p_franco',recorded_by:'Registro inicial'},
    {id:'j_20261107_04',set_format:'mini',mode:'doubles',a1:'p_olavo',a2:'p_thomaz',b1:'p_franco',b2:'p_mario',score_a:2,score_b:3,played_on:'2026-11-07',first_server:'p_olavo',recorded_by:'Registro inicial'},
    {id:'j_20261107_05',set_format:'mini',mode:'doubles',a1:'p_olavo',a2:'p_mario',b1:'p_franco',b2:'p_diogo',score_a:3,score_b:0,played_on:'2026-11-07',first_server:'p_diogo',recorded_by:'Registro inicial'}
  ]
};

function loadDemo() {
  try {
    const stored = JSON.parse(localStorage.getItem(cacheKey));
    if (stored && Array.isArray(stored.players) && Array.isArray(stored.matches)) return stored;
  } catch (_) {}
  return structuredClone(SEED);
}
let state = isDemo ? loadDemo() : { players: [], matches: [] };
let rankMode = 'all', formMode = 'doubles', historyMode = 'all', editId = null;
let historyLimit = 12;
let toastTimer;

function escapeHtml(v) { return String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])); }
function nameFor(id) { return state.players.find(p => p.id === id)?.name || '(excluído)'; }
function initialsFor(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return parts.length > 1 ? (parts[0][0] + parts.at(-1)[0]).toLocaleUpperCase('pt-BR') : (parts[0] || '?').slice(0, 2).toLocaleUpperCase('pt-BR');
}
function monogram(name, compact = false) { return `<span class="initial-avatar${compact ? ' small' : ''}" aria-hidden="true">${escapeHtml(initialsFor(name))}</span>`; }
function fmtDate(s) { if (!/^\d{4}-\d\d-\d\d$/.test(s || '')) return 'Sem data'; const [y,m,d] = s.split('-'); return `${d}/${m}/${y}`; }
function localToday() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function teamName(m, side) { return (side === 'a' ? [m.a1,m.a2] : [m.b1,m.b2]).filter(Boolean).map(nameFor).join(' + '); }
function showToast(message, error=false) {
  const el = $('toast'); el.textContent = message; el.className = `toast show${error ? ' error' : ''}`;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.className = 'toast'; }, 3700);
}
function saveDemo() { localStorage.setItem(cacheKey, JSON.stringify(state)); }

async function callApi(path, method='GET', body=undefined) {
  const headers = { 'Content-Type':'application/json' };
  const response = await fetch(`${apiBase}${path}`, { method, headers, ...(body === undefined ? {} : {body:JSON.stringify(body)}), cache:'no-store' });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `Erro ${response.status}`);
  return result;
}
async function refresh() {
  if (!isDemo) state = await callApi('/api/state');
  render();
}
function render() {
  $('count-matches').textContent = state.matches.length;
  $('count-players').textContent = state.players.length;
  $('count-singles').textContent = state.matches.filter(m => m.mode === 'singles').length;
  $('count-doubles').textContent = state.matches.filter(m => m.mode === 'doubles').length;
  renderRanking(); renderHistory(); renderPlayers(); fillPlayerSelects();
}

function matchFormat(m) { return m.set_format === 'standard' ? 'standard' : 'mini'; }
function validScore(format, a, b) {
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) return false;
  if (format === 'mini') return (a === 3 && b <= 2) || (b === 3 && a <= 2);
  if (format === 'standard') return (a === 6 && b <= 4) || (b === 6 && a <= 4) ||
    (a === 7 && (b === 5 || b === 6)) || (b === 7 && (a === 5 || a === 6));
  return false;
}
function headToHead(idA, idB, mode) {
  let winsA=0,winsB=0;
  for(const m of state.matches.filter(x=>mode==='all'||x.mode===mode)) {
    const sideA = [m.a1,m.a2].includes(idA)?'a':[m.b1,m.b2].includes(idA)?'b':null;
    const sideB = [m.a1,m.a2].includes(idB)?'a':[m.b1,m.b2].includes(idB)?'b':null;
    if(!sideA||!sideB||sideA===sideB)continue;
    const winner=m.score_a>m.score_b?'a':'b';
    if(winner===sideA)winsA++;else winsB++;
  }
  if(!winsA&&!winsB) return 0;
  return winsA/(winsA+winsB)-winsB/(winsA+winsB);
}
function computeRanking(mode) {
  const performance = mode === 'performance';
  const matchMode = performance ? 'all' : mode;
  const stats = new Map(state.players.map(p => [p.id, {
    ...p, games:0, wins:0, losses:0, proportionalSum:0
  }]));
  state.matches.filter(m => matchMode === 'all' || m.mode === matchMode).forEach(m => {
    const aWon = m.score_a > m.score_b;
    const total = m.score_a + m.score_b;
    if (total <= 0) return;
    for (const side of ['a','b']) {
      for (const id of [m[side+'1'],m[side+'2']].filter(Boolean)) {
        const s = stats.get(id);
        if (!s) continue;
        const won = (side === 'a') === aWon;
        const own = m[side === 'a' ? 'score_a' : 'score_b'];
        const opp = m[side === 'a' ? 'score_b' : 'score_a'];
        s.games++;
        s.wins += Number(won);
        s.losses += Number(!won);
        s.proportionalSum += (own - opp) / total;
      }
    }
  });
  const ranked = [...stats.values()].map(s => ({
    ...s,
    pct: s.games ? s.wins/s.games : -1,
    saldoMedio: s.games ? s.proportionalSum/s.games : -Infinity,
    adjusted: s.games ? (s.wins+2)/(s.games+4) : -1
  }));
  const equals = (a,b) => a === b || Math.abs(a-b) < 1e-10;
  const compareNumbers = (a,b) => {
    if (performance) {
      return (b.adjusted-a.adjusted) || (b.saldoMedio-a.saldoMedio) ||
        (b.wins-a.wins) || (b.pct-a.pct) || 0;
    }
    return (b.wins-a.wins) || (b.pct-a.pct) || (b.saldoMedio-a.saldoMedio) || 0;
  };
  const tied = (a,b) => performance
    ? equals(a.adjusted,b.adjusted) && equals(a.saldoMedio,b.saldoMedio) &&
      a.wins===b.wins && equals(a.pct,b.pct)
    : a.wins===b.wins && equals(a.pct,b.pct) && equals(a.saldoMedio,b.saldoMedio);
  ranked.sort((a,b) => compareNumbers(a,b) || a.name.localeCompare(b.name,'pt-BR'));
  // Confronto direto somente em empate exato entre dois participantes.
  for (let i=0; i<ranked.length;) {
    let j=i+1;
    while(j<ranked.length && tied(ranked[i],ranked[j])) j++;
    if(j-i===2 && ranked[i].games && ranked[i+1].games &&
      headToHead(ranked[i].id,ranked[i+1].id,matchMode)<0) {
      [ranked[i],ranked[i+1]] = [ranked[i+1],ranked[i]];
    }
    for (let k=i;k<j;k++) {
      const tieBroken = j-i===2 && ranked[i].games && ranked[i+1].games &&
        headToHead(ranked[i].id,ranked[i+1].id,matchMode)!==0;
      ranked[k].position = !ranked[k].games ? null : tieBroken ? k+1 : i+1;
    }
    i=j;
  }
  return ranked;
}
function renderRanking() {
  const performance = rankMode === 'performance';
  document.querySelectorAll('[data-rank-mode]').forEach(el => {
    el.classList.toggle('active',el.dataset.rankMode===rankMode);
    el.setAttribute('aria-pressed',String(el.dataset.rankMode===rankMode));
  });
  $('ranking-headline').textContent = performance
    ? 'Constância conta mais do que um começo perfeito.'
    : 'Mais vitórias no topo. Aproveitamento desempata.';
  $('ranking-final-header').textContent = performance ? 'ÍNDICE' : 'SALDO %';
  $('ranking-explanation').textContent = performance
    ? 'Índice de Performance = (vitórias + 2) ÷ (partidas + 4). Corrige a vantagem de poucos jogos. Desempate pelo saldo proporcional médio. Simples, duplas e formatos de set têm o mesmo peso.'
    : 'Ordem: mais vitórias, maior aproveitamento, saldo proporcional médio e, em empate exato entre dois jogadores, confronto direto. Minisset e set convencional valem igualmente.';
  const stats = computeRanking(rankMode);
  $('ranking-body').innerHTML = stats.map((s,i) => {
    const noGames = !s.games;
    const finalStat = noGames ? '–' : ((performance?s.adjusted:s.saldoMedio)*100)
      .toLocaleString('pt-BR',{maximumFractionDigits:1})+'%';
    const finalClass = performance ? 'pct' : s.saldoMedio>0?'positive':s.saldoMedio<0?'negative':'';
    return `<tr class="${i===0&&!noGames?'first':''}"><td><span class="position">${noGames?'–':s.position+'º'}</span></td>
      <td class="who"><span class="ranking-player">${monogram(s.name)}<span>${escapeHtml(s.name)}<small>${s.games} ${s.games===1?'partida':'partidas'}</small></span></span></td>
      <td>${s.wins}–${s.losses}</td><td class="pct">${noGames?'–':(s.pct*100).toLocaleString('pt-BR',{maximumFractionDigits:1})+'%'}</td>
      <td class="${finalClass}">${finalStat}</td></tr>`;
  }).join('') || '<tr><td colspan="5">Nenhum participante cadastrado.</td></tr>';
}

function renderHistory() {
  document.querySelectorAll('[data-history-mode]').forEach(el => { el.classList.toggle('active',el.dataset.historyMode === historyMode); el.setAttribute('aria-pressed',String(el.dataset.historyMode === historyMode)); });
  const matches = [...state.matches].filter(m => historyMode === 'all' || historyMode === m.mode)
    .sort((a,b) => (b.played_on || '').localeCompare(a.played_on || '') || (b.created_at || '').localeCompare(a.created_at || '') || b.id.localeCompare(a.id));
  const shown = matches.slice(0,historyLimit);
  $('history-list').innerHTML = shown.length ? shown.map(m => {
    const aWon = m.score_a > m.score_b;
    return `<article class="history-item"><div class="history-top"><span class="mode-tag">${m.mode === 'singles'?'Simples':'Duplas'}</span><span class="format-tag">${matchFormat(m)==='standard'?'Set convencional':'Minisset'}</span><span class="history-date">${fmtDate(m.played_on)}</span></div>
      <div class="history-score"><span class="team ${aWon?'':'loser'}">${escapeHtml(teamName(m,'a'))}</span><span class="numbers">${m.score_a} × ${m.score_b}</span><span class="team right ${aWon?'loser':''}">${escapeHtml(teamName(m,'b'))}</span></div>
      <div class="history-meta"><span>${m.recorded_by ? 'Por '+escapeHtml(m.recorded_by) : (m.first_server ? '1º saque: '+escapeHtml(nameFor(m.first_server)) : '')}</span><span class="edit-actions"><button type="button" data-edit="${escapeHtml(m.id)}">Editar</button><button type="button" data-delete="${escapeHtml(m.id)}">Excluir</button></span></div>
    </article>`;
  }).join('') : '<p class="empty">Nenhuma partida nessa modalidade.</p>';
  $('history-count').innerHTML = matches.length > shown.length ? `<button type="button" class="text-button" id="load-more">Mostrar mais ${Math.min(12,matches.length-shown.length)} jogos</button>` : `${matches.length} ${matches.length===1?'partida registrada':'partidas registradas'}.`;
  $('load-more')?.addEventListener('click',()=>{historyLimit+=12;renderHistory();});
}
function renderPlayers() {
  $('player-chips').innerHTML = [...state.players].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')).map(p=>`<span class="player-chip">${monogram(p.name, true)}${escapeHtml(p.name)}</span>`).join('') || '<p>Nenhum jogador.</p>';
}
function fillPlayerSelects() {
  const all = [...state.players].sort((a,b) => a.name.localeCompare(b.name,'pt-BR'));
  for (const id of ['a1','a2','b1','b2']) {
    const el = $(id), current = el.value;
    el.innerHTML = '<option value="">Selecionar</option>' + all.map(p=>`<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join('');
    if (all.some(p=>p.id===current)) el.value = current;
  }
  updateServerOptions();
}
function updateServerOptions() {
  const select = $('first_server'), current=select.value;
  const ids = ['a1',...(formMode==='doubles'?['a2']:[]),'b1',...(formMode==='doubles'?['b2']:[])].map(id=>$(id).value).filter(Boolean);
  select.innerHTML = '<option value="">Não informado</option>' + [...new Set(ids)].map(id=>`<option value="${escapeHtml(id)}">${escapeHtml(nameFor(id))}</option>`).join('');
  if (ids.includes(current)) select.value=current;
}
function setFormMode(mode) {
  formMode = mode;
  document.querySelectorAll('[data-form-mode]').forEach(el=>{el.classList.toggle('active',el.dataset.formMode===mode);el.setAttribute('aria-pressed',String(el.dataset.formMode===mode));});
  document.querySelectorAll('.doubles-only').forEach(el=>el.hidden = mode === 'singles');
  $('a2').required = mode === 'doubles'; $('b2').required = mode === 'doubles';
  $('team-a-label').textContent = mode === 'doubles'?'Dupla 1':'Jogador 1';
  $('team-b-label').textContent = mode === 'doubles'?'Dupla 2':'Jogador 2';
  $('suggest-btn').hidden = mode !== 'doubles';
  $('suggestion-box').hidden = true;
  updateServerOptions();
}
function setScoreOptions(format, preserve=false) {
  const options=['<option value="">–</option>'];
  for(let i=0;i<=(format==='standard'?7:3);i++) options.push(`<option value="${i}">${i}</option>`);
  for(const id of ['score_a','score_b']) {
    const el=$(id), previous=el.value;
    el.innerHTML=options.join('');
    if(preserve && previous!=='' && Number(previous)<=(format==='standard'?7:3)) el.value=previous;
  }
  $('score-format-hint').textContent=format==='standard'?'6 games, ou 7–5 / 7–6':'Primeiro a 3 games';
}
function clearForm() {
  editId = null; $('match-form').reset(); $('played_on').value=localToday();
  $('save-match').textContent='Salvar resultado'; $('cancel-edit').hidden=true;
  $('suggestion-box').hidden=true; setFormMode(formMode);setScoreOptions('mini'); updateServerOptions();
}
function getFormData() {
  const d = {
    mode:formMode, set_format:$('set_format').value, a1:$('a1').value, a2:formMode==='doubles'?$('a2').value:null,
    b1:$('b1').value, b2:formMode==='doubles'?$('b2').value:null,
    score_a:$('score_a').value === ''?NaN:Number($('score_a').value),
    score_b:$('score_b').value === ''?NaN:Number($('score_b').value),
    played_on:$('played_on').value, first_server:$('first_server').value || null,
    recorded_by:$('recorded_by').value.trim()
  };
  const ids=[d.a1,d.b1,...(d.mode==='doubles'?[d.a2,d.b2]:[])];
  if (ids.some(x=>!x)||new Set(ids).size!==ids.length) throw new Error('Selecione jogadores diferentes para cada posição.');
  if (!validScore(d.set_format,d.score_a,d.score_b)) throw new Error(d.set_format==='standard'?'Placar inválido: use 6–0 a 6–4, 7–5 ou 7–6.':'Placar inválido: use 3–0, 3–1 ou 3–2.');
  if (!d.played_on) throw new Error('Informe a data da partida.');
  return d;
}
function verifyDemo(body) {
  if (body.mode !== 'singles' && body.mode !== 'doubles') throw new Error('Modalidade inválida.');
  if (!validScore(body.set_format,body.score_a,body.score_b)) throw new Error('Placar inválido para o formato escolhido.');
  const ids=[body.a1,body.b1,...(body.mode==='doubles'?[body.a2,body.b2]:[])];
  if (ids.some(x=>!state.players.find(p=>p.id===x))||new Set(ids).size!==ids.length) throw new Error('Jogadores inválidos.');
}
async function storeMatch(body) {
  if (isDemo) {
    verifyDemo(body);
    if (editId) {const i=state.matches.findIndex(m=>m.id===editId);if(i===-1) throw new Error('Partida não encontrada.');state.matches[i]={...state.matches[i],...body,updated_at:new Date().toISOString()};}
    else state.matches.push({...body,id:crypto.randomUUID(),created_at:new Date().toISOString()});
    saveDemo();
  } else {
    await callApi(editId?`/api/matches/${editId}`:'/api/matches',editId?'PATCH':'POST',body);
  }
  await refresh(); clearForm();
  showToast('Resultado salvo e ranking atualizado.');
}
function selectMatch(id) {
  const m=state.matches.find(x=>x.id===id);if(!m)return;
  clearForm();setFormMode(m.mode);$('set_format').value=matchFormat(m);setScoreOptions(matchFormat(m));
  for(const key of ['a1','a2','b1','b2']) if(m[key]) $(key).value=m[key];
  $('score_a').value=m.score_a; $('score_b').value=m.score_b;
  $('played_on').value=m.played_on; $('recorded_by').value=m.recorded_by || '';
  updateServerOptions(); $('first_server').value=m.first_server || '';
  editId=id; $('save-match').textContent='Salvar correção'; $('cancel-edit').hidden=false;
  $('registro').scrollIntoView({behavior:'smooth',block:'start'});
}
async function deleteMatch(id) {
  const m=state.matches.find(x=>x.id===id); if(!m)return;
  if(!confirm(`Excluir o resultado ${teamName(m,'a')} ${m.score_a} × ${m.score_b} ${teamName(m,'b')}?`))return;
  if (isDemo) {state.matches=state.matches.filter(x=>x.id!==id);saveDemo();}
  else await callApi(`/api/matches/${id}`,'DELETE');
  await refresh(); if(editId===id)clearForm(); showToast('Partida excluída e ranking recalculado.');
}

// Testa todas as combinações para sugerir um jogo com descansos e parcerias equilibrados.
function suggestDoubles() {
  const players=state.players;
  if (players.length<4) throw new Error('É preciso cadastrar pelo menos quatro participantes.');
  if (players.length>18) throw new Error('Sugestão automática limitada a 18 participantes.');
  const prior=state.matches.filter(m=>m.mode==='doubles').sort((a,b)=>(a.played_on||'').localeCompare(b.played_on||'') || (a.created_at||'').localeCompare(b.created_at||'') || a.id.localeCompare(b.id));
  const played=new Map(players.map(p=>[p.id,0]));
  const partners=new Map(), opponents=new Map();
  const key=(a,b)=>[a,b].sort().join('|');
  const bump=(map,k)=>map.set(k,(map.get(k)||0)+1);
  for(const m of prior) {
    const a=[m.a1,m.a2],b=[m.b1,m.b2];
    [...a,...b].forEach(p=>played.set(p,(played.get(p)||0)+1));
    bump(partners,key(...a));bump(partners,key(...b));
    for(const x of a)for(const y of b)bump(opponents,key(x,y));
  }
  const ids=players.map(p=>p.id), last=prior.at(-1);
  let best=null;
  for(let i=0;i<ids.length-3;i++)for(let j=i+1;j<ids.length-2;j++)for(let k=j+1;k<ids.length-1;k++)for(let l=k+1;l<ids.length;l++) {
    const active=[ids[i],ids[j],ids[k],ids[l]], inSet=new Set(active), bench=ids.filter(id=>!inSet.has(id));
    const scores=ids.map(id=>(played.get(id)||0)+(inSet.has(id)?1:0));
    const avg=scores.reduce((x,y)=>x+y,0)/scores.length;
    const imbalance=scores.reduce((sum,n)=>sum+(n-avg)**2,0);
    const partitions=[[[active[0],active[1]],[active[2],active[3]]],[[active[0],active[2]],[active[1],active[3]]],[[active[0],active[3]],[active[1],active[2]]]];
    for(const [a,b] of partitions) {
      let cost=imbalance*25+(partners.get(key(...a))||0)*6+(partners.get(key(...b))||0)*6;
      for(const x of a)for(const y of b)cost+=(opponents.get(key(x,y))||0)*.8;
      if(last){const lastIds=[last.a1,last.a2,last.b1,last.b2];if(bench.some(x=>!lastIds.includes(x)))cost+=4;}
      const both=a.map(x=>x).concat(b);
      if(last && both.every(x=>[last.a1,last.a2,last.b1,last.b2].includes(x))){
        const lastTeams=[key(last.a1,last.a2),key(last.b1,last.b2)];
        if(lastTeams.includes(key(...a))&&lastTeams.includes(key(...b)))cost+=20;
      }
      if(!best || cost<best.cost)best={a,b,bench,cost};
    }
  }
  return best;
}

// Eventos de UI
for(const button of document.querySelectorAll('[data-rank-mode]')) button.addEventListener('click',()=>{rankMode=button.dataset.rankMode;renderRanking();});
for(const button of document.querySelectorAll('[data-history-mode]')) button.addEventListener('click',()=>{historyMode=button.dataset.historyMode;historyLimit=12;renderHistory();});
for(const button of document.querySelectorAll('[data-form-mode]')) button.addEventListener('click',()=>{setFormMode(button.dataset.formMode);$('a2').value='';$('b2').value='';updateServerOptions();});
for(const id of ['a1','a2','b1','b2']) $(id).addEventListener('change',updateServerOptions);
$('set_format').addEventListener('change',()=>setScoreOptions($('set_format').value,true));
$('match-form').addEventListener('submit',async(e)=>{
  e.preventDefault();const btn=$('save-match');btn.disabled=true;
  try {await storeMatch(getFormData());} catch(err){showToast(err.message||'Erro ao salvar.',true);}finally{btn.disabled=false;}
});
$('player-form').addEventListener('submit',async(e)=>{
  e.preventDefault();const btn=e.currentTarget.querySelector('button');btn.disabled=true;
  try {
    const name=$('new-player').value.trim().replace(/\s+/g,' ');
    if(name.length<2||name.length>40)throw new Error('Nome deve ter entre 2 e 40 caracteres.');
    if(state.players.some(p=>p.name.toLocaleLowerCase('pt-BR')===name.toLocaleLowerCase('pt-BR')))throw new Error('Este jogador já existe.');
    if(isDemo){state.players.push({id:crypto.randomUUID(),name});saveDemo();}
    else await callApi('/api/players','POST',{name});
    await refresh();$('new-player').value='';showToast('Jogador adicionado.');
  }catch(err){showToast(err.message||'Não foi possível adicionar.',true);}finally{btn.disabled=false;}
});
$('history-list').addEventListener('click',async(e)=>{
  const ed=e.target.closest('[data-edit]'), del=e.target.closest('[data-delete]');
  try{if(ed)selectMatch(ed.dataset.edit);if(del)await deleteMatch(del.dataset.delete);}catch(err){showToast(err.message||'Erro ao alterar partida.',true);}
});
$('cancel-edit').addEventListener('click',clearForm);
$('suggest-btn').addEventListener('click',()=>{
  try {
    const s=suggestDoubles();
    for(const [field,id] of [['a1',s.a[0]],['a2',s.a[1]],['b1',s.b[0]],['b2',s.b[1]]])$(field).value=id;
    updateServerOptions();
    $('suggestion-box').innerHTML=`<strong>Sugestão de próximo confronto</strong>${escapeHtml(s.a.map(nameFor).join(' + '))} × ${escapeHtml(s.b.map(nameFor).join(' + '))}<br>Descansa(m): ${escapeHtml(s.bench.map(nameFor).join(', ')||'ninguém')}`;
    $('suggestion-box').hidden=false;
  }catch(err){showToast(err.message,true);}
});

async function start(){
  const badge=$('connection-pill');
  badge.textContent=isDemo?'Demonstração local':'Conectando';badge.className='connection-pill '+(isDemo?'demo':'');
  $('played_on').value=localToday();setFormMode('doubles');setScoreOptions('mini');
  try {
    await refresh();
    if(!isDemo){badge.textContent='Sincronizado';badge.className='connection-pill live';}
  } catch(err){badge.textContent='Sem conexão';badge.className='connection-pill demo';showToast('Não foi possível acessar o servidor: '+(err.message||'erro de rede'),true);}
}
start();
