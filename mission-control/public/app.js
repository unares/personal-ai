  'use strict';
  const PROJECTS=['personal-ai','procenteo','inisio'];
  const COLORS={indigo:'#6366f1',amber:'#f59e0b',emerald:'#10b981',rose:'#f43f5e'};
  let proj=PROJECTS[0];

  document.addEventListener('DOMContentLoaded',()=>{
    const tc=document.getElementById('tabs');
    PROJECTS.forEach(p=>{
      const b=document.createElement('button');
      b.className='tab'+(p===proj?' active':'');
      b.textContent=p;
      b.onclick=()=>{proj=p;document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));b.classList.add('active');document.getElementById('plabel').textContent='— '+p;refresh();};
      tc.appendChild(b);
    });
    document.getElementById('plabel').textContent='— '+proj;

    document.querySelectorAll('.chip').forEach(c=>{
      c.onclick=()=>{
        const h=COLORS[c.dataset.color]||'#6366f1';
        document.documentElement.style.setProperty('--gc',h);
        document.documentElement.style.setProperty('--ac',h);
        localStorage.setItem('mc-color',c.dataset.color);
        document.querySelectorAll('.chip').forEach(x=>x.classList.remove('sel'));
        c.classList.add('sel');
      };
    });
    const sc=localStorage.getItem('mc-color');
    if(sc){const el=document.querySelector(`.chip[data-color="${sc}"]`);if(el)el.click();}

    document.getElementById('star-btn').onclick=async()=>{
      const r=await fetch('/api/northstar/'+proj);
      document.getElementById('ns-title').textContent='Northstar — '+proj;
      document.getElementById('ns-body').textContent=r.ok?await r.text():'(not found — add shared/northstar-summaries/'+proj+'.md)';
      document.getElementById('ns-modal').classList.remove('hidden');
    };
    document.getElementById('close-ns').onclick=()=>document.getElementById('ns-modal').classList.add('hidden');
    document.getElementById('ns-modal').onclick=e=>{if(e.target===e.currentTarget)e.target.classList.add('hidden');};

    document.getElementById('factory-btn').onclick=()=>{document.getElementById('f-role').value='mvp-builder';openSp();};
    document.getElementById('spawn-btn').onclick=openSp;
    document.getElementById('close-sp').onclick=closeSp;
    document.getElementById('sp-modal').onclick=e=>{if(e.target===e.currentTarget)closeSp();};
    document.getElementById('sp-form').onsubmit=async e=>{
      e.preventDefault();
      const role=document.getElementById('f-role').value;
      const name=document.getElementById('f-name').value.trim().toLowerCase().replace(/\s+/g,'-');
      const project=document.getElementById('f-proj').value;
      const res=document.getElementById('sp-result');
      const r=await fetch('/api/spawn',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({role,name,project})});
      const d=await r.json();
      if(d.ok){res.textContent='✅ '+d.id;res.className='ok';refresh();setTimeout(closeSp,1500);}
      else{res.textContent='❌ '+(d.error||'error');res.className='err';}
    };

    document.querySelectorAll('.guy').forEach(g=>{
      g.onclick=async()=>{
        const rows=(await(await fetch('/api/sandboxes')).json()).filter(s=>s.role===g.dataset.role&&s.status==='running');
        alert(g.dataset.role.toUpperCase()+'\nRunning: '+rows.length+'\n'+rows.map(s=>'• '+s.id).join('\n'));
      };
    });

    refresh();setInterval(refresh,10000);
  });

  function openSp(){document.getElementById('f-proj').value=proj;document.getElementById('sp-result').textContent='';document.getElementById('sp-result').className='';document.getElementById('sp-modal').classList.remove('hidden');}
  function closeSp(){document.getElementById('sp-modal').classList.add('hidden');}

  window.stopSandbox=async id=>{
    if(!confirm('Stop '+id+'?'))return;
    await fetch('/api/stop/'+id,{method:'POST'});
    refresh();
  };

  async function refresh(){
    try{
      const[sr,cr,er]=await Promise.all([fetch('/api/sandboxes'),fetch('/api/costs'),fetch('/api/events?project='+proj+'&limit=20')]);
      const S=await sr.json(),C=await cr.json(),E=await er.json();
      const cm={};C.forEach(c=>{cm[c.sandbox_id]=c;});
      const co=S.some(s=>s.role==='clark'&&s.status==='running');
      const ao=S.some(s=>s.role==='aioo'&&s.status==='running');
      document.getElementById('clark-dot').className='dot'+(co?' on':'');
      document.getElementById('aioo-dot').className='dot'+(ao?' on':'');
      const wt=document.getElementById('wa-txt');wt.textContent=(co&&ao)?'connected':'offline';wt.style.color=(co&&ao)?'#10b981':'#888';
      const tb=document.getElementById('stbody');tb.innerHTML='';
      S.forEach(s=>{
        const c=cm[s.id]||{};
        const rc=s.role==='clark'?'rc':s.role==='aioo'?'ra':'rm';
        const tr=document.createElement('tr');
        tr.innerHTML=`<td>${s.name}</td><td><span class="rb ${rc}">${s.role}</span></td><td>${s.project_id}</td><td>$${(c.total_cost||0).toFixed(4)}</td><td>${c.event_count||0}</td><td>${s.status==='running'?`<button class="btn bd2"
  onclick="stopSandbox('${s.id}')">Stop</button>`:'<span class="stopped">stopped</span>'}</td>`;
        tb.appendChild(tr);
      });
      const el=document.getElementById('elist');el.innerHTML='';
      E.forEach(ev=>{
        const li=document.createElement('li');
        const ts=new Date(ev.created_at+'Z').toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
        li.innerHTML=`<span class="et">${ts}</span><span class="ety">${ev.event_type}</span><span class="ec">${(ev.content||'').slice(0,120).replace(/</g,'&lt;')}</span>`;
        el.appendChild(li);
      });
    }catch(_){}
  }
