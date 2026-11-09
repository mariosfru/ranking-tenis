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
    {id:'j_20261107_01',mode:'doubles',a1:'p_olavo',a2:'p_franco',b1:'p_diogo',b2:'p_thomaz',score_a:1,score_b:3,played_on:'2026-11-07',first_server:'p_olavo',recorded_by:'Registro inicial'},
    {id:'j_20261107_02',mode:'doubles',a1:'p_olavo',a2:'p_diogo',b1:'p_thomaz',b2:'p_mario',score_a:3,score_b:0,played_on:'2026-11-07',first_server:'p_mario',recorded_by:'Registro inicial'},
    {id:'j_20261107_03',mode:'doubles',a1:'p_franco',a2:'p_thomaz',b1:'p_diogo',b2:'p_mario',score_a:0,score_b:3,played_on:'2026-11-07',first_server:'p_franco',recorded_by:'Registro inicial'},
    {id:'j_20261107_04',mode:'doubles',a1:'p_olavo',a2:'p_thomaz',b1:'p_franco',b2:'p_mario',score_a:2,score_b:3,played_on:'2026-11-07',first_server:'p_olavo',recorded_by:'Registro inicial'},
    {id:'j_20261107_05',mode:'doubles',a1:'p_olavo',a2:'p_mario',b1:'p_franco',b2:'p_diogo',score_a:3,score_b:0,played_on:'2026-11-07',first_server:'p_diogo',recorded_by:'Registro inicial'}
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
  if (method !== 'GET') {
    const code = $('edit-code').value;
    if (code.length < 12) throw new Error('Informe a chave de edição de pelo menos 12 caracteres.');
    headers['X-Edit-Code'] = code;
  }
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

function computeRanking(mode) {
  const stats = new Map(state.players.map(p => [p.id, { ...p, games:0, wins:0, losses:0, gf:0, ga:0 }]));
  state.matches.filter(m => mode === 'all' || m.mode === mode).forEach(m => {
    const aWon = m.score_a > m.score_b;
    for (const side of ['a','b']) {
      for (const id of [m[side+'1'],m[side+'2']].filter(Boolean)) {
        const s = stats.get(id); if (!s) continue;
        const won = (side === 'a') === aWon;
        s.games++; s.wins += Number(won); s.losses += Number(!won);
        s.gf += m[side === 'a' ? 'score_a' : 'score_b'];
        s.ga += m[side === 'a' ? 'score_b' : 'score_a'];
      }
    }
  });
  return [...stats.values()].map(s => ({...s, pct:s.games ? s.wins / s.games : -1, saldo:s.gf-s.ga, saldoMedio:s.games ? (s.gf-s.ga) / s.games : -Infinity}))
    .sort((a,b) => b.pct-a.pct || b.saldoMedio-a.saldoMedio || b.wins-a.wins || a.name.localeCompare(b.name,'pt-BR'));
}
function renderRanking() {
  document.querySelectorAll('[data-rank-mode]').forEach(el => { el.classList.toggle('active', el.dataset.rankMode === rankMode); el.setAttribute('aria-pressed', String(el.dataset.rankMode === rankMode)); });
  const stats = computeRanking(rankMode);
  $('ranking-body').innerHTML = stats.map((s,i) => {
    const sign = s.saldo > 0 ? '+' : '';
    const noGames = !s.games;
    return `<tr class="${i===0 && !noGames ? 'first':''}"><td><span class="position">${noGames ? '–' : i+1+'º'}</span></td>
      <td class="who"><span class="ranking-player">${monogram(s.name)}<span>${escapeHtml(s.name)}<small>${s.games} ${s.games===1?'partida':'partidas'}</small></span></span></td>
      <td>${s.wins}–${s.losses}</td><td class="pct">${noGames ? '–' : (s.pct*100).toLocaleString('pt-BR',{maximumFractionDigits:1})+'%'}</td>
      <td class="${s.saldo>0?'positive':s.saldo<0?'negative':''}">${noGames?'–':sign+s.saldo}</td></tr>`;
  }).join('') || '<tr><td colspan="5">Nenhum participante cadastrado.</td></tr>';
}

function renderHistory() {
  document.querySelectorAll('[data-history-mode]').forEach(el => { el.classList.toggle('active',el.dataset.historyMode === historyMode); el.setAttribute('aria-pressed',String(el.dataset.historyMode === historyMode)); });
  const matches = [...state.matches].filter(m => historyMode === 'all' || historyMode === m.mode)
    .sort((a,b) => (b.played_on || '').localeCompare(a.played_on || '') || (b.created_at || '').localeCompare(a.created_at || '') || b.id.localeCompare(a.id));
  const shown = matches.slice(0,historyLimit);
  $('history-list').innerHTML = shown.length ? shown.map(m => {
    const aWon = m.score_a > m.score_b;
    return `<article class="history-item"><div class="history-top"><span class="mode-tag">${m.mode === 'singles'?'Simples':'Duplas'}</span><span class="history-date">${fmtDate(m.played_on)}</span></div>
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
function clearForm() {
  editId = null; $('match-form').reset(); $('played_on').value=localToday();
  $('save-match').textContent='Salvar resultado'; $('cancel-edit').hidden=true;
  $('suggestion-box').hidden=true; setFormMode(formMode); updateServerOptions();
}
function getFormData() {
  const d = {
    mode:formMode, a1:$('a1').value, a2:formMode==='doubles'?$('a2').value:null,
    b1:$('b1').value, b2:formMode==='doubles'?$('b2').value:null,
    score_a:$('score_a').value === ''?NaN:Number($('score_a').value),
    score_b:$('score_b').value === ''?NaN:Number($('score_b').value),
    played_on:$('played_on').value, first_server:$('first_server').value || null,
    recorded_by:$('recorded_by').value.trim()
  };
  const ids=[d.a1,d.b1,...(d.mode==='doubles'?[d.a2,d.b2]:[])];
  if (ids.some(x=>!x)||new Set(ids).size!==ids.length) throw new Error('Selecione jogadores diferentes para cada posição.');
  if (!((d.score_a === 3 && d.score_b>=0 && d.score_b<=2)||(d.score_b===3 && d.score_a>=0 && d.score_a<=2))) throw new Error('O placar precisa ser 3 a 0, 3 a 1 ou 3 a 2.');
  if (!d.played_on) throw new Error('Informe a data da partida.');
  return d;
}
function verifyDemo(body) {
  if (body.mode !== 'singles' && body.mode !== 'doubles') throw new Error('Modalidade inválida.');
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
  clearForm();setFormMode(m.mode);
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
  $('edit-code-hint').textContent=isDemo?'Demonstração: a chave não é exigida. Os dados só ficam neste navegador.':'A chave fica apenas nesta aba; nunca é enviada na URL nem salva no navegador.';
  $('played_on').value=localToday();setFormMode('doubles');
  try {
    await refresh();
    if(!isDemo){badge.textContent='Sincronizado';badge.className='connection-pill live';}
  } catch(err){badge.textContent='Sem conexão';badge.className='connection-pill demo';showToast('Não foi possível acessar o servidor: '+(err.message||'erro de rede'),true);}
}
start();
