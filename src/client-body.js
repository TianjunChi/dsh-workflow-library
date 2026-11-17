const React = require('react');
const h = React.createElement;
const {useState, useEffect, useRef} = React;
const PANEL = 'workflow-library';
const EMPTY = {name:'新工作流',description:'说明适用范围和前置条件',parameters:[],steps:[{title:'第一步',instruction:'填写具体操作',tool:'',validation:'填写验证方法',onFailure:'失败时停止并询问用户'}],successCriteria:'填写可检查的成功标准'};
const css = `

.wfl-confirm{box-sizing:border-box;width:min(480px,calc(100vw - 40px));max-height:calc(100dvh - 40px);overflow:auto;padding:28px;border:1px solid var(--dsw-alias-border-default,#4788ff55);border-radius:24px;color:var(--dsw-alias-label-primary,#20242b);background:linear-gradient(145deg,#4788ff18,transparent 70%),var(--dsw-alias-bg-layer-1,#fff);box-shadow:0 24px 90px #0005;font:14px/1.6 system-ui,sans-serif}
.wfl-confirm::backdrop{background:#07182e80;backdrop-filter:blur(3px)}.wfl-confirm-whale{display:block;font-size:36px;line-height:1.3}.wfl-confirm h2{margin:12px 0 8px;font-size:20px}.wfl-confirm p{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}.wfl-confirm-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:10px;margin-top:24px}.wfl-confirm button{font:inherit;cursor:pointer;padding:9px 18px;border-radius:12px;border:1px solid var(--dsw-alias-border-default,#8886);background:var(--dsw-alias-bg-layer-1,#fff);color:inherit}.wfl-confirm button:hover{filter:brightness(.95)}.wfl-confirm button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4788ff);outline-offset:3px}.wfl-confirm .wfl-confirm-primary{background:linear-gradient(135deg,var(--dsw-alias-brand-primary,#315fce),#397fe8);border-color:transparent;color:#fff}
.wfl-overlay{pointer-events:auto;position:fixed;inset:0;z-index:10000;background:#0008;display:flex;align-items:center;justify-content:center;padding:20px;color:var(--dsw-alias-label-primary,#20242b)}
.wfl-dialog{width:min(1160px,100%);height:min(860px,94vh);background:var(--dsw-alias-bg-layer-1,#fff);border:1px solid #8886;border-radius:16px;box-shadow:0 24px 90px #0005;display:flex;flex-direction:column;overflow:hidden;font:14px/1.5 system-ui,sans-serif}
.wfl-dialog *{box-sizing:border-box}.wfl-dialog header{padding:18px 22px;border-bottom:1px solid #8884;display:flex;gap:12px;align-items:center;justify-content:space-between}.wfl-dialog h2{font-size:20px;margin:0}.wfl-dialog h3{font-size:16px;margin:0 0 10px}.wfl-dialog p{margin:8px 0}.wfl-dialog button,.wfl-launch{font:inherit;cursor:pointer;border:1px solid #8886;border-radius:7px;padding:7px 11px;background:transparent;color:inherit}.wfl-dialog button:disabled{opacity:.45;cursor:not-allowed}.wfl-dialog button:hover:not(:disabled){background:#8882}.wfl-dialog button:focus-visible,.wfl-dialog input:focus-visible,.wfl-dialog textarea:focus-visible,.wfl-launch:focus-visible{outline:2px solid #4788ff;outline-offset:2px}.wfl-dialog .wfl-primary{background:#315fce;color:white;border-color:#315fce}.wfl-dialog select{max-width:100%;padding:8px;font:inherit;background:var(--dsw-alias-bg-layer-1,#fff);color:inherit;border:1px solid #8887;border-radius:7px}.wfl-dialog input,.wfl-dialog textarea{width:100%;font:inherit;color:inherit;background:transparent;border:1px solid #8887;border-radius:7px;padding:9px}.wfl-dialog textarea{resize:vertical;min-height:240px;font:12px/1.6 ui-monospace,Consolas,monospace}.wfl-dialog label{display:block;margin-bottom:10px}.wfl-body{display:grid;grid-template-columns:260px 1fr;min-height:0;flex:1}.wfl-list{padding:16px;border-right:1px solid #8884;overflow:auto}.wfl-detail{padding:20px;overflow:auto;min-width:0}.wfl-actions{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.wfl-card{display:block;width:100%;text-align:left;margin:8px 0}.wfl-card[aria-current=true]{border-color:#4788ff;background:#4788ff18}.wfl-subtle{font-size:12px;opacity:.75}.wfl-notice{padding:10px 20px;background:#4788ff15;white-space:pre-wrap}.wfl-error{background:#c33a3318;color:var(--dsw-alias-label-primary,#802020)}.wfl-preview{white-space:pre-wrap;overflow-wrap:anywhere;border:1px solid #8884;border-radius:8px;padding:12px;max-height:300px;overflow:auto;font:12px/1.6 ui-monospace,monospace}.wfl-step{border-left:3px solid #4788ff;padding:5px 12px;margin:12px 0}.wfl-editor-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.wfl-launch{display:flex;align-items:center;gap:8px}.wfl-status{padding:10px 20px;border-top:1px solid #8884;font-size:12px}@media(max-width:760px){.wfl-overlay{padding:4px}.wfl-body{grid-template-columns:1fr}.wfl-list{max-height:180px;border-bottom:1px solid #8884}.wfl-editor-grid{grid-template-columns:1fr}.wfl-dialog{height:98vh}}`;
exports.inject = ['slots','sessions','uiWorkspace','workspaces'];
exports.apply = function apply(ctx) {
  let visible = false;
  const listeners = new Set();
  const open = () => {visible=true; for(const fn of listeners) fn();};
  const close = () => {visible=false; for(const fn of listeners) fn();};
  const source = {getSnapshot:()=>visible,subscribe:fn=>{listeners.add(fn);return ()=>listeners.delete(fn);}};
  const lifetime = new AbortController();
  let pendingConfirmation = null;
  function confirmAction(message, options = {}) {
    // A second action must not inherit permission from an unrelated confirmation.
    if (lifetime.signal.aborted || pendingConfirmation) return Promise.resolve(false);
    let resolve;
    const result = new Promise(done => {resolve = done;});
    const previous = document.activeElement;
    const modal = document.createElement('dialog');
    modal.className = 'wfl-confirm';
    const title = document.createElement('h2');
    title.id = 'wfl-confirm-title';
    title.textContent = options.title || '请确认此操作';
    const whale = document.createElement('span');
    whale.className = 'wfl-confirm-whale';
    whale.setAttribute('aria-hidden', 'true');
    whale.textContent = '🐳';
    const messageNode = document.createElement('p');
    messageNode.id = 'wfl-confirm-message';
    messageNode.textContent = message;
    modal.setAttribute('aria-labelledby', title.id);
    modal.setAttribute('aria-describedby', messageNode.id);
    const actions = document.createElement('div');
    actions.className = 'wfl-confirm-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.autofocus = true;
    cancel.textContent = '取消';
    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.className = 'wfl-confirm-primary';
    confirm.textContent = options.confirmLabel || '确认继续';
    actions.append(cancel, confirm);
    modal.append(whale, title, messageNode, actions);
    let settled = false;
    function finish(accepted) {
      if (settled) return;
      settled = true;
      lifetime.signal.removeEventListener('abort', abort);
      modal.removeEventListener('keydown', keydown, true);
      modal.removeEventListener('cancel', onCancel);
      modal.removeEventListener('close', onClose);
      cancel.removeEventListener('click', onCancel);
      confirm.removeEventListener('click', onConfirm);
      if (modal.open) modal.close();
      modal.remove();
      if (previous?.isConnected) {
        previous.focus();
        if (document.activeElement !== previous) previous.closest('.wfl-dialog')?.focus();
      }
      pendingConfirmation = null;
      resolve(accepted && !lifetime.signal.aborted);
    }
    function onCancel(event) {event.preventDefault();finish(false);}
    function onClose() {finish(false);}
    function onConfirm() {finish(true);}
    function abort() {finish(false);}
    function keydown(event) {
      // Leave Tab to the native modal; never let Escape reach the parent overlay.
      event.stopPropagation();
      if (event.key === 'Escape') {event.preventDefault();finish(false);}
    }
    pendingConfirmation = result;
    modal.addEventListener('keydown', keydown, true);
    modal.addEventListener('cancel', onCancel);
    modal.addEventListener('close', onClose);
    cancel.addEventListener('click', onCancel);
    confirm.addEventListener('click', onConfirm);
    lifetime.signal.addEventListener('abort', abort, {once:true});
    try {document.body.appendChild(modal);modal.showModal();cancel.focus();}
    catch {finish(false);}
    return result;
  }
  ctx.effect(() => {const style=document.createElement('style');style.textContent=css;document.head.appendChild(style);return ()=>{lifetime.abort();style.remove();};});
  async function api(body) {
    const response=await fetch('/api/workflow-library',{method:body?'POST':'GET',credentials:'same-origin',signal:lifetime.signal,headers:{'X-DSH-Workflow':'1',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const result=await response.json();
    if(!response.ok) throw new Error(typeof result.error==='string'?result.error:result.error?.message || `请求失败 (${response.status})`);
    return result.workflows;
  }
  function activeId() {return Object.values(ctx.sessions.list.getSnapshot().byId).find(row=>(row.retainedBy?.mainView??0)>0)?.id;}
  async function withIdle(id,operation) {
    if(!id || id!==activeId()) throw new Error('当前会话已改变，请重新确认目标会话。');
    return ctx.sessions.using(id,{source:'controllerOperation',signal:lifetime.signal},async ref=>{
      const binding=ref.binding, snapshot=binding.session.getSnapshot();
      if(snapshot.openState!=='open') throw new Error('会话历史尚未就绪，请稍后重试。');
      if(snapshot.running || snapshot.awaitingFirstTurn || snapshot.pendingSubmissions?.length) throw new Error('会话正在运行或有待提交消息，请等待完成。');
      if(snapshot.subagent) throw new Error('请切换到普通主会话后运行工作流。');
      if(id!==activeId()) throw new Error('当前会话已改变，请重试。');
      return operation(binding);
    });
  }
  // Host list methods require their owning store as receiver; keep adapters stable.
  const subscribeSessions = listener => ctx.sessions.list.subscribe(listener);
  const getSessions = () => ctx.sessions.list.getSnapshot();
  const subscribeWorkspaces = listener => ctx.workspaces.list.subscribe(listener);
  const getWorkspaces = () => ctx.workspaces.list.getSnapshot();
  function Launcher(){return h('button',{type:'button',className:'wfl-launch',onClick:open,title:'工作流库','aria-label':'打开工作流库'},h('span',{'aria-hidden':true},'▦'),h('span',null,'工作流库'));}
  function App(){
    const shown=React.useSyncExternalStore(source.subscribe,source.getSnapshot);
    const catalog=React.useSyncExternalStore(subscribeSessions,getSessions);
    const workspaceCatalog=React.useSyncExternalStore(subscribeWorkspaces,getWorkspaces);
    const [picking,setPicking]=useState(false),[sourceId,setSourceId]=useState(''),[loaded,setLoaded]=useState(null),[scope,setScope]=useState('all'),[chosen,setChosen]=useState([]),[excerpts,setExcerpts]=useState({}),[sourceQuery,setSourceQuery]=useState(''),[sourcePage,setSourcePage]=useState(0);
    const [workflows,setWorkflows]=useState([]),[selected,setSelected]=useState(null),[query,setQuery]=useState('');
    const [editing,setEditing]=useState(false),[raw,setRaw]=useState(''),[dirty,setDirty]=useState(false),[validated,setValidated]=useState(null);
    const [values,setValues]=useState({}),[preview,setPreview]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('');
    const [extraction,setExtraction]=useState(null),[imports,setImports]=useState(null);
    const dialog=useRef(null),file=useRef(null),opLock=useRef(false),mounted=useRef(true);
    const current=Object.values(catalog.byId).find(row=>(row.retainedBy?.mainView??0)>0);
    const idle=!!current&&!current.running;
    const workspace=workspaceCatalog.items.find(w=>w.sessionIds.includes(current?.id));
    const sourceRows=(workspace?.sessionIds??[]).filter(id=>!workspaceCatalog.archivedSessionIds.includes(id)).map(id=>catalog.byId[id]).filter(row=>row&&row.origin!=='subagent');
    const sourceValid=!!loaded&&loaded.id===sourceId&&sourceRows.some(row=>row.id===sourceId);
    const workflow=workflows.find(w=>w.id===selected);
    useEffect(()=>()=>{mounted.current=false;},[]);
    function fail(err){if(mounted.current&&!lifetime.signal.aborted)setError(err instanceof Error?err.message:String(err));}
    async function perform(fn){if(opLock.current)return;opLock.current=true;setBusy(true);setError('');try{await fn();}catch(err){fail(err);}finally{opLock.current=false;if(mounted.current)setBusy(false);}}
    async function discard(){if(lifetime.signal.aborted||pendingConfirmation)return false;return !dirty||await confirmAction('有尚未保存的草稿，确定放弃？',{title:'放弃未保存的草稿？',confirmLabel:'确认放弃'});}
    async function requestClose(){if(!busy&&await discard()){setDirty(false);close();}}
    useEffect(()=>{if(shown)perform(async()=>setWorkflows(await api()));},[shown]);
    useEffect(()=>{
      if(!shown)return;
      const previous=document.activeElement;dialog.current?.focus();
      const key=async e=>{if(pendingConfirmation)return;if(e.key==='Escape'){e.preventDefault();await requestClose();return;}if(e.key==='Tab'){
        const nodes=[...dialog.current.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(n=>n.getClientRects().length);
        if(!nodes.length){e.preventDefault();return;}const first=nodes[0],last=nodes[nodes.length-1];
        if(e.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){e.preventDefault();last.focus();}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
      }};
      document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);if(previous?.isConnected)previous.focus();};
    },[shown,busy,dirty]);
    if(!shown)return null;
    const button=(label,onClick,disabled=false,primary=false)=>h('button',{type:'button',onClick,disabled:busy||disabled,className:primary?'wfl-primary':undefined},label);
    async function choose(w){if(!await discard())return;setPicking(false);setSelected(w.id);setEditing(false);setDirty(false);setPreview('');setImports(null);setValues(Object.fromEntries(w.parameters.map(p=>[p.name,p.defaultValue])));}
    function draft(w,id=null){setPicking(false);setSelected(id);setRaw(JSON.stringify(model.validateWorkflow(w),null,2));setValidated(model.validateWorkflow(w));setEditing(true);setDirty(true);setPreview('');setImports(null);}
    async function save(){const portable=model.validateWorkflow(JSON.parse(raw));const stored=workflow?{...portable,id:workflow.id}:portable;const next=await api({action:'save',workflow:stored,...workflow?{expectedRevision:workflow.revision}:{}});setWorkflows(next);setDirty(false);setEditing(false);setNotice('已保存工作流。');if(!workflow)setSelected(next.find(w=>!workflows.some(old=>old.id===w.id))?.id??null);setValues(Object.fromEntries(portable.parameters.map(p=>[p.name,p.defaultValue])));}
    async function remove(){if(!workflow||!await confirmAction(`确定删除「${workflow.name}」？此操作不可撤销。`,{title:'删除工作流？',confirmLabel:'确认删除'}))return;setWorkflows(await api({action:'delete',id:workflow.id,expectedRevision:workflow.revision}));setSelected(null);setEditing(false);setDirty(false);setPreview('');}
    function download(){const blob=new Blob([model.exportWorkflows(workflows)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='dsh-workflows.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
    async function readImport(event){const selectedFile=event.target.files?.[0];event.target.value='';if(!selectedFile)return;if(!await discard())return;await perform(async()=>{if(selectedFile.size>1000000)throw new Error('文件不能超过 1 MB');const parsed=model.parseImport(await selectedFile.text());setPicking(false);setImports(parsed);setEditing(false);setDirty(true);setPreview('');setNotice('导入内容仅作为数据展示；请检查后确认保存，不会自动执行。');});}
    async function loadSource(){
      if(!sourceRows.some(row=>row.id===sourceId))throw new Error('请选择当前工作区中的未归档普通对话');
      setLoaded(null);setChosen([]);setExcerpts({});setSourcePage(0);
      await ctx.sessions.using(sourceId,{source:'controllerOperation',signal:lifetime.signal},async ref=>{
        const binding=ref.binding;
        if(binding.session.getSnapshot().openState!=='open')throw new Error('来源对话尚未就绪，请稍后重试');
        let pages=0;
        while(binding.session.getSnapshot().hasMore){
          if(lifetime.signal.aborted)throw new Error('读取已取消');
          if(++pages>500)throw new Error('历史过长，未完整读取；请使用较短的对话');
          const before=binding.eventSource.getSnapshot().entries[0];
          await binding.session.loadOlder();
          if(binding.session.getSnapshot().hasMore&&binding.eventSource.getSnapshot().entries[0]===before)throw new Error('历史加载未推进，请稍后重新读取；不会用不完整历史提炼');
        }
        if(binding.session.getSnapshot().openState!=='open')throw new Error('历史读取中断，请重新读取');
        const messages=model.extractionMessages(binding.eventSource.getSnapshot().entries);
        setLoaded({id:sourceId,messages,title:catalog.byId[sourceId]?.displayTitle||sourceId});
        setNotice(`已读取 ${messages.length} 条可见文本消息。可整段提炼，或勾选消息并编辑其中的文本片段。工具输出、附件及内部推理不纳入材料；后续新增消息需重新读取。`);
      });
    }
    function extractionText(){if(!sourceValid)throw new Error('来源已变更，请重新读取当前工作区的对话');return model.buildExtractionPrompt(loaded.messages,scope==='all'?null:chosen,scope==='all'?{}:excerpts);}
    async function extract(){if(!await discard())return;const id=activeId(),text=extractionText();if(!await confirmAction(`将从「${loaded.title}」${scope==='all'?'全部可见文本':'所选内容'}提炼，发送到当前会话 ${id}，消耗模型额度。仅提交所选材料，但目标会话原有上下文仍存在；如需隔离请先打开空白会话。继续？`,{title:'发送提炼请求？',confirmLabel:'确认提炼（消耗额度）'}))return;
      await withIdle(id,async binding=>{const entries=binding.eventSource.getSnapshot().entries;const baseline=entries.reduce((max,e)=>e.type==='event'?Math.max(max,e.event.seq):max,0);const result=await binding.session.prompt([{type:'text',text}],'queue',lifetime.signal);if(!result.ok)throw new Error(result.error.message);setExtraction({id,baseline,sourceId:loaded.id});setNotice('提炼请求已发送。等待当前目标会话完成后，点击“读取提炼结果”；读取后必须审阅并保存。');});
    }
    async function readExtraction(){if(!extraction)return;if(!await discard())return;await withIdle(extraction.id,async binding=>{const entries=binding.eventSource.getSnapshot().entries;const candidates=entries.filter(e=>e.type==='event'&&e.event.seq>extraction.baseline&&e.event.type==='assistant/message'&&e.event.surfaceOp==='append'&&e.event.data.interrupted!==true);let found;for(const entry of candidates.slice().reverse()){const text=entry.event.data.message.content.filter(b=>b.type==='text').map(b=>b.text).join('');try{found=model.parseDraft(text);break;}catch{}}if(!found)throw new Error('尚未找到请求之后的有效工作流 JSON。请等待完成，或新建草稿并手动粘贴 JSON。');setPicking(false);draft({...found,sourceSessionId:extraction.sourceId||extraction.id});setNotice('已读取同一会话的新回复。请审阅参数、步骤和成功标准，再保存。');});}
    async function run(){if(!workflow||!preview)return;const id=activeId();const fresh=model.buildRunPrompt(workflow,values);if(fresh!==preview)throw new Error('参数已变更，请重新预览。');if(!await confirmAction(`将「${workflow.name}」提交到当前会话 ${id}。这是智能体按模板执行，并非精确重放。确认运行？`,{title:'运行工作流？',confirmLabel:'确认运行'}))return;await withIdle(id,async binding=>{const result=await binding.session.prompt([{type:'text',text:fresh}],'queue',lifetime.signal);if(!result.ok)throw new Error(result.error.message);setPreview('');setNotice('提示词已提交到当前会话；这表示接收成功，不表示任务已经完成。');});}
    const matching=workflows.filter(w=>(w.name+' '+w.description).toLowerCase().includes(query.toLowerCase()));
    const details=w=>h('section',null,h('h3',null,w.name),h('p',null,w.description),h('p',{className:'wfl-subtle'},`${w.parameters.length} 个参数 · ${w.steps.length} 个步骤`),w.steps.map((s,i)=>h('div',{className:'wfl-step',key:i},h('strong',null,`${i+1}. ${s.title}`),h('p',null,s.instruction),s.tool&&h('p',null,'工具提示：',s.tool),h('p',null,'验证：',s.validation||'未填写'),h('p',null,'失败处理：',s.onFailure||'未填写'))),h('h3',null,'成功标准'),h('p',null,w.successCriteria));
    let content;
    if(picking)content=h('section',null,h('h3',null,'从工作区对话提炼'),h('p',{className:'wfl-subtle'},'只列出当前工作区的未归档普通对话。读取会通过宿主打开历史，可能激活会话，但不发送提炼请求。提炼提交到下方显示的当前目标会话。'),h('label',null,'搜索来源对话',h('input',{value:sourceQuery,disabled:busy,onChange:e=>setSourceQuery(e.target.value)})),h('label',null,'来源对话',h('select',{value:sourceId,disabled:busy,onChange:e=>{setSourceId(e.target.value);setLoaded(null);setChosen([]);setExcerpts({});setPreview('');}},h('option',{value:''},'请选择对话'),sourceRows.filter(r=>((r.displayTitle||r.title||'')+' '+r.id).toLowerCase().includes(sourceQuery.toLowerCase())||r.id===sourceId).map(r=>h('option',{key:r.id,value:r.id},`${r.displayTitle||r.title||r.id}${r.id===current?.id?'（当前）':''}`)))),h('div',{className:'wfl-actions'},button('读取对话',()=>perform(loadSource),!sourceId),button('返回工作流',()=>{setPicking(false);setPreview('');})),sourceValid&&h('section',null,h('p',null,`已读取 ${loaded.messages.length} 条文本消息`),h('label',null,'提炼范围',h('select',{value:scope,disabled:busy,onChange:e=>{setScope(e.target.value);setPreview('');}},h('option',{value:'all'},'整段对话：全部可见文本消息'),h('option',{value:'selected'},'部分内容：勾选消息 / 编辑文本片段'))),scope==='selected'&&h('div',null,h('div',{className:'wfl-actions'},button('全选消息',()=>{setChosen(loaded.messages.map(m=>m.id));setPreview('');}),button('清空选择',()=>{setChosen([]);setPreview('');})),h('p',null,`已选 ${chosen.length} 条；选中后可删除无关段落，仅保留需要提炼的文本。`)),loaded.messages.slice(sourcePage*20,sourcePage*20+20).map(m=>h('div',{key:m.id,className:'wfl-step'},h('label',null,scope==='selected'&&h('input',{type:'checkbox',style:{width:'auto',marginRight:8},checked:chosen.includes(m.id),disabled:busy,onChange:e=>{setChosen(prev=>e.target.checked?[...prev,m.id]:prev.filter(id=>id!==m.id));setPreview('');}}),`${m.role==='user'?'用户':'助手'} · #${m.id}`),scope==='selected'&&chosen.includes(m.id)?h('textarea',{'aria-label':`消息 ${m.id} 的提炼片段`,value:excerpts[m.id]??m.text,disabled:busy,onChange:e=>{setExcerpts(prev=>({...prev,[m.id]:e.target.value}));setPreview('');}}):h('pre',{className:'wfl-preview',tabIndex:0},m.text))),h('div',{className:'wfl-actions'},button('上一页',()=>setSourcePage(p=>p-1),sourcePage===0),h('span',null,`${sourcePage+1} / ${Math.max(1,Math.ceil(loaded.messages.length/20))}`),button('下一页',()=>setSourcePage(p=>p+1),(sourcePage+1)*20>=loaded.messages.length)),h('div',{className:'wfl-actions'},button('预览提炼材料',()=>{try{setPreview(extractionText());setError('');}catch(e){fail(e);}}),button('确认提炼生成（消耗额度）',()=>perform(extract),!idle||!loaded.messages.length||(scope==='selected'&&!chosen.length),true)),preview&&h('pre',{className:'wfl-preview',tabIndex:0},preview)));
    else if(imports)content=h('section',null,h('h3',null,`导入预览：${imports.length} 个工作流`),h('p',null,'请检查下方完整内容。确认保存只写入工作流库，不运行任何步骤。'),h('pre',{className:'wfl-preview',tabIndex:0},model.exportWorkflows(imports)),h('div',{className:'wfl-actions'},button('确认导入',()=>perform(async()=>{setWorkflows(await api({action:'import',workflows:imports}));setImports(null);setDirty(false);setNotice('导入完成，尚未执行。');}),!imports.length,true),button('取消导入',()=>{setImports(null);setDirty(false);}))) ;
    else if(editing)content=h('section',null,h('h3',null,workflow?'编辑工作流':'新工作流草稿'),h('p',{className:'wfl-subtle'},'JSON 仅作为数据处理。参数使用 {{parameter_name}}；请删除凭据和个人信息。'),h('div',{className:'wfl-editor-grid'},h('label',null,'工作流 JSON',h('textarea',{value:raw,disabled:busy,onChange:e=>{setRaw(e.target.value);setDirty(true);setValidated(null);},spellCheck:false,'aria-label':'工作流 JSON 编辑器',style:{minHeight:420}})),validated?details(validated):h('p',null,'修改后点击“校验并预览”查看结构化步骤。')),h('div',{className:'wfl-actions'},button('校验并预览',()=>{try{const parsed=model.parseDraft(raw);setValidated(parsed);setRaw(JSON.stringify(parsed,null,2));setError('');}catch(e){fail(e);}}),button('保存工作流',()=>perform(save),false,true),button('取消编辑',async()=>{if(await discard()){setEditing(false);setDirty(false);}})));
    else if(workflow)content=h('section',null,h('div',{className:'wfl-actions'},button('编辑',()=>draft(workflow,workflow.id)),button('删除',()=>perform(remove))),details(workflow),h('hr'),h('h3',null,'本次运行参数'),workflow.parameters.map(p=>h('label',{key:p.name},p.label+(p.required?' *':''),h('input',{value:values[p.name]??p.defaultValue,disabled:busy,maxLength:4000,onChange:e=>{setValues({...values,[p.name]:e.target.value});setPreview('');}}))),h('div',{className:'wfl-actions'},button('生成提示词预览',()=>{try{setPreview(model.buildRunPrompt(workflow,values));setError('');}catch(e){fail(e);}},false,true)),preview&&h('section',null,h('h3',null,'提交前预览'),h('pre',{className:'wfl-preview',tabIndex:0},preview),button('确认运行到当前空闲会话',()=>perform(run),!idle,true)));
    else content=h('section',null,h('h3',null,'把成功任务变成可复用模板'),h('p',null,'从左侧选择工作流，或提炼当前会话中已完成且验证成功的任务。'),h('p',null,'提炼会消耗模型额度；工作流保存的是可观察的步骤与验证标准，不保存内部思维链。运行时由智能体按模板执行，不是历史工具调用的精确重放。'),h('p',null,'导入和生成内容都需要审阅；每次执行仍受当前技能、工具与权限限制。'));
    return h('div',{className:'wfl-overlay'},h('div',{className:'wfl-dialog',role:'dialog','aria-modal':true,'aria-labelledby':'wfl-title',tabIndex:-1,ref:dialog},h('header',null,h('div',null,h('h2',{id:'wfl-title'},'工作流库'),h('span',{className:'wfl-subtle'},'提炼 · 审阅 · 参数化 · 再执行')),button('关闭',requestClose)),error&&h('div',{className:'wfl-notice wfl-error',role:'alert'},error),notice&&h('div',{className:'wfl-notice',role:'status'},notice),h('div',{className:'wfl-body'},h('aside',{className:'wfl-list','aria-label':'工作流列表'},h('label',null,'搜索工作流',h('input',{value:query,onChange:e=>setQuery(e.target.value),placeholder:'名称或描述'})),h('div',{className:'wfl-actions'},button('新建',async()=>{if(await discard())draft(EMPTY);}),button('导入',()=>file.current.click()),button('导出全部',download,!workflows.length)),h('input',{ref:file,type:'file',accept:'.json,application/json',hidden:true,onChange:readImport}),matching.map(w=>h('button',{type:'button',className:'wfl-card',key:w.id,disabled:busy,'aria-current':w.id===selected,onClick:async()=>{await choose(w);}},h('strong',null,w.name),h('div',{className:'wfl-subtle'},`${w.steps.length} 步 · v${w.revision}`))),!matching.length&&h('p',{className:'wfl-subtle'},'没有匹配的工作流。')),h('main',{className:'wfl-detail'},h('div',{className:'wfl-actions'},button('选择对话 / 内容提炼',async()=>{if(!await discard())return;setDirty(false);setPicking(true);setSourceId(current?.id||'');setLoaded(null);setChosen([]);setExcerpts({});setPreview('');},!workspace),button('读取提炼结果',()=>perform(readExtraction),!extraction||!idle||current?.id!==extraction.id)),content)),h('footer',{className:'wfl-status'},busy?'正在处理，请稍候…':current?`当前目标：${current.displayTitle||current.title||current.id} · ${idle?'空闲（提交时再次检查）':'运行中，不可提交'}`:'无当前会话：请先打开普通会话，再使用提炼或运行。',dirty?' · 有未保存草稿':'')));
  }
  ctx.slots.inject('sidebar.footer.action',()=>ctx.slots.register({name:'sidebar.footer.action',id:PANEL,order:25},Launcher));
  ctx.slots.inject('shell.overlay',()=>ctx.slots.register({name:'shell.overlay',id:PANEL},App));
};
