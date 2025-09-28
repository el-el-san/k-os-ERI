// テーマ（黒/白）切替
const themeDarkBtn = document.getElementById('themeDark');
const themeLightBtn = document.getElementById('themeLight');
function applyTheme(theme) {
  const mode = theme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', mode);
  localStorage.setItem('theme', mode);
  themeDarkBtn.classList.toggle('active', mode === 'dark');
  themeLightBtn.classList.toggle('active', mode === 'light');
}
const savedTheme = localStorage.getItem('theme');
const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
applyTheme(savedTheme || (prefersLight ? 'light' : 'dark'));
themeDarkBtn.addEventListener('click', () => applyTheme('dark'));
themeLightBtn.addEventListener('click', () => applyTheme('light'));

// 目次（TOC）動的生成 + スクロール
function buildToc(){
  const tocList = document.getElementById('tocList');
  if (!tocList) return [];
  tocList.innerHTML = '';
  const sections = Array.from(document.querySelectorAll('.doc-section'))
    // ダッシュボードの配下セクションはTOCから除外（重複回避）
    .filter(sec => sec.id !== 'saas-applications-overview')
    // 特定の要件定義書は 2-1 の配下にサブ項目として表示するため、トップレベルからは除外
    .filter(sec => !['requirements-kamui-os','requirements-kamui-os-npm','requirements-sns-marketing','requirements-neko-cafe'].includes(sec.id));
  const groups = new Map(); // catValue -> { name, items: [{id,title}] }
  // ダッシュボードカテゴリを追加
  groups.set(1, { name: 'ダッシュボード', items: [] });
  sections.forEach(sec => {
    const catVal = Number(sec.dataset.cat || '0');
    const catName = sec.dataset.catName || 'その他';
    const id = sec.id ? `#${sec.id}` : '';
    const h2 = sec.querySelector('h2');
    const isPrivate = sec.dataset.isPrivate === 'true';
    let title = h2 ? (h2.innerText || h2.textContent || id) : id;
    title = title.replace(/^\s*\d+[.\-]\s*/, '');
    // private_ファイルの場合は鍵アイコンを追加（既にHTMLで追加されている場合は重複を避ける）
    if (isPrivate && !title.includes('🔒')) {
      title = `🔒 ${title}`;
    }
    // ダッシュボード項目は除外
    if (id === '#saas-applications-overview') return;
    // 章1（ダッシュボード）配下の項目もTOCに含める
    // if (catVal === 1) return;
    if (!groups.has(catVal)) groups.set(catVal, { name: catName, items: [] });
    // 重複IDを除外
    const grp = groups.get(catVal);
    if (!grp.items.some(it => it.id === id)) {
      grp.items.push({ id, title });
    }
  });
  // 章1に「メインダッシュボード」を先頭として明示追加
  if (groups.has(1)) {
    const g1 = groups.get(1);
    if (!g1.items.some(it => it.id === '#saas-applications-overview')) {
      g1.items.unshift({ id: '#saas-applications-overview', title: 'メインダッシュボード' });
    }
  }
  const sortedCats = Array.from(groups.keys()).sort((a,b)=>a-b);
  sortedCats.forEach((catValue, catIdx) => {
    const cat = groups.get(catValue);
    // 章名の補正: 1は常に「ダッシュボード」にする
    const catNo = catIdx + 1;
    const catItem = document.createElement('div');
    catItem.className = 'tree-item';
    const catLabel = document.createElement('div');
    catLabel.className = 'tree-label category';
    const toggle = document.createElement('span');
    toggle.className = 'tree-toggle';
    toggle.textContent = '▶';
    const name = document.createElement('span');
    name.className = 'tree-name';
    name.textContent = `${catNo}. ${cat.name}`;
    catLabel.appendChild(toggle);
    catLabel.appendChild(name);
    const children = document.createElement('div');
    children.className = 'tree-children';
    cat.items.forEach((it, i) => {
      const item = document.createElement('div');
      item.className = 'tree-item';
      const label = document.createElement('div');
      label.className = 'tree-label';
      label.setAttribute('data-target', it.id);
      const nm = document.createElement('span');
      nm.className = 'tree-name';
      nm.textContent = `${catNo}-${i+1}. ${it.title}`;
      label.appendChild(nm);
      item.appendChild(label);
      children.appendChild(item);

      // 特別: 2-1 要件定義書の配下にサブ項目（KAMUI CODE/KAMUI OS）を追加
      if (it.id === '#requirements-document') {
        const sub = document.createElement('div');
        sub.className = 'tree-children';
        const subItems = [
          { id: '#requirements-document',        title: 'KAMUI CODE 要件定義書',            openBody: true },
          { id: '#requirements-kamui-os',       title: 'KAMUI OS 要件定義書',              openBody: true },
          { id: '#requirements-kamui-os-npm',   title: 'KAMUI OS NPM 要件定義書',          openBody: true },
          { id: '#requirements-sns-marketing',  title: 'SNSマーケティング ダッシュボード要件', openBody: true },
          { id: '#requirements-neko-cafe',      title: 'ネコカフェ 要件定義書',              openBody: true }
        ];
        // 折りたたみトグル（2-1 の子を開閉）
        const subToggle = document.createElement('span');
        subToggle.className = 'tree-toggle';
        subToggle.textContent = '▶';
        // ラベル先頭にトグルを差し込む
        label.insertBefore(subToggle, label.firstChild);
        subToggle.addEventListener('click', (e) => {
          e.stopPropagation();
          sub.classList.toggle('expanded');
          subToggle.classList.toggle('expanded');
          subToggle.textContent = sub.classList.contains('expanded') ? '▼' : '▶';
        });
        subItems.forEach((sit, si) => {
          const sItem = document.createElement('div');
          sItem.className = 'tree-item';
          const sLabel = document.createElement('div');
          sLabel.className = 'tree-label';
          sLabel.setAttribute('data-target', sit.id);
          sLabel.setAttribute('data-open-body', sit.openBody ? 'true' : 'false');
          const sName = document.createElement('span');
          sName.className = 'tree-name';
          sName.textContent = `${catNo}-${i+1}-${si+1}. ${sit.title}`;
          sLabel.appendChild(sName);
          sItem.appendChild(sLabel);
          sub.appendChild(sItem);
        });
        item.appendChild(sub);
      }
    });
    // カテゴリラベルのトグル処理はビルド後に一括で付与（重複防止）
    catItem.appendChild(catLabel);
    catItem.appendChild(children);
    tocList.appendChild(catItem);
  });
  // ダッシュボードカテゴリにも子要素を表示する
  // const firstCat = tocList.querySelector('.tree-label.category');
  // if (firstCat && firstCat.nextElementSibling) {
  //   firstCat.nextElementSibling.innerHTML = '';
  // }
  return Array.from(tocList.querySelectorAll('.tree-label[data-target]'));
}

// 本文を目次の順番に並べ替え、見出しを X-Y に採番
function reorderBodySectionsToMatchToc(){
  const container = document.getElementById('docContainer');
  if (!container) return [];
  const secNodes = new Map();
  document.querySelectorAll('.doc-section').forEach(sec => {
    if (sec.id) secNodes.set(`#${sec.id}`, sec);
  });
  const orderedIds = [];
  const seen = new Set();
  document.querySelectorAll('#tocList .tree-label[data-target]').forEach(l => {
    const id = l.getAttribute('data-target');
    if (id && !seen.has(id)) { seen.add(id); orderedIds.push(id); }
  });
  const frag = document.createDocumentFragment();
  // 先頭にダッシュボードを固定配置
  const dash = secNodes.get('#saas-applications-overview');
  if (dash) frag.appendChild(dash);
  orderedIds.forEach(id => {
    const node = secNodes.get(id);
    if (node) frag.appendChild(node);
  });
  container.appendChild(frag);
  return orderedIds;
}

function renumberBodyHeadingsByOrder(orderedIds){
  const secById = new Map();
  document.querySelectorAll('.doc-section').forEach(sec => {
    if (sec.id) secById.set(`#${sec.id}`, sec);
  });
  const catOrder = new Map();
  const catCounters = new Map();
  let catNoSeq = 0;
  orderedIds.forEach(id => {
    const sec = secById.get(id);
    if (!sec) return;
    const catVal = String(sec.dataset.cat || '0');
    if (!catOrder.has(catVal)) {
      catOrder.set(catVal, ++catNoSeq);
      catCounters.set(catVal, 0);
    }
    const h2 = sec.querySelector('h2');
    if (!h2) return;
    const raw = h2.innerText || h2.textContent || '';
    const base = raw.replace(/^\s*\d+[.\-]\s*/, '');
    const x = catOrder.get(catVal);
    const y = (catCounters.get(catVal) || 0) + 1;
    catCounters.set(catVal, y);
    h2.textContent = `${x}-${y}. ${base}`;
  });
}

const tocRoot = document.getElementById('folderTree');
// TOCを構築 → 本文をTOC順に並べ替え → 見出し採番
let itemLabels = buildToc();
const orderedIds = reorderBodySectionsToMatchToc();
renumberBodyHeadingsByOrder(orderedIds);
const sectionCount = document.getElementById('sectionCount');
sectionCount.textContent = itemLabels.length;

// クリックで本文へスクロール（項目のみ）
itemLabels.forEach(l => {
  l.addEventListener('click', (e) => {
    e.stopPropagation();
    const target = l.getAttribute('data-target');
    const openBody = l.getAttribute('data-open-body') === 'true';
    if (target) {
      // 擬似遷移: すべて非表示にして対象のみ表示 + URLハッシュ更新
      if (target.startsWith('#saas-')) {
        const appId = target.replace('#saas-', '');
        if (window.showSaasApp) {
          window.showSaasApp(appId);
        }
        return;
      } else if (target.startsWith('#requirements-')) {
        // 要件定義書の場合も特別処理
        const docId = target.replace('#requirements-', '');
        if (window.showRequirements) {
          window.showRequirements(docId);
          if (openBody) {
            setTimeout(() => {
              const secId = 'requirements-' + docId; // 'document' or 'kamui-os'
              const card = document.getElementById('requirementsDocCard-' + secId);
              const body = document.getElementById('requirementsDocBody-' + secId);
              if (card && body) { card.style.display = 'none'; body.style.display = 'block'; window.scrollTo(0, 0); }
            }, 0);
          }
        }
        return;
      } else if (target === '#biz-strategy' || target === '#biz-finance' || target === '#prompts-repo') {
        if (window.showSectionById) {
          window.showSectionById(target.substring(1));
          return;
        }
      } else if (target === '#ui-views') {
        // UIビュー一覧の場合も特別処理
        if (window.showRequirements) {
          window.showRequirements('views');
        }
        return;
      } else if (target === '#slide-generator') {
        // スライドエディタの場合も特別処理
        if (window.showBusinessTool) {
          window.showBusinessTool('slide-generator');
        }
        return;
      } else {
        // 通常のセクションへのスクロール
        const node = document.querySelector(target);
        if (node) {
          document.querySelectorAll('.doc-section').forEach(section => { section.style.display = 'none'; });
          node.style.display = 'block';
          window.history.pushState({ direct: target.substring(1) }, '', target);
          window.scrollTo(0, 0);
        }
      }
      // モバイル時はサイドバーを閉じる
      if (window.matchMedia('(max-width: 768px)').matches) {
        const sb = document.getElementById('sidebar');
        const bd = document.getElementById('sidebarBackdrop');
        sb?.classList.remove('open');
        bd?.classList.remove('show');
      }
    }
  });
});

// 大分類の展開/折りたたみ
tocRoot.querySelectorAll('.tree-label.category').forEach(cat => {
  const toggle = cat.querySelector('.tree-toggle');
  const children = cat.nextElementSibling;
  cat.addEventListener('click', (e) => {
    e.stopPropagation();
    if (children) children.classList.toggle('expanded');
    if (toggle) {
      toggle.classList.toggle('expanded');
      toggle.textContent = children && children.classList.contains('expanded') ? '▼' : '▶';
    }
    cat.classList.toggle('selected');
  });
});

// ルートの折りたたみ
const root = document.querySelector('[data-toggle="root"]');
const rootChildren = document.querySelector('.tree-children');
const rootToggle = root.querySelector('.tree-toggle');
root.addEventListener('click', () => {
  rootChildren.classList.toggle('expanded');
  rootToggle.classList.toggle('expanded');
  rootToggle.textContent = rootChildren.classList.contains('expanded') ? '▼' : '▶';
  root.classList.toggle('selected');
});

// クイックリンク
document.querySelectorAll('.tag').forEach(tag => {
  tag.addEventListener('click', () => {
    const sel = tag.getAttribute('data-jump');
    if (!sel) return;
    
    // SaaSアプリケーションの場合は特別処理
    if (sel.startsWith('#saas-')) {
      const appId = sel.replace('#saas-', '');
      if (window.showSaasApp) {
        window.showSaasApp(appId);
      }
      return;
    } else if (sel.startsWith('#requirements-')) {
      // 要件定義書の場合も特別処理
      const docId = sel.replace('#requirements-', '');
      if (window.showRequirements) {
        window.showRequirements(docId);
      }
      return;
    } else if (sel === '#biz-strategy' || sel === '#biz-finance' || sel === '#prompts-repo') {
      if (window.showSectionById) { window.showSectionById(sel.substring(1)); }
      return;
    } else if (sel === '#ui-views') {
      // UIビュー一覧の場合も特別処理
      if (window.showRequirements) {
        window.showRequirements('views');
      }
      return;
    } else if (sel === '#slide-generator') {
      // スライドエディタの場合も特別処理
      if (window.showBusinessTool) {
        window.showBusinessTool('slide-generator');
      }
      return;
    } else {
      // 通常セクションの擬似遷移
      const node = document.querySelector(sel);
      if (node) {
        document.querySelectorAll('.doc-section').forEach(section => { section.style.display = 'none'; });
        node.style.display = 'block';
        window.history.pushState({ direct: sel.substring(1) }, '', sel);
        window.scrollTo(0, 0);
      }
    }
    
    document.querySelectorAll('.tag').forEach(t => t.classList.remove('active'));
    tag.classList.add('active');
  });
});

// サイドバー開閉（モバイル + デスクトップ）
const sidebar = document.getElementById('sidebar');
const backdrop = document.getElementById('sidebarBackdrop');
const toggleBtn = document.getElementById('toggleSidebar');
function closeSidebar(){ sidebar?.classList.remove('open'); backdrop?.classList.remove('show'); }
function openSidebar(){ sidebar?.classList.add('open'); backdrop?.classList.add('show'); }
toggleBtn?.addEventListener('click', () => {
  if (!sidebar) return;
  const isMobile = window.matchMedia('(max-width: 768px)').matches;
  if (isMobile) {
    // 従来どおりオーバーレイ付きのスライド開閉
    sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
  } else {
    // デスクトップではサイドバー自体を折りたたみ（非表示）
    const collapsed = sidebar.classList.toggle('collapsed');
    if (collapsed) {
      // 念のためモバイル用の状態も解除
      closeSidebar();
    }
  }
});
backdrop?.addEventListener('click', closeSidebar);

// ユーティリティ関数
function escapeHtml(s){ return String(s||'').replace(/[&<>"]/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[m])); }
function escapeAttr(s){ return String(s||'').replace(/["<>\n\r]/g,''); }

// 検索（タイトルと本文中テキストを対象）
const searchInput = document.getElementById('searchInput');
// 単純な部分一致での強調（正規表現は使わず安全に）
function highlightTextNode(node, q){
  const text = node.nodeValue || '';
  const query = q.toLowerCase();
  const lower = text.toLowerCase();
  let pos = 0;
  let idx = lower.indexOf(query, pos);
  if (idx === -1) return;
  const frag = document.createDocumentFragment();
  while (idx !== -1){
    const before = text.slice(pos, idx);
    if (before) frag.appendChild(document.createTextNode(before));
    const mark = document.createElement('mark');
    mark.className = 'hl';
    mark.textContent = text.slice(idx, idx + q.length);
    frag.appendChild(mark);
    pos = idx + q.length;
    idx = lower.indexOf(query, pos);
  }
  const after = text.slice(pos);
  if (after) frag.appendChild(document.createTextNode(after));
  node.parentNode && node.parentNode.replaceChild(frag, node);
}
function clearHighlights(root){
  root.querySelectorAll('mark.hl').forEach(m => {
    const text = document.createTextNode(m.textContent || '');
    m.parentNode && m.parentNode.replaceChild(text, m);
  });
}
function highlightInElements(elements, q){
  if (!q) return;
  elements.forEach(el => {
    clearHighlights(el);
    el.childNodes.forEach(node => {
      if (node.nodeType === Node.TEXT_NODE && node.nodeValue){
        highlightTextNode(node, q);
      }
    });
  });
}

// モーダル関数
function openJsonModal(content, title){
  const modal = document.getElementById('jsonModal');
  const pre = document.getElementById('jsonContent');
  const ttl = document.getElementById('jsonModalTitle');
  const closeBtn = document.getElementById('jsonCloseBtn');
  const copyBtn = document.getElementById('jsonCopyBtn');
  if (!modal || !pre || !ttl) return;
  pre.textContent = content;
  ttl.textContent = title || 'JSONプレビュー';
  modal.classList.add('active');
  closeBtn?.addEventListener('click', () => modal.classList.remove('active'), { once: true });
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('active'); }, { once: true });
  copyBtn?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(content); alert('クリップボードにコピーしました。'); } catch(e) { alert('コピーできませんでした。'); }
  }, { once: true });
}

function openImgModal(src, title){
  const modal = document.getElementById('imgModal');
  const img = document.getElementById('imgModalImage');
  const ttl = document.getElementById('imgModalTitle');
  const closeBtn = document.getElementById('imgCloseBtn');
  if (!modal || !img || !ttl) return;
  img.setAttribute('src', src);
  ttl.textContent = title || '画像プレビュー';
  modal.classList.add('active');
  closeBtn?.addEventListener('click', () => modal.classList.remove('active'), { once: true });
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('active'); }, { once: true });
}

// グローバルに公開
window.openJsonModal = openJsonModal;
window.openImgModal = openImgModal;

// 要素情報の収集（簡易 Inspector）
function cssPath(el){
  if (!el || el.nodeType !== 1) return '';
  if (el.id) return `#${el.id}`;
  const parts = [];
  let node = el;
  while (node && node.nodeType === 1 && node !== document.body){
    let sel = node.nodeName.toLowerCase();
    if (node.classList && node.classList.length){
      const c = Array.from(node.classList).slice(0,3).join('.');
      if (c) sel += `.${c}`;
    }
    const parent = node.parentElement;
    if (parent){
      const siblings = Array.from(parent.children).filter(n => n.nodeName === node.nodeName);
      if (siblings.length > 1){
        const idx = siblings.indexOf(node) + 1;
        sel += `:nth-of-type(${idx})`;
      }
    }
    parts.unshift(sel);
    node = node.parentElement;
  }
  return parts.join(' > ');
}

function pickAttrs(el){
  const obj = {};
  if (!el || !el.attributes) return obj;
  Array.from(el.attributes).forEach(a => { obj[a.name] = a.value; });
  return obj;
}

function nearestSection(el){
  const sec = el.closest('.doc-section');
  if (!sec) return null;
  const h2 = sec.querySelector('h2');
  return { id: sec.id || '', category: sec.dataset.cat || '', category_name: sec.dataset.catName || '', title: h2 ? (h2.innerText||'').trim() : '' };
}

function collectElementInfo(el){
  const rect = el.getBoundingClientRect();
  const styles = window.getComputedStyle(el);
  const styleKeys = ['display','position','zIndex','color','backgroundColor','fontSize','fontWeight','margin','padding','border','borderRadius'];
  const styleObj = {};
  styleKeys.forEach(k => { styleObj[k] = styles[k]; });
  const info = {
    page: { url: location.href, title: document.title, hash: location.hash },
    section: nearestSection(el),
    selector: cssPath(el),
    element: {
      tag: el.tagName.toLowerCase(),
      id: el.id || '',
      classes: Array.from(el.classList||[]),
      attributes: pickAttrs(el),
      dataset: { ...el.dataset },
      text: (el.textContent||'').trim().slice(0, 240)
    },
    box: {
      width: Math.round(rect.width), height: Math.round(rect.height),
      top: Math.round(rect.top + window.scrollY), left: Math.round(rect.left + window.scrollX)
    },
    computed: styleObj,
    time: new Date().toISOString()
  };
  return info;
}

// Alt(Option) + 右クリックで要素情報を取得
document.addEventListener('contextmenu', (e) => {
  try {
    // DevTools ON のときだけ発火
    if (!window.__devToolsActive) return; // 通常のコンテキストメニューを維持
    // 右クリックで発火（特定ターゲットのみ）
    const target = e.target.closest('.saas-app-card, .card, .tree-label, .req-section, .doc-section, [data-path], [class]');
    if (!target) return; // 対象外は通常のコンテキストメニュー
    e.preventDefault();
    // 一時ハイライト
    const prevOutline = target.style.outline;
    const prevOffset = target.style.outlineOffset;
    target.style.outline = '2px solid #4a9eff';
    target.style.outlineOffset = '2px';
    setTimeout(() => { target.style.outline = prevOutline; target.style.outlineOffset = prevOffset; }, 1200);
    const json = JSON.stringify(collectElementInfo(target), null, 2);
    openJsonModal(json, 'Inspector');
    // 自動コピー
    (async () => {
      try {
        await navigator.clipboard.writeText(json);
        const btn = document.getElementById('jsonCopyBtn');
        if (btn) {
          const org = btn.textContent;
          btn.textContent = 'コピー済み';
          setTimeout(() => { btn.textContent = org || 'コピー'; }, 1500);
        }
      } catch(err) {
        try {
          const ta = document.createElement('textarea');
          ta.value = json; document.body.appendChild(ta); ta.select();
          document.execCommand('copy'); document.body.removeChild(ta);
        } catch(e) { console.warn('Auto-copy failed'); }
      }
    })();
  } catch(err) { console.error('Inspector failed', err); }
});

// DevTools hover-inspector (button toggle)
(function(){
  const btn = document.getElementById('devToolsBtn');
  if (!btn) return;
  let active = false;
  let overlay, tip;
  function ensureNodes(){
    if (!overlay){ overlay = document.createElement('div'); overlay.className = 'inspect-overlay'; overlay.style.display='none'; document.body.appendChild(overlay); }
    if (!tip){ tip = document.createElement('div'); tip.className = 'inspect-tip'; tip.style.display='none'; document.body.appendChild(tip); }
  }
  function fmtSel(el){
    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : '';
    const cls = el.classList?.length ? '.'+Array.from(el.classList).slice(0,2).join('.') : '';
    return `${tag}${id}${cls}`;
  }
  function moveOverlay(target, x, y){
    const rect = target.getBoundingClientRect();
    overlay.style.display = 'block';
    overlay.style.left = `${rect.left + window.scrollX}px`;
    overlay.style.top = `${rect.top + window.scrollY}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
    tip.style.display = 'block';
    const comp = window.getComputedStyle(target);
    const color = comp.color; const font = comp.font; const margin = comp.margin;
    tip.innerHTML = `
      <span class="t-path">${fmtSel(target)} <span class="t-mono">${rect.width.toFixed(0)}×${rect.height.toFixed(0)}</span></span>
      <div>Color <span class="t-mono">${color}</span></div>
      <div>Font <span class="t-mono">${font}</span></div>
      <div>Margin <span class="t-mono">${margin}</span></div>
    `;
    const tipW = Math.min(360, Math.max(220, tip.offsetWidth||240));
    let tx = x + 12, ty = y + 12;
    if (tx + tipW > window.innerWidth - 20) tx = x - tipW - 12;
    if (ty + 140 > window.innerHeight - 10) ty = y - 150;
    tip.style.left = `${Math.max(10, tx)}px`;
    tip.style.top = `${Math.max(10, ty)}px`;
  }
  function openInfo(target){
    const json = JSON.stringify(collectElementInfo(target), null, 2);
    openJsonModal(json, 'Inspector');
    (async()=>{ try{ await navigator.clipboard.writeText(json);}catch(_){}})();
  }
  function onMove(e){
    const node = document.elementFromPoint(e.clientX, e.clientY);
    if (!node || node === overlay || tip.contains(node)) return;
    const target = node.closest('body *');
    if (!target) return;
    moveOverlay(target, e.clientX, e.clientY);
  }
  function onClick(e){
    e.preventDefault(); e.stopPropagation();
    const node = document.elementFromPoint(e.clientX, e.clientY);
    if (!node || node === overlay || tip.contains(node)) return;
    const target = node.closest('body *');
    if (!target) return;
    openInfo(target);
  }
  function enable(){ ensureNodes(); active = true; window.__devToolsActive = true; document.body.classList.add('inspect-active'); overlay.style.display='block'; tip.style.display='block'; btn.textContent = 'DevTools: ON'; document.addEventListener('mousemove', onMove, true); document.addEventListener('click', onClick, true); }
  function disable(){ active = false; window.__devToolsActive = false; document.body.classList.remove('inspect-active'); if (overlay) overlay.style.display='none'; if (tip) tip.style.display='none'; btn.textContent = 'DevTools'; document.removeEventListener('mousemove', onMove, true); document.removeEventListener('click', onClick, true); }
  btn.addEventListener('click', () => { active ? disable() : enable(); });
  document.addEventListener('keydown', (e) => { if (active && e.key === 'Escape') disable(); });
})();

// UI遷移図の初期化
function initUIFlow() {
  const nodes = [
    { id: 'welcome', x: 100, y: 100, title: 'Welcome画面', img: '/images/kamui-white-1.png' },
    { id: 'catalog', x: 400, y: 100, title: 'Catalogページ', img: '/images/kamui-white-2.png' },
    { id: 'playlist', x: 700, y: 100, title: 'Playlistページ', img: '/images/kamui-white-3.png' },
    { id: 'docs', x: 400, y: 300, title: 'Document画面', img: '/images/kamui-white-4.png' },
    { id: 'api', x: 700, y: 300, title: 'API実行画面', img: '/images/kamui-white-5.png' }
  ];
  
  const edges = [
    { from: 'welcome', to: 'catalog', label: 'Catalog選択' },
    { from: 'welcome', to: 'playlist', label: 'Playlist選択' },
    { from: 'catalog', to: 'docs', label: 'ドキュメント参照' },
    { from: 'playlist', to: 'api', label: 'API実行' },
    { from: 'docs', to: 'api', label: 'Try it' }
  ];
  
  const flowNodes = document.getElementById('flowNodes');
  const flowSvg = document.getElementById('flowSvg');
  const flowInner = document.getElementById('flowInner');
  const flowViewport = document.getElementById('flowViewport');
  
  if (!flowNodes || !flowSvg) return;
  
  // ノードを配置
  nodes.forEach(node => {
    const div = document.createElement('div');
    div.className = 'flow-node';
    div.id = `node-${node.id}`;
    div.style.left = `${node.x}px`;
    div.style.top = `${node.y}px`;
    div.innerHTML = `
      <img src="${node.img}" alt="${node.title}">
      <div class="title">${node.title}</div>
    `;
    flowNodes.appendChild(div);
  });
  
  // エッジ（矢印）を描画
  const svgNS = 'http://www.w3.org/2000/svg';
  edges.forEach((edge, i) => {
    const fromNode = nodes.find(n => n.id === edge.from);
    const toNode = nodes.find(n => n.id === edge.to);
    if (!fromNode || !toNode) return;
    
    const x1 = fromNode.x + 110;
    const y1 = fromNode.y + 90;
    const x2 = toNode.x + 110;
    const y2 = toNode.y + 90;
    
    const path = document.createElementNS(svgNS, 'path');
    const d = `M ${x1} ${y1} L ${x2} ${y2}`;
    path.setAttribute('d', d);
    path.setAttribute('stroke', '#4a9eff');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('fill', 'none');
    path.setAttribute('marker-end', 'url(#arrowhead)');
    flowSvg.appendChild(path);
    
    // ラベル
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    const text = document.createElementNS(svgNS, 'text');
    text.setAttribute('x', midX);
    text.setAttribute('y', midY - 5);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('class', 'flow-label');
    text.textContent = edge.label;
    flowSvg.appendChild(text);
  });
  
  // 矢印マーカー定義
  const defs = document.createElementNS(svgNS, 'defs');
  const marker = document.createElementNS(svgNS, 'marker');
  marker.setAttribute('id', 'arrowhead');
  marker.setAttribute('markerWidth', '10');
  marker.setAttribute('markerHeight', '7');
  marker.setAttribute('refX', '10');
  marker.setAttribute('refY', '3.5');
  marker.setAttribute('orient', 'auto');
  const polygon = document.createElementNS(svgNS, 'polygon');
  polygon.setAttribute('points', '0 0, 10 3.5, 0 7');
  polygon.setAttribute('fill', '#4a9eff');
  marker.appendChild(polygon);
  defs.appendChild(marker);
  flowSvg.appendChild(defs);
  
  // ズーム機能
  let scale = 1;
  const zoomIn = document.getElementById('flowZoomIn');
  const zoomOut = document.getElementById('flowZoomOut');
  const zoomReset = document.getElementById('flowZoomReset');
  
  function applyZoom(newScale) {
    scale = Math.max(0.5, Math.min(2, newScale));
    flowInner.style.transform = `scale(${scale})`;
  }
  
  zoomIn?.addEventListener('click', () => applyZoom(scale + 0.1));
  zoomOut?.addEventListener('click', () => applyZoom(scale - 0.1));
  zoomReset?.addEventListener('click', () => applyZoom(1));
}

// MCP プレイリスト/カタログ 表示
(async function initMcpSection(){
  const state = { top: 'playlist', cat: 'creative' };
  const btnTop = {
    playlist: document.getElementById('btnMcpPlaylist'),
    catalog: document.getElementById('btnMcpCatalog')
  };
  const btnCat = {
    creative: document.getElementById('btnCatCreative'),
    development: document.getElementById('btnCatDevelopment'),
    business: document.getElementById('btnCatBusiness')
  };
  const table = document.getElementById('mcpTable');
  const thead = table?.querySelector('thead');
  const tbody = table?.querySelector('tbody');
  const msg = document.getElementById('mcpMessage');

  function setActive(){
    Object.values(btnTop).forEach(b=>b?.classList.remove('active'));
    Object.values(btnCat).forEach(b=>b?.classList.remove('active'));
    btnTop[state.top]?.classList.add('active');
    btnCat[state.cat]?.classList.add('active');
  }

  async function loadJson(url, inlineId, fallbackArray){
    let items = [];
    if (location.protocol !== 'file:') {
      try { const res = await fetch(url, { cache: 'no-cache' }); if (res.ok) items = await res.json(); } catch(_) {}
    }
    if (!Array.isArray(items) || items.length===0) {
      const inline = document.getElementById(inlineId);
      if (inline && !inline.textContent && fallbackArray) inline.textContent = JSON.stringify(fallbackArray, null, 2);
      try { items = JSON.parse(document.getElementById(inlineId)?.textContent || '[]'); } catch(_) {}
    }
    return Array.isArray(items)? items: [];
  }

  const playlists = await loadJson('./data/mcp_playlists.json', 'mcpPlaylistsInline', [
    { category:'creative', name:'Creative Base', url:'https://example.com/mcp/creative.json', format:'json', description:'クリエイティブ向けMCPサーバーのプレイリスト' }
  ]);
  const catalogs = await loadJson('./data/mcp_catalog.json', 'mcpCatalogInline', [
    { category:'creative', title:'Creative Servers', url:'https://docs.example.com/catalog/creative', description:'クリエイティブ領域のMCPサーバーカタログ' }
  ]);

  function render(){
    if (!thead || !tbody) return;
    setActive();
    const cat = state.cat;
    if (state.top === 'playlist') {
      thead.innerHTML = `<tr><th>名前</th><th>URL</th><th>形式</th><th>説明</th></tr>`;
      const filtered = playlists.filter(x=>x.category===cat);
      const rows = filtered.map(x=> `
        <tr>
          <td>${escapeHtml(x.name||'')}</td>
          <td><a href="${escapeAttr(x.url||'')}" target="_blank" rel="noopener">${escapeHtml(x.url||'')}</a></td>
          <td><code>${escapeHtml(x.format||'')}</code></td>
          <td>${escapeHtml(x.description||'')}</td>
        </tr>`).join('');
      tbody.innerHTML = rows || `<tr><td colspan="4">該当するプレイリストがありません。</td></tr>`;
      if (msg) msg.textContent = 'MCPプレイリスト（カテゴリ別）';
    } else {
      thead.innerHTML = `<tr><th>ページ</th><th>URL</th><th>説明</th></tr>`;
      const filtered = catalogs.filter(x=>x.category===cat);
      const rows = filtered.map(x=> `
        <tr>
          <td>${escapeHtml(x.title||'')}</td>
          <td><a href="${escapeAttr(x.url||'')}" target="_blank" rel="noopener">${escapeHtml(x.url||'')}</a></td>
          <td>${escapeHtml(x.description||'')}</td>
        </tr>`).join('');
      tbody.innerHTML = rows || `<tr><td colspan="3">該当するカタログページがありません。</td></tr>`;
      if (msg) msg.textContent = 'MCPカタログ（カテゴリ別）';
    }
  }

  btnTop.playlist?.addEventListener('click', ()=>{ state.top='playlist'; render(); });
  btnTop.catalog?.addEventListener('click',  ()=>{ state.top='catalog';  render(); });
  btnCat.creative?.addEventListener('click', ()=>{ state.cat='creative'; render(); });
  btnCat.development?.addEventListener('click', ()=>{ state.cat='development'; render(); });
  btnCat.business?.addEventListener('click', ()=>{ state.cat='business'; render(); });

  render();
})();

// 動的カード生成（サーバーカタログ、パッケージ）
function setCardGradient(card, title){
  const hues = [
    { a: 210, b: 230 }, // 青系
    { a: 280, b: 300 }, // 紫系
    { a: 160, b: 180 }, // 緑系
    { a: 20, b: 40 },   // オレンジ系
    { a: 340, b: 360 }, // 赤系
  ];
  const idx = Math.abs(hashCode(title)) % hues.length;
  const h = hues[idx];
  card.style.setProperty('--card-hue-a', h.a);
  card.style.setProperty('--card-hue-b', h.b);
}

function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return hash;
}

// パッケージカード生成
async function renderPackages(){
  const container = document.getElementById('packageCards');
  if (!container) return;
  const packages = [
    { id: 'mcp-kamui-code', name: 'mcp-kamui-code.json', desc: 'KAMUI CODE 全体定義' },
    { id: 'mcp-requirement', name: 'mcp-requirement.json', desc: '要件定義ツール' },
    { id: 'mcp-storyboard', name: 'mcp-storyboard.json', desc: 'ストーリーボードツール' }
  ];
  packages.forEach(pkg => {
    const card = document.createElement('div');
    card.className = 'card pastel';
    setCardGradient(card, pkg.name);
    card.innerHTML = `
      <div class="card-title">${pkg.name}</div>
      <div style="color: var(--text-weak); font-size: 0.85rem;">${pkg.desc}</div>
    `;
    card.style.cursor = 'pointer';
    card.addEventListener('click', async () => {
      try {
        const res = await fetch(`./mcp/${pkg.id}.json`);
        const json = await res.text();
        openJsonModal(json, pkg.name);
      } catch(e) {
        openJsonModal('{ "error": "Failed to load JSON" }', pkg.name);
      }
    });
    container.appendChild(card);
  });
}

// サーバーカタログカード生成
async function renderServers(){
  const serverContainer = document.getElementById('serverCards');
  if (!serverContainer) return;
  
  try {
    // バックエンドからMCPサーバー情報を取得
    const res = await fetch('http://localhost:7777/api/claude/mcp/servers', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const servers = Array.isArray(data.servers) ? data.servers : [];
    
    // 最初の8個のサーバーを表示
    servers.slice(0, 8).forEach((server, idx) => {
      const name = String(server.name || `server-${idx+1}`);
      const desc = String(server.description || server.url || '');
      
      // カテゴリを推測
      let category = 'creative';
      if (name.includes('analysis') || name.includes('train')) category = 'development';
      if (name.includes('translate') || name.includes('business')) category = 'business';
      
      // ベンダーを推測
      let vendor = 'FAL';
      if (desc.includes('Google') || name.includes('imagen3')) vendor = 'Google';
      if (desc.includes('Bytedance')) vendor = 'Bytedance';
      if (desc.includes('Ideogram')) vendor = 'Ideogram';
      
      const card = document.createElement('div');
      card.className = 'card pastel server-card';
      card.style.position = 'relative';
      setCardGradient(card, name);
      
      // 基本的なカード内容のみ
      card.innerHTML = `
        <div class="card-title">${name.replace(/^[ti]2[ivmt]-kamui-/, '').replace(/-/g, ' ')}</div>
        <span class="badge">${category}</span>
        <span class="badge">${vendor}</span>
        <div class="endpoint">/api/...</div>
      `;
      
      card.style.cursor = 'pointer';
      card.addEventListener('click', () => {
        const usage = buildUsage(category, server.url || '');
        openJsonModal(usage, name);
      });
      
      // ホバーイベントで詳細情報を取得
      card.addEventListener('mouseenter', async () => {
        const fixedTooltip = getTooltipElement();
        if (fixedTooltip) {
          setTooltipSource(card);
          fixedTooltip.innerHTML = `
            <div class="mcp-tooltip-content">
              <div class="mcp-tooltip-desc">${escapeHtml(desc)}</div>
              <div class="mcp-tooltip-section">詳細情報を読み込み中...</div>
            </div>
          `;
          fixedTooltip.classList.add('visible');
          fixedTooltip.scrollTop = 0;
          
          try {
            const toolData = {
              name: name,
              description: desc,
              url: server.url
            };
            const details = await fetchMCPToolDetails(toolData);

            const sections = [];
            if (details.error) {
              sections.push(`<div class="mcp-tooltip-section error">⚠️ ${escapeHtml(details.error)}</div>`);
            }
            if (details.endpoint) {
              sections.push(`<div class="mcp-tooltip-section"><strong>エンドポイント:</strong> ${details.method ? `${escapeHtml(details.method)} ` : ''}${escapeHtml(details.endpoint)}</div>`);
            }
            if (details.params) {
              sections.push(`<div class="mcp-tooltip-section"><strong>パラメータ:</strong><br>${escapeHtml(details.params)}</div>`);
            }
            if (details.example) {
              sections.push(`<div class="mcp-tooltip-section"><strong>使用例:</strong><br><code>${escapeHtml(details.example)}</code></div>`);
            }
            if (details.rawSnippet) {
              sections.push(`<div class="mcp-tooltip-section"><strong>Raw:</strong><br><code>${escapeHtml(details.rawSnippet)}</code></div>`);
            }

            fixedTooltip.innerHTML = `
              <div class="mcp-tooltip-content">
                <div class="mcp-tooltip-desc">${escapeHtml(desc)}</div>
                ${sections.join('\n')}
              </div>
            `;

            const endpointEl = card.querySelector('.endpoint');
            if (endpointEl) {
              endpointEl.textContent = details.endpoint || '/api/...';
            }
          } catch (err) {
            console.warn('Failed to load server details:', err);
            fixedTooltip.innerHTML = `
              <div class="mcp-tooltip-content">
                <div class="mcp-tooltip-desc">${escapeHtml(desc)}</div>
                <div class="mcp-tooltip-section error">⚠️ ${escapeHtml(err && err.message ? err.message : '詳細の取得に失敗しました')}</div>
              </div>
            `;
          }
        }
      });
      
      card.addEventListener('mouseleave', (e) => {
        const tooltip = getTooltipElement();
        if (tooltip && e.relatedTarget && tooltip.contains(e.relatedTarget)) {
          return;
        }
        scheduleTooltipHide(card);
      });
      
      serverContainer.appendChild(card);
    });
  } catch(err) {
    console.error('Failed to load MCP servers:', err);
    // フォールバック：静的データを表示
    const fallbackServers = [
      { category: 'creative', title: 'Text to Image', vendor: 'FAL', url: 'https://example.com/t2i/fal/imagen4/ultra' }
    ];
    fallbackServers.forEach(server => {
      const { category, title, vendor, url } = server;
      const pathOnly = url.replace(/^https?:\/\/[^\/]+/, '');
      const card = document.createElement('div');
      card.className = 'card pastel';
      setCardGradient(card, title);
      card.innerHTML = `
        <div class="card-title">${title}</div>
        <span class="badge">${category}</span>
        <span class="badge">${vendor}</span>
        <div class="endpoint">${pathOnly}</div>
      `;
      card.style.cursor = 'pointer';
      card.addEventListener('click', () => {
        const usage = buildUsage(category, url);
        openJsonModal(usage, title);
      });
      serverContainer.appendChild(card);
    });
  }
}

// MCPツール詳細情報キャッシュ
const mcpToolCache = {};

// ツールチップ状態管理（カード/ダイヤル共通）
const tooltipState = { source: null, hover: false, hideTimeout: null };

function getTooltipElement() {
  const tooltip = document.getElementById('mcpDialTooltipFixed');
  if (tooltip && !tooltip.dataset.tooltipManaged) {
    tooltip.dataset.tooltipManaged = 'true';
    tooltip.addEventListener('mouseenter', () => {
      tooltipState.hover = true;
      if (tooltipState.hideTimeout) {
        clearTimeout(tooltipState.hideTimeout);
        tooltipState.hideTimeout = null;
      }
    });
    tooltip.addEventListener('mouseleave', () => {
      tooltipState.hover = false;
      scheduleTooltipHide(tooltipState.source);
    });
  }
  return tooltip;
}

function setTooltipSource(el) {
  if (tooltipState.source && tooltipState.source !== el) {
    tooltipState.source.classList.remove('tooltip-source-active');
  }
  tooltipState.source = el || null;
  if (tooltipState.hideTimeout) {
    clearTimeout(tooltipState.hideTimeout);
    tooltipState.hideTimeout = null;
  }
  if (el) {
    el.classList.add('tooltip-source-active');
  }
}

function hideTooltip() {
  const tooltip = document.getElementById('mcpDialTooltipFixed');
  if (!tooltip) return;
  tooltip.classList.remove('visible');
  tooltipState.hover = false;
  if (tooltipState.source) {
    tooltipState.source.classList.remove('tooltip-source-active');
  }
  tooltipState.source = null;
}

function scheduleTooltipHide(source) {
  if (tooltipState.hideTimeout) {
    clearTimeout(tooltipState.hideTimeout);
  }
  tooltipState.hideTimeout = window.setTimeout(() => {
    const tooltip = document.getElementById('mcpDialTooltipFixed');
    if (!tooltip) return;
    if (tooltipState.hover) return;
    if (source && typeof source.matches === 'function' && source.matches(':hover')) return;
    if (tooltipState.source && tooltipState.source !== source) return;
    hideTooltip();
  }, 700);
}

// MCPツール詳細情報を取得する関数
async function fetchMCPToolDetails(tool) {
  const toolName = tool.name;
  const backendBase = (() => {
    if (typeof state !== 'undefined' && state && state.backendBase) return state.backendBase;
    if (typeof window !== 'undefined' && typeof window.KAMUI_BACKEND_BASE === 'string' && window.KAMUI_BACKEND_BASE) return window.KAMUI_BACKEND_BASE;
    return 'http://localhost:7777';
  })();

  if (mcpToolCache[toolName]) {
    return mcpToolCache[toolName];
  }

  const buildSnippet = (text) => {
    if (!text) return '';
    return text.length > 1200 ? `${text.slice(0, 1200)}\n...` : text;
  };

  const normalizeRaw = (value) => {
    if (value === null || value === undefined) return '';
    if (typeof value !== 'string') {
      try { return JSON.stringify(value, null, 2); } catch (_) { return String(value); }
    }
    const trimmed = value.trim();
    const tryJson = (input) => {
      try { return JSON.stringify(JSON.parse(input), null, 2); } catch (_) { return null; }
    };
    const parsed = tryJson(trimmed) || tryJson(trimmed.replace(/\\n/g, '\n').replace(/\\t/g, '\t'));
    if (parsed) return parsed;
    return trimmed.replace(/\\r?\\n/g, '\n').replace(/\\t/g, '\t');
  };

  let details = null;

  if (tool.saasFile) {
    try {
      const endpointBase = (() => {
        if (typeof state !== 'undefined' && state && state.backendBase) return state.backendBase;
        if (typeof window !== 'undefined' && typeof window.KAMUI_BACKEND_BASE === 'string' && window.KAMUI_BACKEND_BASE) return window.KAMUI_BACKEND_BASE;
        return 'http://localhost:7777';
      })();
      const yamlRes = await fetch(`${endpointBase.replace(/\/$/, '')}/api/saas/yaml?file=${encodeURIComponent(tool.saasFile)}`, { cache: 'no-store' });
      const yamlBody = await yamlRes.text();
      let yamlPayload = null;
      try { yamlPayload = yamlBody ? JSON.parse(yamlBody) : null; } catch (err) {
        console.warn('Failed to parse YAML JSON payload:', err);
      }
      if (yamlRes.ok && yamlPayload && typeof yamlPayload === 'object') {
        const content = normalizeRaw(yamlPayload.content || '');
        details = {
          endpoint: yamlPayload.path || tool.saasFile,
          method: 'YAML',
          params: tool.saasTitle ? `タイトル: ${tool.saasTitle}` : '',
          example: tool.saasSummary || '',
          rawText: content,
          rawSnippet: buildSnippet(content)
        };
      } else {
        const fallbackRaw = normalizeRaw(yamlBody);
        details = {
          error: `YAML fetch failed (${yamlRes.status})`,
          endpoint: tool.saasPath || tool.saasFile,
          method: 'YAML',
          params: tool.saasTitle ? `タイトル: ${tool.saasTitle}` : '',
          example: tool.saasSummary || '',
          rawText: fallbackRaw,
          rawSnippet: buildSnippet(fallbackRaw)
        };
      }
    } catch (err) {
      console.warn('Failed to load SaaS YAML details:', err);
      const message = err && err.message ? err.message : String(err);
      const normalized = normalizeRaw(message);
      details = {
        error: `YAML error: ${message}`,
        endpoint: tool.saasPath || tool.saasFile || '',
        method: 'YAML',
        params: tool.saasTitle ? `タイトル: ${tool.saasTitle}` : '',
        example: tool.saasSummary || '',
        rawText: normalized,
        rawSnippet: buildSnippet(normalized)
      };
    }
  } else if (tool.url) {
    try {
      const endpointUrl = `${backendBase.replace(/\/$/, '')}/api/claude/mcp/tool-info?url=${encodeURIComponent(tool.url)}`;
      const infoRes = await fetch(endpointUrl, { cache: 'no-store' });
      const rawBody = await infoRes.text();
      let payload = null;
      try {
        payload = rawBody ? JSON.parse(rawBody) : null;
      } catch (parseErr) {
        console.warn(`Failed to parse tool-info payload for ${toolName}:`, parseErr);
      }

      if (!infoRes.ok) {
        const normalized = normalizeRaw(rawBody);
        details = {
          error: `HTTP ${infoRes.status} ${infoRes.statusText || ''}`.trim(),
          endpoint: '',
          method: '',
          params: '',
          example: '',
          rawText: normalized,
          rawSnippet: buildSnippet(normalized)
        };
      } else if (payload && payload.submitTool) {
        const params = payload.submitTool.properties || {};
        const paramList = Object.entries(params)
          .map(([key, schema]) => `${key}: ${(schema && (schema.description || schema.type)) || ''}`)
          .join(', ');
        const normalized = normalizeRaw(payload.raw || rawBody);
        details = {
          endpoint: tool.url.replace(/^https?:\/\/[^\/]+/, '') + (payload.submitTool.name ? `/submit` : ''),
          method: 'POST',
          params: paramList || 'No parameters',
          example: JSON.stringify(
            Object.fromEntries(
              Object.entries(params).map(([key, schema]) => [
                key,
                (schema && schema.example) || (schema && schema.type === 'number' ? 0 : (schema && schema.type === 'boolean' ? false : `example ${key}`))
              ])
            ),
            null,
            2
          ),
          rawText: normalized,
          rawSnippet: buildSnippet(normalized)
        };
      } else if (payload) {
        const rawSource = typeof payload.raw !== 'undefined' ? payload.raw : payload;
        const raw = normalizeRaw(rawSource);
        details = {
          error: payload.error || '',
          endpoint: '',
          method: '',
          params: '',
          example: '',
          rawText: raw,
          rawSnippet: buildSnippet(raw)
        };
      } else if (rawBody) {
        const normalized = normalizeRaw(rawBody);
        details = {
          endpoint: '',
          method: '',
          params: '',
          example: '',
          rawText: normalized,
          rawSnippet: buildSnippet(normalized)
        };
      }
    } catch (err) {
      console.warn(`Failed to load details for ${toolName}:`, err);
      const message = err && err.message ? err.message : String(err);
      const normalized = normalizeRaw(err && err.stack ? err.stack : message);
      details = {
        error: `Network error: ${message}`,
        endpoint: '',
        method: '',
        params: '',
        example: '',
        rawText: normalized,
        rawSnippet: buildSnippet(normalized)
      };
    }
  }

  if (!details || (!details.endpoint && !details.rawText && !details.error)) {
    details = mcpToolDetails[toolName] || {};
  }

  mcpToolCache[toolName] = details;
  return details;
}

// MCPツール詳細情報マッピングを関数の外に移動（グローバルに）
const mcpToolDetails = {
  'file-upload-kamui-fal': {
    endpoint: '/uploader/fal',
    method: 'POST',
    params: 'ファイルをmultipart/form-dataで送信',
    example: 'curl -X POST -F "file=@image.jpg" {BASE_URL}/uploader/fal'
  },
  't2i-kamui-flux-schnell': {
    endpoint: '/t2i/fal/flux/schnell',
    method: 'POST',
    params: 'prompt: 画像生成プロンプト（高速）',
    example: '{"prompt": "サイバーパンクな東京の夜景"}'
  },
  't2i-kamui-flux-krea-lora': {
    endpoint: '/t2i/fal/flux-krea-lora',
    method: 'POST',
    params: 'prompt: 画像生成プロンプト, lora_scale: LoRA強度',
    example: '{"prompt": "アニメスタイルのキャラクター", "lora_scale": 0.8}'
  },
  't2i-kamui-dreamina-v31': {
    endpoint: '/t2i/fal/bytedance/dreamina/v3.1/text-to-image',
    method: 'POST',
    params: 'prompt: 画像生成プロンプト, style: スタイル指定',
    example: '{"prompt": "油絵風の風景画", "style": "oil-painting"}'
  },
  't2i-kamui-imagen3': {
    endpoint: '/t2i/google/imagen',
    method: 'POST',
    params: 'prompt: 画像生成プロンプト（Google Imagen）',
    example: '{"prompt": "フォトリアルな花の写真"}'
  },
  't2i-kamui-imagen4-fast': {
    endpoint: '/t2i/fal/imagen4/fast',
    method: 'POST',
    params: 'prompt: 画像生成プロンプト, size: 画像サイズ（オプション）',
    example: '{"prompt": "富士山の美しい写真", "size": "1024x1024"}'
  },
  't2i-kamui-imagen4-ultra': {
    endpoint: '/t2i/fal/imagen4/ultra',
    method: 'POST',
    params: 'prompt: 画像生成プロンプト（高品質）, size: 画像サイズ',
    example: '{"prompt": "詳細な富士山の風景画", "size": "2048x2048"}'
  },
  't2i-kamui-ideogram-character-base': {
    endpoint: '/t2i/fal/ideogram/character-base',
    method: 'POST',
    params: 'prompt: キャラクター説明, consistency_mode: 一貫性モード',
    example: '{"prompt": "勇敢な女性戦士", "consistency_mode": true}'
  },
  't2v-kamui-veo3-fast': {
    endpoint: '/t2v/fal/veo3/fast',
    method: 'POST',
    params: 'prompt: ビデオ生成プロンプト, duration: 長さ（秒）',
    example: '{"prompt": "走る猫のアニメーション", "duration": 5}'
  },
  't2v-kamui-wan-v2-2-5b-fast': {
    endpoint: '/t2v/fal/wan/v2.2-5b/text-to-video/fast-wan',
    method: 'POST',
    params: 'prompt: ビデオ生成プロンプト, fps: フレームレート',
    example: '{"prompt": "空を飛ぶ鳥", "fps": 24}'
  },
  'i2i-kamui-aura-sr': {
    endpoint: '/i2i/fal/aura-sr',
    method: 'POST',
    params: 'image_url: 元画像URL, scale: 拡大倍率',
    example: '{"image_url": "https://example.com/image.jpg", "scale": 4}'
  },
  'i2i-kamui-flux-kontext-lora': {
    endpoint: '/i2i/fal/flux/kontext',
    method: 'POST',
    params: 'image_url: 元画像URL, prompt: 編集指示',
    example: '{"image_url": "base64://...", "prompt": "背景を夕焼けに変更"}'
  },
  'i2i-kamui-ideogram-character-remix': {
    endpoint: '/i2i/fal/ideogram/character-remix',
    method: 'POST',
    params: 'image_url: キャラクター画像, style: 新しいスタイル',
    example: '{"image_url": "base64://...", "style": "cyberpunk"}'
  },
  'i2i-kamui-qwen-image-edit': {
    endpoint: '/i2i/fal/qwen/image-edit',
    method: 'POST',
    params: 'image_url: 元画像, prompt: 編集指示',
    example: '{"image_url": "base64://...", "prompt": "人物を削除して背景のみに"}'
  },
  'train-kamui-flux-kontext': {
    endpoint: '/train/fal/flux/kontext',
    method: 'POST',
    params: 'images: 学習画像配列, model_name: モデル名',
    example: '{"images": ["url1", "url2"], "model_name": "my-style"}'
  },
  'video-analysis-kamui': {
    endpoint: '/video-analysis/google/gemini',
    method: 'POST',
    params: 'video_url: ビデオURL, prompt: 分析指示',
    example: '{"video_url": "https://example.com/video.mp4", "prompt": "このビデオの要約を作成"}'
  }
};

// 利用方法テンプレート
function buildUsage(category, url){
  const h = `# 利用方法\n対象: ${url}\nカテゴリ: ${category}\n\n`;
  const tpl = {
    'creative': `curl -X POST "${url}" \\
  -H "Authorization: Bearer <TOKEN>" \\
  -H "Content-Type: application/json" \\
  -d '{"prompt":"美しい風景","size":"1024x1024"}'`,
    'development': `curl -X POST "${url}" \\
  -H "Authorization: Bearer <TOKEN>" \\
  -H "Content-Type: application/json" \\
  -d '{"code":"function test() { return true; }"}'`,
    'business': `curl -X POST "${url}" \\
  -H "Authorization: Bearer <TOKEN>" \\
  -H "Content-Type: application/json" \\
  -d '{"text":"こんにちは","target_lang":"en"}'`
  };
  const code = tpl[category] || `curl -X POST "${url}" -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" -d '{"prompt":"..."}'`;
  return h + '```bash\n' + code + '\n```';
}

// クライアントサンプルカード
function initClientSamples() {
  const cards = document.querySelectorAll('[data-sample-id]');
  cards.forEach(card => {
    const sampleId = card.getAttribute('data-sample-id');
    const jsonScript = document.getElementById(sampleId);
    if (!jsonScript) return;
    
    // ダミーデータをセット
    const dummyData = {
      'client-codex': { mcpServers: { 'kamui-creative': {}, 'kamui-dev': {} } },
      'client-claude': { mcpServers: { 'kamui-creative': {}, 'kamui-dev': {}, 'kamui-business': {} } },
      'client-claude-command': { mcpServers: { 'kamui-dev': {} } },
      'client-gemini': { mcpServers: { 'kamui-creative': {}, 'kamui-business': {} } }
    };
    
    const data = dummyData[sampleId] || {};
    jsonScript.textContent = JSON.stringify(data, null, 2);
    
    // サーバー数を更新
    const count = Object.keys(data.mcpServers || {}).length;
    const countEl = card.querySelector('.endpoint');
    if (countEl) countEl.textContent = `サーバー定義数: ${count}`;
    
    // カードグラデーション設定
    setCardGradient(card, card.querySelector('.card-title')?.textContent || '');
    
    // イベントリスナー
    const openBtn = card.querySelector('[data-open-client]');
    const copyBtn = card.querySelector('[data-copy-client]');
    
    openBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      openJsonModal(jsonScript.textContent, card.querySelector('.card-title')?.textContent || 'サンプル');
    });
    
    copyBtn?.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(jsonScript.textContent);
        copyBtn.textContent = 'コピー済み';
        setTimeout(() => { copyBtn.textContent = 'コピー'; }, 1500);
      } catch(err) {
        console.error('コピーに失敗:', err);
      }
    });
    
    card.style.cursor = 'pointer';
    card.addEventListener('click', () => {
      openJsonModal(jsonScript.textContent, card.querySelector('.card-title')?.textContent || 'サンプル');
    });
  });
}

// 画像クリックで拡大
function initImageModals() {
  document.querySelectorAll('.media-grid img, .section-image img, .clickable-img img').forEach((img) => {
    img.style.cursor = 'pointer';
    img.addEventListener('click', () => {
      const parent = img.closest('.media-item');
      const title = parent?.querySelector('.media-name')?.textContent || img.getAttribute('alt');
      openImgModal(img.getAttribute('src'), title);
    });
  });
}

// 右クリックメニュー
function initContextMenu() {
  const contextMenu = document.createElement('div');
  contextMenu.id = 'custom-context-menu';
  contextMenu.style.cssText = `
    position: fixed;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    z-index: 10000;
    display: none;
    min-width: 180px;
  `;
  contextMenu.innerHTML = `
    <div id="copy-path-btn" style="padding: 8px 12px; cursor: pointer; border-radius: 4px; font-size: 0.9rem; color: var(--text);">
      📋 相対パスをコピー
    </div>
  `;
  document.body.appendChild(contextMenu);
  
  let currentPath = '';
  
  document.querySelectorAll('.media-item[data-path]').forEach(item => {
    item.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      currentPath = item.getAttribute('data-path');
      
      contextMenu.style.display = 'block';
      contextMenu.style.left = e.pageX + 'px';
      contextMenu.style.top = e.pageY + 'px';
      
      const rect = contextMenu.getBoundingClientRect();
      if (rect.right > window.innerWidth) {
        contextMenu.style.left = (window.innerWidth - rect.width - 10) + 'px';
      }
      if (rect.bottom > window.innerHeight) {
        contextMenu.style.top = (window.innerHeight - rect.height - 10) + 'px';
      }
    });
  });
  
  document.getElementById('copy-path-btn').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(currentPath);
      const btn = document.getElementById('copy-path-btn');
      const originalText = btn.innerHTML;
      btn.innerHTML = '✅ コピーしました！';
      setTimeout(() => {
        btn.innerHTML = originalText;
      }, 1500);
    } catch (err) {
      console.error('コピーに失敗しました:', err);
    }
    contextMenu.style.display = 'none';
  });
  
  document.getElementById('copy-path-btn').addEventListener('mouseenter', (e) => {
    e.target.style.background = 'var(--hover)';
  });
  document.getElementById('copy-path-btn').addEventListener('mouseleave', (e) => {
    e.target.style.background = 'transparent';
  });
  
  document.addEventListener('click', (e) => {
    if (!contextMenu.contains(e.target)) {
      contextMenu.style.display = 'none';
    }
  });
}

// メニュー一覧の動的生成
async function initDocMenuTable() {
  const menuTable = document.getElementById('docMenuTable');
  if (!menuTable) return;
  
  const tbody = menuTable.querySelector('tbody');
  const messageDiv = document.getElementById('docMenuMessage');
  
  try {
    let menuData = [];
    
    // JSONファイルから読み込み
    try {
      const res = await fetch('/data/kamui-doc-menus.json', { cache: 'no-cache' });
      if (res.ok) {
        menuData = await res.json();
      }
    } catch (e) {
      console.log('JSONファイルの読み込みに失敗しました:', e);
    }
    
    // データが取得できない場合はフォールバック
    if (!Array.isArray(menuData) || menuData.length === 0) {
      // インラインフォールバックデータ
      menuData = [
        { id:'home', label:'ホーム', type:'menu', path:'/', parentId:null, order:0, description:'KAMUI CODE ドキュメントのホーム' },
        { id:'welcome', label:'はじめまして', type:'menu', path:'/welcome', parentId:null, order:0.2, description:'初めての方向けの案内' },
        { id: 'mcp-playlist', label:'MCPプレイリスト', type:'group', path:'/playlist', parentId:null, order:1, description:'MCPサーバーURLのプレイリスト（最上位）' },
        { id: 'playlist-all', label:'プレイリスト一覧', type:'menu', path:'/playlist/all', parentId:'mcp-playlist', order:1.01, description:'プレイリストIDの一覧と検索' },
        { id: 'playlist-creative', label:'プレイリスト（クリエイティブ）', type:'menu', path:'/playlist/creative', parentId:'mcp-playlist', order:1.10, description:'クリエイティブ向けプレイリスト' },
        { id: 'playlist-development', label:'プレイリスト（開発）', type:'menu', path:'/playlist/development', parentId:'mcp-playlist', order:1.20, description:'開発向けプレイリスト' },
        { id: 'playlist-business', label:'プレイリスト（ビジネス）', type:'menu', path:'/playlist/business', parentId:'mcp-playlist', order:1.30, description:'ビジネス向けプレイリスト' },
        { id: 'mcp-catalog', label:'MCPカタログ', type:'group', path:'/catalog', parentId:null, order:2, description:'MCPサーバー/パッケージのカタログ' },
        { id: 'catalog-all', label:'カタログ一覧', type:'menu', path:'/catalog/all', parentId:'mcp-catalog', order:2.01, description:'カタログIDの一覧と検索' },
        { id: 'catalog-creative', label:'カタログ（クリエイティブ）', type:'menu', path:'/catalog/creative', parentId:'mcp-catalog', order:2.10, description:'クリエイティブ領域のカタログ' },
        { id: 'catalog-development', label:'カタログ（開発）', type:'menu', path:'/catalog/development', parentId:'mcp-catalog', order:2.20, description:'開発領域のカタログ' },
        { id: 'catalog-business', label:'カタログ（ビジネス）', type:'menu', path:'/catalog/business', parentId:'mcp-catalog', order:2.30, description:'ビジネス領域のカタログ' }
      ];
    }
    
    if (menuData.length > 0) {
      tbody.innerHTML = ''; // 既存の行をクリア
      menuData.forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${item.label || ''}</td>
          <td>${item.id || ''}</td>
          <td>${item.type || ''}</td>
          <td>${item.path || ''}</td>
          <td>${item.parentId || ''}</td>
          <td>${item.order || ''}</td>
          <td>${item.description || ''}</td>
        `;
        tbody.appendChild(row);
      });
      
      if (messageDiv) {
        messageDiv.textContent = `メニュー項目: ${menuData.length}件`;
      }
    }
  } catch (error) {
    console.error('メニューテーブルの初期化エラー:', error);
    if (messageDiv) {
      messageDiv.textContent = 'メニューデータの読み込みに失敗しました。';
    }
  }
}

  // 右下フローティング エージェントタスクボード（フロントのみ・ローカルストレージ永続化）
  function initTaskBoard(){
    try {
      if (window.__aiTaskBoardInit) return;
      window.__aiTaskBoardInit = true;
      if (document.getElementById('aiTaskBoard') || document.querySelector('.taskboard-toggle')) return;

      // ストレージモジュールは別ファイル(taskboard-storage.js)で管理
      const storageModule = window.KamuiTaskBoardStorage || null;
      if (!storageModule) {
        console.error('[TaskBoard] Storage module not loaded! Make sure taskboard-storage.js is included.');
        return;
      }
      const MAX_TASK_HISTORY = 40;
      const MAX_TASK_AGE_MS = 1000 * 60 * 60 * 24 * 14; // 14日間保持
      const MAX_LOG_LENGTH = 20000; // 20KBぶんだけ保持
      const CODEX_IDLE_STOP_THRESHOLD = 3; // consecutive idle polls before stopping Codex monitor
      const MODEL_BLUEPRINTS = [
        {
          id: 'claude',
          label: 'Claude CLI',
          shortLabel: 'Claude',
          description: 'Anthropic Claude コードエージェント (claude --output-format stream-json)',
          endpoint: '/api/claude/chat',
          provider: 'anthropic'
        },
        {
          id: 'codex',
          label: 'Codex CLI',
          shortLabel: 'Codex',
          description: 'OpenAI Codex CLI (codex exec --json)',
          endpoint: '/api/codex/chat',
          provider: 'openai'
        },
        {
          id: 'codex-pty',
          label: 'Codex Terminal',
          shortLabel: 'Codex PTY',
          description: 'OpenAI Codex 仮想端末 (WebSocket + PTY)',
          provider: 'openai',
          ptyCommand: 'codex'
        },
        {
          id: 'codex-iterm',
          label: 'Codex + Terminal',
          shortLabel: 'Codex+terminal',
          description: 'OpenAI Codex CLI (ローカル iTerm で起動)',
          provider: 'openai',
          externalTerminalType: 'codex-iterm'
        }
      ];
      const PRIORITY_LEVELS = ['high', 'medium', 'low'];
      const PRIORITY_LABELS = {
        high: '高',
        medium: '中',
        low: '低'
      };
      const PRIORITY_ROW_ORDER = ['high', 'medium', 'low'];
      const PRIORITY_COL_ORDER = ['low', 'medium', 'high'];
      function normalizePriorityLevel(value, fallback = 'medium') {
        if (value == null) return fallback;
        const raw = String(value).trim();
        if (!raw) return fallback;
        const lower = raw.toLowerCase();
        if (PRIORITY_LEVELS.includes(lower)) return lower;
        if (raw === '高' || raw === '重要' || raw === '緊急' || lower === 'urgent' || lower === 'high' || lower === 'critical' || lower === 'h' || lower === '3') return 'high';
        if (raw === '中' || raw === '普通' || lower === 'medium' || lower === 'mid' || lower === 'm' || lower === '2') return 'medium';
        if (raw === '低' || raw === '低い' || lower === 'low' || lower === 'l' || lower === '1') return 'low';
        return fallback;
      }
      function priorityLabel(level) {
        const key = normalizePriorityLevel(level);
        return PRIORITY_LABELS[key] || PRIORITY_LABELS.medium;
      }
      function priorityClass(level) {
        const key = normalizePriorityLevel(level);
        return `priority-${key}`;
      }
      function priorityKindIcon(kind) {
        if (kind === 'importance') {
          return '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M8 1.5 2.5 8 8 14.5 13.5 8 8 1.5Z"/></svg>';
        }
        return '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M8.25 1.333 3.5 9.333h3.417l-1.167 5.334 6.417-8H8.25l.833-5.334Z"/></svg>';
      }
      function priorityIconSvg(kind, level) {
        const normalized = normalizePriorityLevel(level);
        if (kind === 'importance') {
          if (normalized === 'high') {
            return '<svg class="tb-priority-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M8 2.25 3.25 8h3v5.75h3.5V8h3L8 2.25Z"/></svg>';
          }
          if (normalized === 'low') {
            return '<svg class="tb-priority-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M8 13.75 12.75 8h-3V2.25H6.25V8h-3L8 13.75Z"/></svg>';
          }
          return '<svg class="tb-priority-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M8 3.25a4.75 4.75 0 1 1 0 9.5 4.75 4.75 0 0 1 0-9.5Z"/></svg>';
        }
        // urgency icons
        if (normalized === 'high') {
          return '<svg class="tb-priority-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M8.667 1.333 3 9.667h4v5L13 6.333H9.333l.666-5Z"/></svg>';
        }
        if (normalized === 'low') {
          return '<svg class="tb-priority-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M4 4h8c.552 0 1 .448 1 1v1.5H3V5c0-.552.448-1 1-1Zm-1 4.5h10V11c0 .552-.448 1-1 1H4c-.552 0-1-.448-1-1V8.5Z"/></svg>';
        }
        return '<svg class="tb-priority-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M8 1.333a6.667 6.667 0 1 1 0 13.334A6.667 6.667 0 0 1 8 1.333Zm0 2.667a.667.667 0 0 0-.667.667v3.333a.667.667 0 0 0 .196.472l2 2a.667.667 0 0 0 .943-.943L8.667 7.78V4.667A.667.667 0 0 0 8 4Z"/></svg>';
      }
      function renderPriorityBadge(kind, level) {
        const label = kind === 'importance' ? '重要度' : '緊急度';
        const normalized = normalizePriorityLevel(level);
        const title = `${label}: ${priorityLabel(normalized)}`;
        return `<span class="tb-priority-badge ${priorityClass(normalized)}" data-kind="${kind}" title="${escapeAttr(title)}">${priorityIconSvg(kind, normalized)}<span class="tb-priority-text">${escapeHtml(priorityLabel(normalized))}</span></span>`;
      }
      const state = {
        open: false,
        tasks: [],
        lastFetchAt: null,
        backendBase: 'http://localhost:7777',
        lastPersistAt: null,
        backendSnapshotAt: null,
        mcpTools: [],
        saasDocs: [],
        modelOptions: MODEL_BLUEPRINTS.map(opt => ({ ...opt })),
        activeModelId: MODEL_BLUEPRINTS[0]?.id || null,
        heatmapCollapsed: true,
        heatmapSelection: null,
        matrixCollapsed: true,
        matrixSelection: null,
        graph3dCollapsed: true,
        graph3dViewMode: 'media',
        graph3dInfoCollapsed: true,
        composeImportance: 'medium',
        composeUrgency: 'medium',
        expandedTaskIds: new Set()
      };
      const GRAPH3D_NODE_COLORS = {
        root: '#ff4757',
        folder: '#2ed573',
        image: '#ffb84d',
        video: '#6c5ce7',
        audio: '#eccc68',
        html: '#a4b0be',
        yaml: '#6c5ce7',
        json: '#00d2d3',
        code: '#ff6b81',
        other: '#57606f',
        text: '#70a1ff',
        doc: '#2f3542'
      };
      const GRAPH3D_TYPE_LABELS = {
        root: 'ルート',
        folder: 'フォルダ',
        image: '画像',
        video: '動画',
        audio: '音声',
        html: 'HTML',
        yaml: 'YAML',
        json: 'JSON',
        code: 'コード',
        text: 'テキスト',
        doc: 'ドキュメント',
        other: 'その他'
      };
      const GRAPH3D_SEARCH_LIMIT = 50;
      const externalScriptPromises = Object.create(null);
      let graph3dInstance = null;
      let graph3dDataCache = null;
      let graph3dPinnedNode = null;
      let graph3dLoadPromise = null;
      let graph3dCanvasContainer = null;
      let graph3dResizeObserver = null;
      let bloomPassClass = null;
      let graph3dContextMenu = null;
      let graph3dModeMediaEl = null;
      let graph3dModeColorEl = null;
      let graph3dSearchInputEl = null;
      let graph3dSearchCountEl = null;
      let graph3dSearchResultsEl = null;
      let graph3dSearchMatches = [];
      let graph3dSearchMatchesTotal = 0;
      let graph3dSearchActiveIndex = -1;
      let graph3dSideEl = null;
      let graph3dInfoToggleEl = null;
      let graph3dInfoLabelEl = null;
      let graph3dInfoResizeBound = false;
      let graph3dSphereGeometry = null;
      let graph3dNodeObjectCache = new Map();
      let graph3dVideoResources = new Map();
      let graph3dActiveVideoKey = null;
      let graph3dLastCanvasSize = { width: 0, height: 0 };
      let graph3dHasInitialFit = false;
      let graph3dAutoFitLocked = false;
      const taskLogsCache = Object.create(null);
      let modelToggleEl = null;
      let syncStatusEl = null;
      const decoder = typeof window.TextDecoder !== 'undefined' ? new TextDecoder() : null;
      const MARKDOWN_INLINE_BOLD = /\*\*([^*]+)\*\*/g;
      const MARKDOWN_INLINE_EM = /\*([^*]+)\*/g;
      const MARKDOWN_INLINE_CODE = /`([^`]+)`/g;
      const MARKDOWN_INLINE_LINK = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
      const HEATMAP_DAY_SPAN = 14;
      const HOURS_IN_DAY = 24;
      const HEATMAP_HOURS = Array.from({ length: HOURS_IN_DAY }, (_, i) => i);
      const TASK_TIMEZONE = 'Asia/Tokyo';
      const dayKeyFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: TASK_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      const dayLabelFormatter = new Intl.DateTimeFormat('ja-JP', {
        timeZone: TASK_TIMEZONE,
        month: 'numeric',
        day: 'numeric'
      });
      const weekdayFormatter = new Intl.DateTimeFormat('ja-JP', {
        timeZone: TASK_TIMEZONE,
        weekday: 'short'
      });
      const hourExtractFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: TASK_TIMEZONE,
        hour: '2-digit',
        hour12: false
      });
      const syncTimeFormatter = new Intl.DateTimeFormat('ja-JP', {
        timeZone: TASK_TIMEZONE,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });

      function formatSyncTime(iso){
        if (!iso) return null;
        try {
          const date = new Date(iso);
          if (Number.isNaN(date.getTime())) return null;
          return syncTimeFormatter.format(date);
        } catch (_err) {
          return null;
        }
      }

      function buildSyncStatusMessage(){
        const backendTime = formatSyncTime(state.backendSnapshotAt);
        if (backendTime) return `サーバー ${backendTime}`;
        return '';
      }

      function updateSyncStatusFromState(variant = 'info', overrideMessage = null){
        if (!syncStatusEl) return;
        const message = overrideMessage == null ? buildSyncStatusMessage() : overrideMessage;
        syncStatusEl.textContent = message || '';
        syncStatusEl.classList.remove('info','success','error');
        const applied = variant || 'info';
        syncStatusEl.classList.add(applied);
        const hidden = !message;
        syncStatusEl.setAttribute('aria-hidden', hidden ? 'true' : 'false');
        syncStatusEl.style.display = hidden ? 'none' : '';
      }

      function buildBackendWebSocketUrl(base, path) {
        const trimmedPath = path.startsWith('/') ? path : `/${path}`;
        try {
          const baseStr = typeof base === 'string' ? base.trim() : '';
          const combined = baseStr ? `${baseStr.replace(/\/$/, '')}${trimmedPath}` : trimmedPath;
          const url = new URL(combined, window.location.origin);
          if (url.protocol === 'http:') url.protocol = 'ws:';
          else if (url.protocol === 'https:') url.protocol = 'wss:';
          url.search = '';
          url.hash = '';
          return url.toString();
        } catch (err) {
          const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
          return `${proto}//${window.location.host}${trimmedPath}`;
        }
      }

      function createTerminalManager() {
        let overlay = null;
        let titleEl = null;
        let outputEl = null;
        let inputEl = null;
        let sendBtn = null;
        let ctrlCBtn = null;
        let attachBtn = null;
        let ws = null;
        let sessionId = null;
        let isReady = false;
        let outputLines = [];
        let currentLine = '';
        let pendingQueue = [];
        let pendingInitialInput = '';
        let currentCommand = '';
        let pendingSendQueue = [];
        let imeComposing = false;
        let imePendingEnter = false;

        const ANSI_OSC_REGEX = /\u001B\][^\u0007]*\u0007/g;
        const ANSI_ESCAPE_REGEX = /\u001B(?:[@-Z\\-_]|\[[0-9;?]*[ -\/]*[0-~])/g;
        const CONTROL_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

        function normalizeTerminalOutput(text) {
          if (!text) return '';
          let result = text.replace(/\r\n/g, '\n');
          result = result.replace(ANSI_OSC_REGEX, '');
          result = result.replace(ANSI_ESCAPE_REGEX, '');
          result = result.replace(CONTROL_REGEX, '');
          return result;
        }

        function trimOutput(maxChars = 60000) {
          let total = currentLine.length;
          for (let i = 0; i < outputLines.length; i += 1) {
            total += outputLines[i].length + 1;
          }
          while (total > maxChars && outputLines.length) {
            const removed = outputLines.shift();
            total -= removed.length + 1;
          }
          if (total > maxChars) {
            const excess = total - maxChars;
            currentLine = currentLine.slice(excess);
          }
        }

        function commitLine(line) {
          if (line == null) return;
          outputLines.push(String(line));
          trimOutput();
          renderOutput();
        }

        function renderOutput() {
          if (!outputEl) return;
          const buffer = currentLine ? [...outputLines, currentLine] : outputLines.slice();
          outputEl.textContent = buffer.join('\n');
          outputEl.scrollTop = outputEl.scrollHeight;
        }


        function ensureOverlay() {
          if (overlay) return;
          overlay = document.createElement('div');
          overlay.id = 'ptyTerminalOverlay';
          overlay.className = 'pty-terminal-overlay';
          overlay.setAttribute('role', 'dialog');
          overlay.setAttribute('aria-modal', 'true');
          overlay.innerHTML = `
            <div class="pty-terminal" role="document">
              <div class="pty-terminal-header">
                <div class="pty-terminal-title" data-role="title">@claude</div>
                <div class="pty-terminal-actions">
                  <button type="button" class="pty-terminal-btn" data-action="ctrl-c" title="Ctrl+C">Ctrl+C</button>
                  <button type="button" class="pty-terminal-btn" data-action="attach" title="iTermで開く">iTerm</button>
                  <button type="button" class="pty-terminal-btn" data-action="close" title="閉じる">×</button>
                </div>
              </div>
              <div class="pty-terminal-body">
                <div class="pty-terminal-output" data-role="output" tabindex="0"></div>
              </div>
              <div class="pty-terminal-input-row">
                <div class="pty-terminal-input-col">
                  <textarea class="pty-terminal-input" data-role="input" rows="2" placeholder="メッセージを入力し Enter で送信 (Shift+Enter で改行)" autocomplete="off"></textarea>
                  <div class="pty-terminal-shortcuts" data-role="shortcuts">⏎ send ・ ⌃J newline ・ ⌃T transcript ・ ⌃C quit</div>
                </div>
                <button type="button" class="pty-terminal-send" data-action="send">送信</button>
              </div>
            </div>
          `;
          document.body.appendChild(overlay);

          titleEl = overlay.querySelector('[data-role="title"]');
          outputEl = overlay.querySelector('[data-role="output"]');
          inputEl = overlay.querySelector('[data-role="input"]');
          sendBtn = overlay.querySelector('[data-action="send"]');
          ctrlCBtn = overlay.querySelector('[data-action="ctrl-c"]');
          attachBtn = overlay.querySelector('[data-action="attach"]');
          const shortcutsEl = overlay.querySelector('[data-role="shortcuts"]');
          if (shortcutsEl) shortcutsEl.setAttribute('aria-hidden', 'true');

          const isPlainEnter = (event) => {
            return event.key === 'Enter' && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey;
          };

          const submitInputFromTextarea = () => {
            if (!inputEl) return;
            const value = inputEl.value;
            if (!value.trim()) {
              imePendingEnter = false;
              return;
            }
            inputEl.value = '';
            imePendingEnter = false;
            sendInputValue(value);
          };

          if (inputEl) {
            inputEl.addEventListener('compositionstart', () => {
              imeComposing = true;
              imePendingEnter = false;
            });
            
            const handleCompositionDone = () => {
              imeComposing = false;
              // IME確定後、わずかな遅延を置いてからEnterキーの状態を確認
              setTimeout(() => {
                if (imePendingEnter) {
                  submitInputFromTextarea();
                  imePendingEnter = false;
                }
              }, 50); // ブラウザがIME確定を完全に処理するための遅延
            };
            
            inputEl.addEventListener('compositionend', handleCompositionDone);
            
            inputEl.addEventListener('compositioncancel', () => {
              imeComposing = false;
              imePendingEnter = false;
            });
          }

          const closeBtn = overlay.querySelector('[data-action="close"]');
          closeBtn?.addEventListener('click', () => closeOverlay());
          overlay.addEventListener('mousedown', (e) => {
            if (e.target === overlay) {
              e.preventDefault();
              closeOverlay();
            }
          });

          ctrlCBtn?.addEventListener('click', () => {
            if (!ws || ws.readyState !== WebSocket.OPEN) return;
            try {
              const ctrlC = window.btoa(String.fromCharCode(3));
              queueOrSend({ type: 'input', base64: ctrlC });
              setStatus('Ctrl+C を送信しました', 'info');
            } catch (err) {
              console.warn('Failed to send Ctrl+C', err);
            }
          });

          attachBtn?.addEventListener('click', () => {
            if (!attachBtn) return;
            attachBtn.disabled = true;
            Promise.resolve(requestItermAttach())
              .catch(() => {})
              .finally(() => { attachBtn.disabled = false; });
          });

          sendBtn?.addEventListener('click', () => {
            if (!inputEl) return;
            submitInputFromTextarea();
          });

          inputEl?.addEventListener('keydown', (e) => {
            if (imeComposing) {
              if (isPlainEnter(e)) {
                imePendingEnter = true;
              }
              return;
            }
            if (isPlainEnter(e)) {
              e.preventDefault();
              submitInputFromTextarea();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              closeOverlay();
            }
          });

          inputEl?.addEventListener('keyup', (e) => {
            // IME処理が完了していない場合でも、keyupでEnterが検出されたら処理
            if (!imeComposing && imePendingEnter && isPlainEnter(e)) {
              e.preventDefault();
              imePendingEnter = false;
              submitInputFromTextarea();
            }
            // IMEを使用していない場合でも、Enterキーのkeyupを処理（フォールバック）
            else if (!imeComposing && isPlainEnter(e) && inputEl.value.trim()) {
              // keydownイベントを逃した場合のフォールバック
              e.preventDefault();
              submitInputFromTextarea();
            }
          });

          document.addEventListener('keydown', (e) => {
            if (!overlay.classList.contains('visible')) return;
            if (e.key === 'Escape') {
              e.preventDefault();
              closeOverlay();
            }
          });
        }

        function setStatus(text, variant = 'info') {
          const message = text ? String(text).trim() : '';
          if (!message) return;
          commitLine(`Status: ${message}`);
        }

        async function requestItermAttach() {
          try {
            const backendBase = await probeBackendBase();
            if (!backendBase) {
              throw new Error('backend_unreachable');
            }
            const endpoint = `${backendBase.replace(/\/$/, '')}/api/pty/open-iterm`;
            const res = await fetch(endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' }
            });
            let payload = null;
            const contentType = res.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
              try {
                payload = await res.json();
              } catch (_) {
                payload = null;
              }
            } else {
              try {
                payload = await res.text();
              } catch (_) {
                payload = null;
              }
            }
            if (!res.ok || (payload && payload.success === false)) {
              const detail = payload && typeof payload === 'object' && payload !== null
                ? (payload.error || payload.message)
                : null;
              throw new Error(detail || `HTTP ${res.status}`);
            }
            setStatus('iTerm を起動しました', 'success');
          } catch (err) {
            console.warn('Failed to open iTerm from terminal overlay', err);
            setStatus('iTerm の起動に失敗しました', 'error');
            throw err;
          }
        }

        function clearOutput() {
          outputLines = [];
          currentLine = '';
          renderOutput();
        }

        function appendOutput(rawText) {
          if (!outputEl) return;
          const chunk = normalizeTerminalOutput(String(rawText || ''));
          if (!chunk) return;
          for (let i = 0; i < chunk.length; i += 1) {
            const ch = chunk[i];
            if (ch === '\r') {
              currentLine = '';
              continue;
            }
            if (ch === '\n') {
              commitLine(currentLine);
              currentLine = '';
              continue;
            }
            currentLine += ch;
          }
          trimOutput();
          renderOutput();
        }

        function decodeBase64ToText(value) {
          if (typeof value !== 'string' || !value) return '';
          try {
            const binary = window.atob(value);
            if (!decoder) return binary;
            const len = binary.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i += 1) bytes[i] = binary.charCodeAt(i);
            return decoder.decode(bytes);
          } catch (err) {
            console.warn('Failed to decode base64 payload', err);
            return '';
          }
        }

        function queueOrSend(payload) {
          if (!ws || ws.readyState !== WebSocket.OPEN) {
            pendingQueue.push(payload);
            return;
          }
          try {
            ws.send(JSON.stringify(payload));
          } catch (err) {
            console.warn('Failed to send payload through WebSocket', err);
          }
        }

        function flushPending() {
          if (!ws || ws.readyState !== WebSocket.OPEN) return;
          while (pendingQueue.length) {
            const payload = pendingQueue.shift();
            try {
              ws.send(JSON.stringify(payload));
            } catch (err) {
              console.warn('Failed to flush pending payload', err);
              break;
            }
          }
        }

        function closeConnection({ notifyServer = true } = {}) {
          if (!ws) return;
          try {
            if (notifyServer && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'close' }));
            }
          } catch (_) {}
          try {
            ws.close();
          } catch (_) {}
          ws = null;
          sessionId = null;
          isReady = false;
          pendingQueue = [];
          pendingSendQueue = [];
        }

        function closeOverlay() {
          if (!overlay) return;
          overlay.classList.remove('visible');
          closeConnection({ notifyServer: true });
        }

        function handleSocketMessage(message) {
          if (!message || typeof message !== 'object') return;
          switch (message.type) {
            case 'starting':
              sessionId = message.sessionId || sessionId;
              appendOutput(`\n[server] starting ${message.command || ''} ${Array.isArray(message.args) ? message.args.join(' ') : ''}\n`);
              setStatus('セッションを起動しています...', 'info');
              break;
            case 'ready':
              sessionId = message.sessionId || sessionId;
              isReady = true;
              setStatus('ターミナルの準備が整いました', 'success');
              if (inputEl) {
                inputEl.disabled = false;
                inputEl.focus();
              }
              if (sendBtn) sendBtn.disabled = false;
              if (ctrlCBtn) ctrlCBtn.disabled = false;
              flushPending();
              if (pendingInitialInput && pendingInitialInput.trim()) {
                // まずプロンプトを送信（改行なし）
                queueOrSend({ type: 'input', data: pendingInitialInput, appendNewline: false });
                pendingInitialInput = '';
                flushPending();
                
                // 2秒後から開始し、1秒間隔で2回だけ、エンターと空白を送信
                let attemptCount = 0;
                const maxAttempts = 2;
                
                // 2秒待ってから開始
                setTimeout(() => {
                  const sendEnterLoop = setInterval(() => {
                    if (!isReady || !sessionId) {
                      clearInterval(sendEnterLoop);
                      return;
                    }
                    
                    attemptCount++;
                    console.log(`[Terminal] Attempt ${attemptCount}/2: Sending enter/newline...`);
                    
                    // 様々な方法で改行を送信
                    queueOrSend({ type: 'input', data: '', appendNewline: true }); // 空文字列 + 改行
                    queueOrSend({ type: 'input', data: '\n', appendNewline: false }); // LF
                    queueOrSend({ type: 'input', data: '\r', appendNewline: false }); // CR
                    queueOrSend({ type: 'input', data: ' ', appendNewline: false }); // スペース
                    
                    setStatus(`改行送信中... (${attemptCount}/${maxAttempts})`, 'info');
                    
                    if (attemptCount >= maxAttempts) {
                      clearInterval(sendEnterLoop);
                      setStatus('改行送信完了', 'success');
                      console.log('[Terminal] Completed 2 attempts of sending enter/newline');
                    }
                  }, 1000); // 1秒間隔
                }, 2000); // 2秒待ってから開始
              }
              if (pendingSendQueue.length) {
                pendingSendQueue.forEach(value => {
                  queueOrSend({ type: 'input', data: value, appendNewline: !value.endsWith('\n') && !value.endsWith('\r') });
                });
                pendingSendQueue = [];
                flushPending();
              }
              break;
            case 'output':
              if (typeof message.data === 'string' && message.data) {
                const text = decodeBase64ToText(message.data);
                if (text) appendOutput(text);
              }
              break;
            case 'error':
              setStatus(message.message || 'エラーが発生しました', 'error');
              appendOutput(`\n[error] ${message.message || '未知のエラー'}\n`);
              break;
            case 'exit':
              setStatus(`プロセスが終了しました (code=${message.exitCode ?? 'null'}${message.signal != null ? `, signal=${message.signal}` : ''})`, 'info');
              if (inputEl) inputEl.disabled = true;
              if (sendBtn) sendBtn.disabled = true;
              if (ctrlCBtn) ctrlCBtn.disabled = true;
              break;
            case 'pong':
              break;
            default:
              console.log('Unhandled PTY message', message);
          }
        }

        function sendInputValue(value) {
          if (!value) return;
          if (!isReady) {
            pendingSendQueue.push(value);
            setStatus('待機中: セッション準備後に送信されます', 'info');
            commitLine(`[you] ${value}`);
            trimOutput();
            renderOutput();
            return;
          }
          commitLine(`[you] ${value}`);
          trimOutput();
          renderOutput();
          queueOrSend({ type: 'input', data: value, appendNewline: !value.endsWith('\n') && !value.endsWith('\r') });
        }

        async function open(command, options = {}) {
          ensureOverlay();
          overlay.classList.add('visible');
          imeComposing = false;
          imePendingEnter = false;
          currentCommand = command;
          pendingInitialInput = typeof options.initialInput === 'string' ? options.initialInput.trim() : '';
          pendingQueue = [];
          pendingSendQueue = [];
          isReady = false;
          if (inputEl) {
            inputEl.value = '';
            inputEl.disabled = true;
          }
          if (sendBtn) sendBtn.disabled = true;
          if (ctrlCBtn) ctrlCBtn.disabled = true;
          clearOutput();
          appendOutput(`[client] Connecting to @${command}...\n`);
          setStatus('バックエンドと接続中...', 'info');
          closeConnection({ notifyServer: true });

          if (titleEl) titleEl.textContent = `@${command}`;

          try {
            const backendBase = await probeBackendBase();
            const wsUrl = buildBackendWebSocketUrl(backendBase, '/ws/pty');
            ws = new WebSocket(wsUrl);
            ws.addEventListener('open', () => {
              const payload = {
                type: 'start',
                command,
                args: Array.isArray(options.args) ? options.args : undefined,
                model: options.model,
                profile: options.profile,
                sandbox: options.sandbox,
                skipGitCheck: options.skipGitCheck,
                mcpConfigPath: options.mcpConfigPath,
                configOverrides: options.configOverrides,
                subcommand: options.subcommand
              };
              Object.keys(payload).forEach((key) => {
                if (payload[key] === undefined || payload[key] === null) delete payload[key];
              });
              try {
                ws.send(JSON.stringify(payload));
              } catch (err) {
                setStatus('セッション開始要求の送信に失敗しました', 'error');
              }
            });
            ws.addEventListener('message', (event) => {
              try {
                const data = typeof event.data === 'string' ? event.data : decoder ? decoder.decode(event.data) : String(event.data);
                const message = JSON.parse(data);
                handleSocketMessage(message);
              } catch (err) {
                console.warn('Failed to parse WebSocket message', err);
              }
            });
            ws.addEventListener('error', () => {
              setStatus('WebSocketエラーが発生しました', 'error');
              appendOutput('\n[error] WebSocket error\n');
            });
            ws.addEventListener('close', (event) => {
              const code = event && typeof event.code === 'number' ? event.code : 0;
              const reason = event && typeof event.reason === 'string' && event.reason ? ` (${event.reason})` : '';
              setStatus(code === 1000 ? 'セッションが終了しました' : `接続が終了しました (code ${code})${reason}`, code === 1000 ? 'info' : 'error');
              if (inputEl) inputEl.disabled = true;
              if (sendBtn) sendBtn.disabled = true;
              if (ctrlCBtn) ctrlCBtn.disabled = true;
              ws = null;
            });
          } catch (err) {
            setStatus('WebSocket接続に失敗しました', 'error');
            appendOutput(`\n[error] ${err && err.message ? err.message : err}\n`);
          }
        }

        return {
          open,
          close: closeOverlay
        };
      }

      const terminalManager = createTerminalManager();

      function formatDayKey(date) {
        return dayKeyFormatter.format(date);
      }

      function formatDayLabel(date) {
        return `${dayLabelFormatter.format(date)} (${weekdayFormatter.format(date)})`;
      }

      function formatHourLabel(hour) {
        return `${String(hour).padStart(2, '0')}時`;
      }

      function deriveHourIndex(date) {
        if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
        try {
          const hourStr = hourExtractFormatter.format(date);
          const digitMatch = hourStr.match(/\d+/);
          if (!digitMatch) return date.getUTCHours();
          const hour = Number(digitMatch[0]);
          if (!Number.isFinite(hour)) return date.getUTCHours();
          return hour % 24;
        } catch (_) {
          return date.getUTCHours();
        }
      }

      function buildHeatmapData() {
        const tasks = Array.isArray(state.tasks) ? state.tasks : [];
        const now = new Date();
        const days = [];
        const matrix = new Map();
        const dayKeySet = new Set();

        for (let offset = 0; offset < HEATMAP_DAY_SPAN; offset += 1) {
          const dayDate = new Date(now.getTime() - offset * 86400000);
          const key = formatDayKey(dayDate);
          if (dayKeySet.has(key)) continue;
          dayKeySet.add(key);
          days.push({ key, label: formatDayLabel(dayDate), timestamp: dayDate.getTime() });
          matrix.set(key, Array(HOURS_IN_DAY).fill(0));
        }

        days.sort((a, b) => a.timestamp - b.timestamp);

        let maxCount = 0;
        let totalInRange = 0;
        tasks.forEach(task => {
          if (!task) return;
          const source = task.createdAt || task.updatedAt || task.endedAt;
          if (!source) return;
          const ts = new Date(source);
          if (Number.isNaN(ts.getTime())) return;
          const key = formatDayKey(ts);
          const row = matrix.get(key);
          if (!row) return;
          const hour = deriveHourIndex(ts);
          if (hour == null) return;
          row[hour] += 1;
          totalInRange += 1;
          if (row[hour] > maxCount) maxCount = row[hour];
        });

        return {
          days,
          matrix,
          maxCount,
          totalInRange
        };
      }

      function computeHeatLevel(count, maxCount) {
        if (!count || maxCount <= 0) return 0;
        const ratio = count / maxCount;
        if (ratio >= 0.75) return 4;
        if (ratio >= 0.5) return 3;
        if (ratio >= 0.25) return 2;
        return 1;
      }

      function renderHeatmapLegend(maxCount) {
        if (!heatmapLegendEl) return;
        if (maxCount <= 0) {
          heatmapLegendEl.innerHTML = '<span class="tb-heatmap-legend-label">データなし</span>';
          return;
        }
        const items = [
          { level: 0, label: '0件' },
          { level: 1, label: '少ない' },
          { level: 2, label: 'やや多い' },
          { level: 3, label: '多い' },
          { level: 4, label: `最多 (${maxCount}件)` }
        ];
        const html = items.map(item => {
          return `<span class="tb-heatmap-legend-item"><span class="tb-heatmap-swatch" data-level="${item.level}"></span>${escapeHtml(item.label)}</span>`;
        }).join('');
        heatmapLegendEl.innerHTML = html;
      }

      function renderHeatmap() {
        if (!heatmapEl) return;
      heatmapEl.classList.toggle('collapsed', !!state.heatmapCollapsed);
      heatmapEl.style.display = state.heatmapCollapsed ? 'none' : '';
      if (heatmapLegendEl) {
        heatmapLegendEl.style.display = state.heatmapCollapsed ? 'none' : '';
      }
      updateHeatmapToggleLabel();
      if (state.heatmapCollapsed) {
        heatmapEl.innerHTML = '';
        updateViewMode();
        return;
      }
        const { days, matrix, maxCount, totalInRange } = buildHeatmapData();
        if (!days.length) {
          heatmapEl.innerHTML = '<div class="tb-heatmap-empty">データが見つかりませんでした</div>';
          renderHeatmapLegend(0);
          return;
        }
        if (totalInRange === 0) {
          heatmapEl.innerHTML = '<div class="tb-heatmap-empty">直近14日間のタスクがありません</div>';
          renderHeatmapLegend(0);
          return;
        }

        const hoursColumn = ['<div class="tb-heatmap-hours-header">時間</div>'];
        HEATMAP_HOURS.forEach(hour => {
          hoursColumn.push(`<div class="tb-heatmap-hour-cell" data-hour="${hour}">${escapeHtml(formatHourLabel(hour))}</div>`);
        });

        let gridHtml = `<div class="tb-heatmap-grid" style="--heatmap-days:${days.length};">`;
        gridHtml += days.map(dayInfo => `<div class="tb-heatmap-day" data-day="${dayInfo.key}">${escapeHtml(dayInfo.label)}</div>`).join('');

        HEATMAP_HOURS.forEach(hour => {
          days.forEach(dayInfo => {
            const row = matrix.get(dayInfo.key) || [];
            const count = row[hour] || 0;
            const level = computeHeatLevel(count, maxCount);
            const hourLabel = formatHourLabel(hour);
            const tooltip = `${dayInfo.label} ${hourLabel}: ${count}件`;
            gridHtml += `<div class="tb-heatmap-value" data-level="${level}" data-count="${count}" data-day="${escapeAttr(dayInfo.key)}" data-day-label="${escapeAttr(dayInfo.label)}" data-hour="${hour}" data-hour-label="${escapeAttr(hourLabel)}" title="${escapeHtml(tooltip)}"><span>${count ? count : ''}</span></div>`;
          });
        });
        gridHtml += '</div>';

        heatmapEl.innerHTML = `
          <div class="tb-heatmap-wrapper">
            <div class="tb-heatmap-hours-column">${hoursColumn.join('')}</div>
            <div class="tb-heatmap-scroll">${gridHtml}</div>
          </div>
        `;
        renderHeatmapLegend(maxCount);

        const activeKey = state.heatmapSelection ? `${state.heatmapSelection.dayKey}:${state.heatmapSelection.hour}` : null;
        const values = heatmapEl.querySelectorAll('.tb-heatmap-value');
        values.forEach(cell => {
          const dayKey = cell.getAttribute('data-day') || '';
          const dayLabel = cell.getAttribute('data-day-label') || '';
          const hourValue = Number(cell.getAttribute('data-hour'));
          const hourLabel = cell.getAttribute('data-hour-label') || '';
          const count = Number(cell.getAttribute('data-count')) || 0;
          const cellKey = `${dayKey}:${hourValue}`;
          const isActive = activeKey === cellKey;
          cell.classList.toggle('selected', isActive);
          cell.setAttribute('aria-pressed', isActive ? 'true' : 'false');
          cell.setAttribute('role', 'button');
          cell.setAttribute('tabindex', count > 0 ? '0' : '-1');
          const fallbackHour = Number.isInteger(hourValue) ? formatHourLabel(hourValue) : '';
          const ariaLabelParts = [];
          if (dayLabel || dayKey) ariaLabelParts.push(dayLabel || dayKey);
          if (hourLabel || fallbackHour) ariaLabelParts.push(hourLabel || fallbackHour);
          ariaLabelParts.push(`${count}件`);
          cell.setAttribute('aria-label', ariaLabelParts.join(' '));
          const activate = (evt) => {
            evt.preventDefault();
            toggleHeatmapSelection(dayKey, hourValue, dayLabel, hourLabel, count);
          };
          cell.addEventListener('click', activate);
          cell.addEventListener('keydown', (evt) => {
            if (evt.key === 'Enter' || evt.key === ' ') {
              activate(evt);
            }
          });
        });

        requestAnimationFrame(() => {
          const scrollWrap = heatmapEl.querySelector('.tb-heatmap-scroll');
          if (!scrollWrap) return;
          scrollWrap.scrollLeft = scrollWrap.scrollWidth;
        });
      updateViewMode();
      }

      function updateHeatmapToggleLabel() {
        if (!heatmapToggleEl) return;
        heatmapToggleEl.textContent = 'ヒートマップ';
        heatmapToggleEl.setAttribute('aria-expanded', state.heatmapCollapsed ? 'false' : 'true');
        heatmapToggleEl.classList.toggle('is-active', !state.heatmapCollapsed);
      }

    function setHeatmapCollapsed(nextValue) {
      const next = !!nextValue;
      if (state.heatmapCollapsed === next) return;
      if (!next) {
        if (!state.matrixCollapsed) {
          setMatrixCollapsed(true);
        }
        if (!state.graph3dCollapsed) {
          setGraph3dCollapsed(true);
        }
      }
      state.heatmapCollapsed = next;
      updateHeatmapToggleLabel();
      renderHeatmap();
      if (!next) setOpen(true);
      schedulePersist();
    }

    function setHeatmapSelection(nextSelection) {
      let normalized = null;
      if (nextSelection && typeof nextSelection === 'object') {
          const { dayKey, hour, dayLabel, hourLabel } = nextSelection;
          if (typeof dayKey === 'string' && dayKey.trim() !== '' && Number.isFinite(Number(hour))) {
            const hourNum = Number(hour);
            if (Number.isInteger(hourNum) && hourNum >= 0 && hourNum < 24) {
              normalized = {
                dayKey: dayKey.trim(),
                hour: hourNum,
                dayLabel: typeof dayLabel === 'string' ? dayLabel : null,
                hourLabel: typeof hourLabel === 'string' ? hourLabel : null
              };
            }
          }
        }
        const prevKey = state.heatmapSelection ? `${state.heatmapSelection.dayKey}:${state.heatmapSelection.hour}` : null;
        const nextKey = normalized ? `${normalized.dayKey}:${normalized.hour}` : null;
        if (prevKey === nextKey) {
          if (!normalized && !state.heatmapSelection) return;
          if (normalized && state.heatmapSelection) {
            // Even if the key matches, update labels in case they changed
            state.heatmapSelection = normalized;
            schedulePersist();
            return;
          }
        }
      state.heatmapSelection = normalized;
      render();
      schedulePersist();
    }

    function updateViewMode() {
      const heatmapActive = !state.heatmapCollapsed;
      const matrixActive = !state.matrixCollapsed;
      const graph3dActive = !state.graph3dCollapsed;
      if (heatmapEl) {
        heatmapEl.style.display = heatmapActive ? '' : 'none';
      }
      if (matrixEl) {
        matrixEl.style.display = matrixActive ? '' : 'none';
      }
      if (graph3dEl) {
        graph3dEl.style.display = graph3dActive ? '' : 'none';
        graph3dEl.classList.toggle('collapsed', !graph3dActive);
      }
      if (analyticsEl) {
        const show = heatmapActive || matrixActive || graph3dActive;
        analyticsEl.style.display = show ? '' : 'none';
        analyticsEl.classList.toggle('collapsed', !show);
      }
      if (listEl) {
        listEl.classList.remove('is-hidden');
      }
      if (composeEl) {
        composeEl.classList.remove('is-hidden');
      }
    }

    function setMatrixSelection(nextSelection, options = {}) {
      const { silent = false } = options || {};
      let normalized = null;
      if (nextSelection && typeof nextSelection === 'object') {
        normalized = {
          importance: normalizePriorityLevel(nextSelection.importance, 'medium'),
          urgency: normalizePriorityLevel(nextSelection.urgency, 'medium')
        };
      }
      const prev = state.matrixSelection
        ? {
            importance: normalizePriorityLevel(state.matrixSelection.importance, 'medium'),
            urgency: normalizePriorityLevel(state.matrixSelection.urgency, 'medium')
          }
        : null;
      const changed = !!(prev?.importance !== normalized?.importance || prev?.urgency !== normalized?.urgency);
      if (!changed && prev && normalized) {
        if (!silent) render();
        return;
      }
      state.matrixSelection = normalized;
      schedulePersist();
      if (!silent) {
        render();
      }
    }

    function clearMatrixSelection(options = {}) {
      if (!state.matrixSelection) return;
      setMatrixSelection(null, options);
    }

    function isMatrixTargetTask(task) {
      if (!task) return false;
      if (task.manualDone) return false;
      const status = (task.status || '').toLowerCase();
      if (status === 'completed') return false;
      return true;
    }

    function buildPriorityMatrixData() {
      const buckets = new Map();
      PRIORITY_ROW_ORDER.forEach(importance => {
        PRIORITY_COL_ORDER.forEach(urgency => {
          buckets.set(`${importance}:${urgency}`, []);
        });
      });
      const candidates = Array.isArray(state.tasks) ? state.tasks.filter(isMatrixTargetTask) : [];
      candidates.forEach(task => {
        const importance = normalizePriorityLevel(task.importance, 'medium');
        const urgency = normalizePriorityLevel(task.urgency, 'medium');
        const key = `${importance}:${urgency}`;
        const list = buckets.get(key);
        if (list) list.push(task);
      });
      buckets.forEach((list, key) => {
        list.sort((a, b) => {
          const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
          const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
          return bTime - aTime;
        });
      });
      return { buckets, total: candidates.length };
    }

    function matchesMatrixSelection(task) {
      if (!state.matrixSelection) return true;
      const imp = normalizePriorityLevel(task.importance, 'medium');
      const urg = normalizePriorityLevel(task.urgency, 'medium');
      return imp === state.matrixSelection.importance && urg === state.matrixSelection.urgency;
    }

    function matrixChipSvg(statusKey) {
      const palette = {
        doing: '#3b82f6',
        done: '#22c55e',
        todo: '#94a3b8',
        working: '#f97316',
        waiting: '#facc15',
        idle: '#0ea5e9'
      };
      const fill = palette[statusKey] || palette.todo;
      return `<svg class="tb-chip-svg" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><rect x="2" y="3" width="12" height="10" rx="2" fill="${fill}"/><rect x="4" y="6" width="8" height="1.4" rx="0.7" fill="rgba(255,255,255,0.85)"/><rect x="4" y="8.5" width="5" height="1.2" rx="0.6" fill="rgba(255,255,255,0.7)"/></svg>`;
    }

    function renderMatrixCell(tasks, importance, urgency) {
      const list = Array.isArray(tasks) ? tasks : [];
      const count = list.length;
      const title = `重要度 ${priorityLabel(importance)} / 緊急度 ${priorityLabel(urgency)} / ${count}件`;
      const chipLimit = 2;
      const chips = [];
      for (let i = 0; i < Math.min(count, chipLimit); i += 1) {
        const task = list[i];
        const fullPreview = getPromptPreview(task, 48) || (task.prompt || '(内容なし)');
        const statusKey = cssStatus(task.status || 'pending');
        chips.push(`<span class="tb-matrix-chip status-${escapeAttr(statusKey)}" data-id="${escapeAttr(String(task.id))}" title="${escapeAttr(fullPreview)}" aria-label="${escapeAttr(fullPreview)}" role="button" tabindex="0">${matrixChipSvg(statusKey)}</span>`);
      }
      if (count > chipLimit) {
        chips.push(`<span class="tb-matrix-chip tb-matrix-chip-more" aria-label="追加${count - chipLimit}件" title="追加${count - chipLimit}件" role="presentation">+${count - chipLimit}</span>`);
      }

      const chipHtml = chips.length
        ? `<div class="tb-matrix-chip-row">${chips.join('')}</div>`
        : '<div class="tb-matrix-placeholder">タスクなし</div>';
      const isSelected = state.matrixSelection
        && state.matrixSelection.importance === importance
        && state.matrixSelection.urgency === urgency;
      const cellClasses = `tb-matrix-cell importance-${importance} urgency-${urgency}${isSelected ? ' is-selected' : ''}`;
      return `
        <div class="${cellClasses}" data-importance="${importance}" data-urgency="${urgency}" title="${escapeHtml(title)}" role="button" tabindex="0" aria-pressed="${isSelected ? 'true' : 'false'}">
          <div class="tb-matrix-cell-count">${count}</div>
          ${chipHtml}
        </div>
      `;
    }

    function renderPriorityMatrix() {
      if (!matrixEl) return;
      matrixEl.classList.toggle('collapsed', !!state.matrixCollapsed);
      updateMatrixToggleLabel();
      matrixEl.style.display = state.matrixCollapsed ? 'none' : '';
      if (state.matrixCollapsed) {
        matrixEl.innerHTML = '';
        updateViewMode();
        return;
      }
      const { buckets, total } = buildPriorityMatrixData();
      if (!total) {
        matrixEl.innerHTML = '<div class="tb-matrix-empty">保留中や未完了のタスクはありません</div>';
        updateViewMode();
        return;
      }
      let html = '<div class="tb-matrix-grid" role="table">';
      html += '<div class="tb-matrix-corner">優先度マップ</div>';
      PRIORITY_COL_ORDER.forEach(urgency => {
        html += `<div class="tb-matrix-col-header urgency-${urgency}">${renderPriorityBadge('urgency', urgency)}</div>`;
      });
      PRIORITY_ROW_ORDER.forEach(importance => {
        html += `<div class="tb-matrix-row-header importance-${importance}">${renderPriorityBadge('importance', importance)}</div>`;
        PRIORITY_COL_ORDER.forEach(urgency => {
          const key = `${importance}:${urgency}`;
          html += renderMatrixCell(buckets.get(key) || [], importance, urgency);
        });
      });
      html += '</div>';
      matrixEl.innerHTML = html;
      updateViewMode();
    }

    function updateMatrixToggleLabel() {
      if (!matrixToggleEl) return;
      matrixToggleEl.textContent = 'マトリクス';
      matrixToggleEl.setAttribute('aria-expanded', state.matrixCollapsed ? 'false' : 'true');
      matrixToggleEl.classList.toggle('is-active', !state.matrixCollapsed);
    }

    function setMatrixCollapsed(nextValue) {
      const next = !!nextValue;
      if (state.matrixCollapsed === next) return;
      if (!next) {
        if (!state.heatmapCollapsed) {
          setHeatmapCollapsed(true);
        }
        if (!state.graph3dCollapsed) {
          setGraph3dCollapsed(true);
        }
      }
      if (next) {
        clearMatrixSelection({ silent: true });
      }
      state.matrixCollapsed = next;
      updateMatrixToggleLabel();
      renderPriorityMatrix();
      if (!next) {
        setOpen(true);
      }
      schedulePersist();
      if (next) {
        render();
      }
    }

      function clearHeatmapSelection() {
        if (!state.heatmapSelection) return;
        state.heatmapSelection = null;
        render();
        schedulePersist();
      }

      function toggleHeatmapSelection(dayKey, hour, dayLabel, hourLabel, count) {
        if (typeof dayKey !== 'string' || dayKey.trim() === '') {
          clearHeatmapSelection();
          setHeatmapCollapsed(true);
          return;
        }
        const hourNum = Number(hour);
        if (!Number.isInteger(hourNum) || hourNum < 0 || hourNum >= 24) {
          clearHeatmapSelection();
          setHeatmapCollapsed(true);
          return;
        }
        const key = `${dayKey.trim()}:${hourNum}`;
        const activeKey = state.heatmapSelection ? `${state.heatmapSelection.dayKey}:${state.heatmapSelection.hour}` : null;
        if (activeKey === key) {
          clearHeatmapSelection();
          setHeatmapCollapsed(true);
          return;
        }
        if (Number(count) <= 0) {
          clearHeatmapSelection();
          setHeatmapCollapsed(true);
          return;
        }
        setHeatmapSelection({
          dayKey: dayKey.trim(),
          hour: hourNum,
          dayLabel: typeof dayLabel === 'string' && dayLabel ? dayLabel : null,
          hourLabel: typeof hourLabel === 'string' && hourLabel ? hourLabel : null
        });
        setHeatmapCollapsed(true);
      }

      function getTaskReferenceDate(task) {
        if (!task) return null;
        const source = task.createdAt || task.updatedAt || task.endedAt;
        if (!source) return null;
        const date = new Date(source);
        if (Number.isNaN(date.getTime())) return null;
        return date;
      }

      function matchesHeatmapSelection(task) {
        if (!state.heatmapSelection) return true;
        const date = getTaskReferenceDate(task);
        if (!date) return false;
        const dayKey = formatDayKey(date);
        if (dayKey !== state.heatmapSelection.dayKey) return false;
        const hour = deriveHourIndex(date);
        return hour === state.heatmapSelection.hour;
      }

      function formatInlineMarkdown(text) {
        let safe = escapeHtml(text);
        safe = safe.replace(MARKDOWN_INLINE_LINK, '<a href="$2" target="_blank" rel="noopener">$1</a>');
        safe = safe.replace(MARKDOWN_INLINE_CODE, '<code>$1</code>');
        safe = safe.replace(MARKDOWN_INLINE_BOLD, '<strong>$1</strong>');
        safe = safe.replace(MARKDOWN_INLINE_EM, '<em>$1</em>');
        return safe;
      }

      function markdownToHtml(text) {
        if (!text) return '';
        const lines = String(text).split(/\n/);
        const parts = [];
        let inList = false;
        let inBlockquote = false;

        const closeList = () => {
          if (inList) {
            parts.push('</ul>');
            inList = false;
          }
        };

        const closeBlockquote = () => {
          if (inBlockquote) {
            parts.push('</blockquote>');
            inBlockquote = false;
          }
        };

        for (const raw of lines) {
          const line = raw.replace(/\r$/, '');
          const trimmed = line.trim();
          if (!trimmed) {
            closeList();
            closeBlockquote();
            continue;
          }

          const claudeMatch = trimmed.match(/^\[CLAUDE CHAT\]\s*(.*)$/);
          if (claudeMatch) {
            closeList();
            closeBlockquote();
            const rest = claudeMatch[1];
            const inline = rest ? formatInlineMarkdown(rest) : '';
            parts.push(`<p><span class="log-source">[CLAUDE CHAT]</span>${inline ? ` ${inline}` : ''}</p>`);
            continue;
          }

          if (/^>\s+/.test(trimmed)) {
            closeList();
            if (!inBlockquote) {
              parts.push('<blockquote>');
              inBlockquote = true;
            }
            parts.push(`<p>${formatInlineMarkdown(trimmed.replace(/^>\s+/, ''))}</p>`);
            continue;
          } else {
            closeBlockquote();
          }

          const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
          if (headingMatch) {
            closeList();
            const level = Math.min(headingMatch[1].length, 6);
            parts.push(`<h${level}>${formatInlineMarkdown(headingMatch[2])}</h${level}>`);
            continue;
          }

          if (/^[-\*]\s+/.test(trimmed)) {
            if (!inList) {
              parts.push('<ul>');
              inList = true;
            }
            parts.push(`<li>${formatInlineMarkdown(trimmed.replace(/^[-\*]\s+/, ''))}</li>`);
            continue;
          }

          closeList();
          parts.push(`<p>${formatInlineMarkdown(trimmed)}</p>`);
        }

        closeList();
        closeBlockquote();
        return parts.join('');
      }

      function taskCacheKey(task){
        if (!task) return '';
        if (task.serverId) return String(task.serverId);
        if (task.id != null) return String(task.id);
        return '';
      }

      function expansionKeyForTask(task){
        const key = taskCacheKey(task);
        if (key) return key;
        if (task && task.id != null) return String(task.id);
        return '';
      }

      function computePromptPreview(text, limit = 12){
        if (!text) return '';
        const lines = String(text).split(/\r?\n/).map(line => line.trim()).filter(Boolean);
        const first = lines.length ? lines[0] : String(text).trim();
        if (!first) return '';
        if (first.length <= limit) return first;
        const safeLimit = Math.max(0, limit - 1);
        return `${first.slice(0, safeLimit)}…`;
      }

      function getPromptPreview(task, limit = 12){
        if (!task) return '';
        const effectiveLimit = Number.isFinite(limit) ? Math.max(1, limit) : 12;
        const raw = typeof task.promptPreview === 'string' ? task.promptPreview.trim() : '';
        if (raw) {
          return raw.length > effectiveLimit ? computePromptPreview(raw, effectiveLimit) : raw;
        }
        return computePromptPreview(task.prompt || '', effectiveLimit);
      }

      function cloneTaskForStorage(task){
        if (!task || task.id == null) return null;
        const rawLogs = Array.isArray(task.logs)
          ? task.logs
          : (typeof task.logs === 'string' ? [task.logs] : []);
        const logs = rawLogs
          .map(log => {
            const text = String(log);
            return text.length > MAX_LOG_LENGTH ? text.slice(-MAX_LOG_LENGTH) : text;
          })
          .filter(Boolean);
        return {
          id: String(task.id),
          serverId: task.serverId != null ? String(task.serverId) : null,
          status: typeof task.status === 'string' ? task.status : 'running',
          prompt: typeof task.prompt === 'string' ? task.prompt : '',
          response: typeof task.response === 'string' ? task.response : '',
          result: task.result && typeof task.result === 'object' ? task.result : (task.result ?? null),
          error: task.error == null ? null : String(task.error),
          createdAt: task.createdAt || null,
          updatedAt: task.updatedAt || null,
          model: typeof task.model === 'string' ? task.model : null,
          provider: typeof task.provider === 'string' ? task.provider : null,
          importance: normalizePriorityLevel(task.importance, 'medium'),
          urgency: normalizePriorityLevel(task.urgency, 'medium'),
          manualDone: task.manualDone ? true : false,
          externalTerminal: task.externalTerminal && task.externalTerminal.sessionId
            ? {
                sessionId: String(task.externalTerminal.sessionId),
                app: task.externalTerminal.app || null,
                command: task.externalTerminal.command || null,
                appleSessionId: task.externalTerminal.appleSessionId || null
              }
            : null,
          copyBundle: task.copyBundle && typeof task.copyBundle === 'object' ? task.copyBundle : null,
          completionSummaryPending: task.completionSummaryPending ? true : false,
          completionSummary: typeof task.completionSummary === 'string' ? task.completionSummary : '',
          codexPollingDisabled: task.codexPollingDisabled ? true : false,
          codexIdleChecks: Number.isFinite(task.codexIdleChecks) ? Math.max(0, Math.floor(task.codexIdleChecks)) : 0,
          codexHasSeenWorking: task.codexHasSeenWorking ? true : false,
          logs
        };
      }

      function hydrateCachedTask(raw){
        const record = cloneTaskForStorage(raw);
        if (!record) return null;
        return {
          id: record.id,
          serverId: record.serverId,
          status: record.status || 'running',
          prompt: record.prompt || '',
          response: record.response || '',
          result: record.result ?? null,
          error: record.error ?? null,
          createdAt: record.createdAt || null,
          updatedAt: record.updatedAt || null,
          model: record.model || null,
          provider: record.provider || null,
          importance: normalizePriorityLevel(record.importance, 'medium'),
          urgency: normalizePriorityLevel(record.urgency, 'medium'),
          manualDone: !!record.manualDone,
          externalTerminal: record.externalTerminal && record.externalTerminal.sessionId
            ? {
                sessionId: String(record.externalTerminal.sessionId),
                app: record.externalTerminal.app || null,
                command: record.externalTerminal.command || null,
                appleSessionId: record.externalTerminal.appleSessionId || null
              }
            : null,
          copyBundle: record.copyBundle && typeof record.copyBundle === 'object' ? record.copyBundle : null,
          completionSummaryPending: !!record.completionSummaryPending,
          completionSummary: typeof record.completionSummary === 'string' ? record.completionSummary : '',
          codexPollingDisabled: !!record.codexPollingDisabled,
          codexIdleChecks: Number.isFinite(record.codexIdleChecks) ? record.codexIdleChecks : 0,
          codexHasSeenWorking: !!record.codexHasSeenWorking,
          logs: Array.isArray(record.logs)
            ? record.logs.map(log => {
                const text = String(log);
                return text.length > MAX_LOG_LENGTH ? text.slice(-MAX_LOG_LENGTH) : text;
              })
            : []
        };
      }

      function cleanupTasksAndLogs(){
        const now = Date.now();
        const filtered = state.tasks.filter(task => {
          if (!task) return false;
          if (!task.createdAt) return true;
          const ts = Date.parse(task.createdAt);
          if (!Number.isFinite(ts)) return true;
          return now - ts <= MAX_TASK_AGE_MS;
        });
        state.tasks = filtered.slice(0, MAX_TASK_HISTORY);
        const keepKeys = new Set(state.tasks.map(taskCacheKey).filter(Boolean));
        const expansionKeep = new Set(state.tasks.map(expansionKeyForTask).filter(Boolean));
        Object.keys(taskLogsCache).forEach(key => {
          if (!keepKeys.has(key)) delete taskLogsCache[key];
        });
        if (state.expandedTaskIds && state.expandedTaskIds.size) {
          for (const key of Array.from(state.expandedTaskIds)) {
            if (!expansionKeep.has(key)) state.expandedTaskIds.delete(key);
          }
        }
      }

      // バックアップ機能はstorageModuleで自動的に行われる

      function persistNow(){
        try {
          const prepared = state.tasks.slice(0, MAX_TASK_HISTORY).map(cloneTaskForStorage).filter(Boolean);
          // HMR/リロード直後に空配列で上書きしないためのフェイルセーフ
          try {
            const prev = storageModule.load();
            const prevTasksLen = Array.isArray(prev && prev.tasks) ? prev.tasks.length : 0;
            if (prepared.length === 0 && prevTasksLen > 0) {
              console.warn('[TaskBoard] Skip persist: avoid overwriting non-empty snapshot with empty list');
              return;
            }
          } catch(_) {}
          const keepKeys = new Set(prepared.map(task => (task.serverId ? String(task.serverId) : String(task.id))).filter(Boolean));
          const logsPayload = {};
          keepKeys.forEach(key => {
            const value = taskLogsCache[key];
            if (typeof value === 'string' && value.trim()) {
              logsPayload[key] = value.length > MAX_LOG_LENGTH ? value.slice(-MAX_LOG_LENGTH) : value;
            }
          });
          // ログは別キーに保存してサイズ超過を避ける
          try { storageModule.saveTaskLogs(logsPayload); } catch(_) {}
          const payload = {
            open: !!state.open,
            tasks: prepared,
            backendBase: state.backendBase,
            activeModelId: state.activeModelId,
            backendSnapshotAt: state.backendSnapshotAt,
            heatmapCollapsed: !!state.heatmapCollapsed,
            heatmapSelection: state.heatmapSelection ? {
              dayKey: state.heatmapSelection.dayKey,
              hour: state.heatmapSelection.hour,
              dayLabel: state.heatmapSelection.dayLabel,
              hourLabel: state.heatmapSelection.hourLabel
            } : null,
            matrixCollapsed: !!state.matrixCollapsed,
            matrixSelection: state.matrixSelection ? {
              importance: state.matrixSelection.importance,
              urgency: state.matrixSelection.urgency
            } : null,
            graph3dCollapsed: !!state.graph3dCollapsed,
            graph3dViewMode: state.graph3dViewMode,
            graph3dInfoCollapsed: !!state.graph3dInfoCollapsed,
            composeImportance: normalizePriorityLevel(state.composeImportance, 'medium'),
            composeUrgency: normalizePriorityLevel(state.composeUrgency, 'medium')
          };
          const savedAt = storageModule.save(payload);
          if (savedAt) {
            state.lastPersistAt = savedAt;
            updateSyncStatusFromState('success');
          } else {
            updateSyncStatusFromState('error', '保存に失敗しました');
          }
        } catch(err) {
          console.warn('TaskBoard state persist failed', err);
          updateSyncStatusFromState('error', 'ローカル保存に失敗しました');
        }
      }

      function schedulePersist(){
        persistNow();
      }

      function loadPersistedState(){
        try {
          const saved = storageModule.load();
          if (!saved || typeof saved !== 'object') return;
          if (typeof saved.open === 'boolean') state.open = saved.open;
          if (typeof saved.backendBase === 'string' && saved.backendBase) {
            state.backendBase = saved.backendBase;
          }
          if (typeof saved.persistedAt === 'string' && saved.persistedAt) {
            state.lastPersistAt = saved.persistedAt;
          }
          if (typeof saved.backendSnapshotAt === 'string' && saved.backendSnapshotAt) {
            state.backendSnapshotAt = saved.backendSnapshotAt;
          }
          if (typeof saved.matrixCollapsed === 'boolean') {
            state.matrixCollapsed = saved.matrixCollapsed;
          }
          if (typeof saved.graph3dCollapsed === 'boolean') {
            state.graph3dCollapsed = saved.graph3dCollapsed;
          }
          if (typeof saved.graph3dViewMode === 'string') {
            state.graph3dViewMode = normalizeGraph3dViewMode(saved.graph3dViewMode);
          }
          if (typeof saved.graph3dInfoCollapsed === 'boolean') {
            state.graph3dInfoCollapsed = saved.graph3dInfoCollapsed;
          }
          if (saved.matrixSelection && typeof saved.matrixSelection === 'object') {
            const { importance, urgency } = saved.matrixSelection;
            if (importance && urgency) {
              state.matrixSelection = {
                importance: normalizePriorityLevel(importance, 'medium'),
                urgency: normalizePriorityLevel(urgency, 'medium')
              };
            }
          }
          if (saved.composeImportance) {
            state.composeImportance = normalizePriorityLevel(saved.composeImportance, 'medium');
          }
          if (saved.composeUrgency) {
            state.composeUrgency = normalizePriorityLevel(saved.composeUrgency, 'medium');
          }
          if (Array.isArray(saved.tasks)) {
            const revived = saved.tasks.map(hydrateCachedTask).filter(Boolean);
            if (revived.length) {
              revived.sort((a, b) => {
                const aTime = Date.parse(a.createdAt || '') || 0;
                const bTime = Date.parse(b.createdAt || '') || 0;
                return bTime - aTime;
              });
              state.tasks = revived.slice(0, MAX_TASK_HISTORY);
              state.tasks.forEach(ensureCodexMonitorState);
            }
          }
          // ログは分離キーから取り出す
          try {
            const loadedLogs = storageModule.loadTaskLogs();
            Object.entries(loadedLogs || {}).forEach(([key, value]) => {
              if (typeof value === 'string') taskLogsCache[key] = value;
            });
          } catch(_) {}
          if (typeof saved.heatmapCollapsed === 'boolean') {
            state.heatmapCollapsed = saved.heatmapCollapsed;
          }
          if (saved.heatmapSelection && typeof saved.heatmapSelection === 'object') {
            const { dayKey, hour, dayLabel, hourLabel } = saved.heatmapSelection;
            if (typeof dayKey === 'string' && dayKey && Number.isInteger(Number(hour))) {
              state.heatmapSelection = {
                dayKey,
                hour: Number(hour),
                dayLabel: typeof dayLabel === 'string' ? dayLabel : null,
                hourLabel: typeof hourLabel === 'string' ? hourLabel : null
              };
            }
          }
          if (typeof saved.activeModelId === 'string' && saved.activeModelId) {
            state.activeModelId = saved.activeModelId;
          }
          cleanupTasksAndLogs();
          schedulePersist();
        } catch(err) {
          console.warn('TaskBoard state load failed', err);
        }
      }

      function ensureRequiredModelOptions() {
        const ensure = (blueprint) => {
          if (!blueprint || !blueprint.id) return;
          if (!state.modelOptions.some(opt => opt.id === blueprint.id)) {
            state.modelOptions.push({ ...blueprint });
          }
        };
        MODEL_BLUEPRINTS.forEach(ensure);
      }

      ensureRequiredModelOptions();
      loadPersistedState();
      ensureRequiredModelOptions();
      ensureActiveModel();

      window.addEventListener('beforeunload', () => {
        persistNow();
      });

      function findModelOption(id) {
        if (!id) return null;
        return state.modelOptions.find(opt => opt.id === id) || null;
      }

      function getActiveModelOption() {
        return findModelOption(state.activeModelId) || state.modelOptions[0] || null;
      }

      function ensureActiveModel() {
        if (!findModelOption(state.activeModelId)) {
          state.activeModelId = state.modelOptions[0]?.id || null;
        }
      }

      function setActiveModel(id) {
        ensureActiveModel();
        const option = findModelOption(id) || getActiveModelOption();
        if (!option) return;
        if (state.activeModelId !== option.id) {
          state.activeModelId = option.id;
          schedulePersist();
        }
        updateModelBadge();
      }

      function updateModelBadge() {
        if (!modelToggleEl) return;
        const option = getActiveModelOption();
        if (option) {
          const label = option.shortLabel || option.label || option.id || 'モデル';
          modelToggleEl.textContent = label;
          modelToggleEl.setAttribute('data-model', option.id);
          modelToggleEl.setAttribute('title', `${option.label || label}（@で変更）`);
        } else {
          modelToggleEl.textContent = 'モデル';
          modelToggleEl.removeAttribute('data-model');
          modelToggleEl.setAttribute('title', '@でモデルを選択');
        }
      }

      function normalizeBackendTask(record){
        if (!record || record.id == null) return null;
        const id = String(record.id);
        const createdAt = record.createdAt || new Date().toISOString();
        const updatedAt = record.updatedAt || createdAt;
        const responseText = typeof record.resultText === 'string'
          ? record.resultText
          : (typeof record.stdout === 'string' ? record.stdout.trim() : '');
        const externalTerminal = record && typeof record.externalTerminal === 'object'
          ? {
              sessionId: record.externalTerminal.sessionId ? String(record.externalTerminal.sessionId) : null,
              app: record.externalTerminal.app || null,
              command: record.externalTerminal.command || null,
              appleSessionId: record.externalTerminal.appleSessionId || null
            }
          : null;
        const copyBundle = record && typeof record.copyBundle === 'object' ? record.copyBundle : null;
        return {
          id,
          serverId: id,
          status: typeof record.status === 'string' && record.status ? record.status : 'running',
          prompt: typeof record.prompt === 'string' ? record.prompt : '',
          response: responseText,
          result: record.resultMeta && typeof record.resultMeta === 'object' ? record.resultMeta : null,
          error: record.error || null,
          createdAt,
          updatedAt,
          endedAt: record.endedAt || null,
          exitCode: Number.isFinite(record.exitCode) ? record.exitCode : (typeof record.exitCode === 'string' ? record.exitCode : null),
          model: record.model || null,
          provider: record.provider || null,
          importance: normalizePriorityLevel(record.importance, 'medium'),
          urgency: normalizePriorityLevel(record.urgency, 'medium'),
          manualDone: record.manualDone ? true : false,
          completionSummary: typeof record.completionSummary === 'string' ? record.completionSummary : '',
          completionSummaryPending: record.completionSummaryPending ? true : false,
          logs: [],
          urls: Array.isArray(record.urls) ? record.urls.slice() : [],
          files: Array.isArray(record.files) ? record.files.slice() : [],
          externalTerminal,
          copyBundle,
          codexPollingDisabled: record.codexPollingDisabled ? true : false,
          codexIdleChecks: Number.isFinite(record.codexIdleChecks) ? record.codexIdleChecks : 0,
          codexHasSeenWorking: record.codexHasSeenWorking ? true : false,
          codexIsWorking: false
        };
      }

      async function fetchServerTasksSnapshot(){
        try {
          const base = await probeBackendBase();
          if (!base) {
            updateSyncStatusFromState('info');
            return;
          }
          const endpoint = `${base.replace(/\/$/, '')}/api/agent/status`;
          const res = await fetch(endpoint, { cache: 'no-store' });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          const incoming = Array.isArray(data.tasks) ? data.tasks : [];
          let merged = 0;
          incoming.forEach((record) => {
            const task = normalizeBackendTask(record);
            if (!task) return;
            mergeTask(task);
            merged += 1;
          });
          if (typeof data.persistedAt === 'string' && data.persistedAt) {
            state.backendSnapshotAt = data.persistedAt;
          } else if (merged) {
            state.backendSnapshotAt = new Date().toISOString();
          }
          if (merged) {
            render();
          }
          updateSyncStatusFromState(merged ? 'success' : 'info');
    } catch (err) {
      console.warn('Failed to restore tasks from backend:', err);
      if (!state.backendSnapshotAt) {
        updateSyncStatusFromState('error', 'バックエンド未接続');
      } else {
        updateSyncStatusFromState('info');
      }
    }
  }

      function buildModelPayload(model) {
        if (!model || typeof model !== 'object') return { selectedModel: null };
        return { selectedModel: model.id };
      }

    const params = new URLSearchParams(location.search);
    const queryBackend = params.get('backend');
    if (typeof window.KAMUI_BACKEND_BASE === 'string' && window.KAMUI_BACKEND_BASE) {
      if (state.backendBase !== window.KAMUI_BACKEND_BASE) {
        state.backendBase = window.KAMUI_BACKEND_BASE;
        schedulePersist();
      }
    } else if (queryBackend) {
      if (state.backendBase !== queryBackend) {
        state.backendBase = queryBackend;
        schedulePersist();
      }
    }

    // 要素生成
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'taskboard-toggle';
    toggleBtn.setAttribute('aria-label', 'エージェントタスクを開く');
    toggleBtn.setAttribute('title', 'エージェントタスク');
    // SVGイルカアイコン（淡い水色）
    toggleBtn.innerHTML = `
      <svg class="bot-icon" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="dolphinGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#bfe7ff"/>
            <stop offset="100%" stop-color="#88d1ff"/>
          </linearGradient>
        </defs>
        <path d="M12 3c3.1 0 5.4 1 7 3c.9 1.1 1.3 2.3 1.4 3c-1.2-.4-2.7-.8-4.3-.8c-2.4 0-4.6.8-6.3 2.2c-1 .8-1.9 1.7-2.5 2.7c-.3.5-.9.6-1.4.5c-.9-.2-1.8-.7-2.7-1.3c.4 1.4 1.1 2.4 2.1 3.2c-.5.7-.8 1.4-.9 2.1c1-.1 2.2-.5 3.3-1.1c1.2 1.5 3.2 2.4 5.4 2.4c3.9 0 7-2.6 8.1-5.8c1.2-.2 2.2-.1 3 .1c-.8-1.8-2.4-3.4-4.9-4.6C18.1 4.6 15.6 3 12 3z" fill="url(#dolphinGrad)" opacity="0.95"/>
        <circle cx="16" cy="8.8" r="0.7" fill="#1d4ed8"/>
      </svg>`;

    const panel = document.createElement('div');
    panel.id = 'aiTaskBoard';
    panel.className = 'taskboard-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'false');
    panel.setAttribute('aria-hidden', state.open ? 'false' : 'true');

    panel.innerHTML = `
      <div class="taskboard-header">
        <div class="tb-title">エージェントタスク</div>
        <div class="tb-sync-status info" id="taskboardSyncStatus" aria-live="polite" aria-hidden="true"></div>
        <div class="tb-header-toggles">
          <button type="button" id="taskboardHeatmapToggle" class="tb-heatmap-toggle" aria-expanded="false" aria-label="ヒートマップ" title="ヒートマップ"><span class="tb-toggle-icon" aria-hidden="true"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2.5" y="2.5" width="5" height="5" rx="1.4"></rect><rect x="8.5" y="2.5" width="5" height="5" rx="1.4"></rect><rect x="14.5" y="2.5" width="3" height="5" rx="1.4"></rect><rect x="2.5" y="8.5" width="5" height="5" rx="1.4"></rect><rect x="8.5" y="8.5" width="5" height="5" rx="1.4"></rect><rect x="14.5" y="8.5" width="3" height="5" rx="1.4"></rect><rect x="2.5" y="14.5" width="5" height="3" rx="1.4"></rect><rect x="8.5" y="14.5" width="5" height="3" rx="1.4"></rect><rect x="14.5" y="14.5" width="3" height="3" rx="1.4"></rect></svg></span><span class="tb-toggle-label">ヒートマップ</span></button>
          <button type="button" id="taskboardMatrixToggle" class="tb-matrix-toggle" aria-expanded="false" aria-label="マトリクス" title="マトリクス"><span class="tb-toggle-icon" aria-hidden="true"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2.8" y="2.8" width="6.4" height="6.4" rx="1.8"></rect><rect x="10.8" y="2.8" width="6.4" height="6.4" rx="1.8"></rect><rect x="2.8" y="10.8" width="6.4" height="6.4" rx="1.8"></rect><rect x="10.8" y="10.8" width="6.4" height="6.4" rx="1.8"></rect></svg></span><span class="tb-toggle-label">マトリクス</span></button>
          <button type="button" id="taskboard3dToggle" class="tb-3d-toggle" aria-expanded="false" aria-label="3Dシステム" title="3Dシステム"><span class="tb-toggle-icon" aria-hidden="true"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M10 2.4 4 5.2v6.4L10 14.4l6-2.8V5.2L10 2.4Z" fill="currentColor" opacity="0.14"></path><path d="M10 2.4 4 5.2v6.4L10 14.4l6-2.8V5.2L10 2.4Zm0 0v12M4 5.2l6 2.8m6-2.8-6 2.8"/></svg></span><span class="tb-toggle-label">3Dシステム</span></button>
        </div>
        <div class="tb-actions">
          <button type="button" class="tb-btn tb-hide" aria-label="閉じる" title="閉じる">×</button>
        </div>
      </div>
      <div class="taskboard-analytics">
        <div class="tb-heatmap-legend" id="taskboardHeatmapLegend"></div>
        <div class="taskboard-heatmap" id="taskboardHeatmap" role="img" aria-label="直近14日間の時間帯別タスク数ヒートマップ"></div>
        <div class="taskboard-matrix" id="taskboardMatrix" role="img" aria-label="重要度と緊急度のマトリクス"></div>
        <div class="taskboard-3d" id="taskboard3d" role="region" aria-label="システムディレクトリ3Dビュー">
          <div class="tb-3d-wrapper">
            <div class="tb-3d-canvas" id="taskboard3dCanvas" aria-live="polite">
              <div class="tb-3d-search" id="taskboard3dSearchPanel" role="search">
                <input type="search" id="taskboard3dSearch" class="tb-3d-search-input" placeholder="ファイル・パスを検索" autocomplete="off" spellcheck="false" aria-controls="taskboard3dSearchResults" aria-haspopup="listbox" aria-expanded="false" aria-label="ファイル検索" />
                <span class="tb-3d-search-count" id="taskboard3dSearchCount" aria-live="polite"></span>
                <ul id="taskboard3dSearchResults" class="tb-3d-search-results" role="listbox" aria-label="検索結果" aria-live="polite"></ul>
              </div>
              <div class="tb-3d-placeholder" id="taskboard3dStatus">3Dビューは未読み込みです。</div>
            </div>
            <button type="button" id="taskboard3dInfoToggle" class="tb-3d-info-toggle" aria-expanded="false" aria-controls="taskboard3dInfoPanel" aria-label="info">
              <span class="tb-3d-info-icon" aria-hidden="true"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2.75" y="3.75" width="14.5" height="12.5" rx="2.25"></rect><path d="M7.25 3.75v12.5"></path></svg></span>
              <span class="tb-3d-info-text">info</span>
            </button>
            <div class="tb-3d-side" id="taskboard3dInfoPanel">
              <div class="tb-3d-side-header">
                <h3 class="tb-3d-title">ノード情報</h3>
                <button type="button" id="taskboard3dReload" class="tb-3d-reload" aria-label="3Dデータを再読み込み">再読み込み</button>
              </div>
              <div class="tb-3d-mode" role="group" aria-label="表示モード">
                <button type="button" id="taskboard3dModeMedia" class="tb-3d-mode-btn is-active" data-mode="media">メディア</button>
                <button type="button" id="taskboard3dModeColor" class="tb-3d-mode-btn" data-mode="color">カラー</button>
              </div>
              <div class="tb-3d-base">ベースディレクトリ: <code id="taskboard3dBase">-</code></div>
              <dl class="tb-3d-meta">
                <dt>名前</dt><dd id="taskboard3dNodeName">-</dd>
                <dt>種別</dt><dd id="taskboard3dNodeType">-</dd>
                <dt>パス</dt><dd id="taskboard3dNodePath">-</dd>
                <dt>サイズ</dt><dd id="taskboard3dNodeSize">-</dd>
              </dl>
              <div class="tb-3d-stats">
                <h4>統計</h4>
                <ul id="taskboard3dStats" class="tb-3d-stats-list"></ul>
              </div>
              <div class="tb-3d-tip">ノードにカーソルを合わせるかクリックすると詳細が表示されます。</div>
            </div>
          </div>
        </div>
      </div>
      <div class="taskboard-list" id="taskboardList" aria-live="polite"></div>
      <div class="taskboard-compose">
        <div class="tb-compose-row-1">
          <button type="button" id="taskboardModelBadge" class="tb-model-toggle" aria-label="使用モデル (@で変更)">Claude</button>
          <div class="tb-input-wrapper">
            <input type="text" id="taskboardInput" class="tb-input" placeholder="新規タスクを入力... (/でMCPダイヤル、@でモデル選択、Enterで追加)" autocomplete="off" />
          </div>
        </div>
        <div class="tb-compose-row-2">
          <div class="tb-compose-center">
            <label class="tb-priority-select-wrap" for="taskboardImportance" aria-label="重要度">
              <span class="tb-priority-icon-wrap">${priorityKindIcon('importance')}</span>
              <select id="taskboardImportance" class="tb-priority-select">
                <option value="high">高</option>
                <option value="medium">中</option>
                <option value="low">低</option>
              </select>
            </label>
            <label class="tb-priority-select-wrap" for="taskboardUrgency" aria-label="緊急度">
              <span class="tb-priority-icon-wrap">${priorityKindIcon('urgency')}</span>
              <select id="taskboardUrgency" class="tb-priority-select">
                <option value="high">高</option>
                <option value="medium">中</option>
                <option value="low">低</option>
              </select>
            </label>
          </div>
          <div class="tb-compose-buttons">
            <button type="button" id="taskboardRun" class="tb-send tb-run" aria-label="実行">実行</button>
            <button type="button" id="taskboardHold" class="tb-hold" aria-label="保留">保留</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(toggleBtn);
    document.body.appendChild(panel);

    const listEl = panel.querySelector('#taskboardList');
    const heatmapEl = panel.querySelector('#taskboardHeatmap');
    const heatmapLegendEl = panel.querySelector('#taskboardHeatmapLegend');
    const heatmapToggleEl = panel.querySelector('#taskboardHeatmapToggle');
    const matrixEl = panel.querySelector('#taskboardMatrix');
    const matrixToggleEl = panel.querySelector('#taskboardMatrixToggle');
    const graph3dEl = panel.querySelector('#taskboard3d');
    const graph3dToggleEl = panel.querySelector('#taskboard3dToggle');
    const graph3dCanvasEl = panel.querySelector('#taskboard3dCanvas');
    const graph3dStatusEl = panel.querySelector('#taskboard3dStatus');
    const graph3dNodeNameEl = panel.querySelector('#taskboard3dNodeName');
    const graph3dNodeTypeEl = panel.querySelector('#taskboard3dNodeType');
    const graph3dNodePathEl = panel.querySelector('#taskboard3dNodePath');
    const graph3dNodeSizeEl = panel.querySelector('#taskboard3dNodeSize');
    const graph3dBaseEl = panel.querySelector('#taskboard3dBase');
    const graph3dStatsEl = panel.querySelector('#taskboard3dStats');
    const graph3dReloadEl = panel.querySelector('#taskboard3dReload');
    graph3dSideEl = panel.querySelector('#taskboard3dInfoPanel');
    graph3dInfoToggleEl = panel.querySelector('#taskboard3dInfoToggle');
    graph3dInfoLabelEl = graph3dInfoToggleEl ? graph3dInfoToggleEl.querySelector('.tb-3d-info-text') : null;
    graph3dModeMediaEl = panel.querySelector('#taskboard3dModeMedia');
    graph3dModeColorEl = panel.querySelector('#taskboard3dModeColor');
    graph3dSearchInputEl = panel.querySelector('#taskboard3dSearch');
    graph3dSearchCountEl = panel.querySelector('#taskboard3dSearchCount');
    graph3dSearchResultsEl = panel.querySelector('#taskboard3dSearchResults');
    initializeGraph3dSearchUI();
    bindGraph3dSearchEvents();
    updateGraph3dInfoVisibility();
    if (!graph3dInfoResizeBound && typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      const resizeHandler = () => requestAnimationFrame(updateGraph3dInfoVisibility);
      window.addEventListener('resize', resizeHandler);
      graph3dInfoResizeBound = true;
    }
    const analyticsEl = panel.querySelector('.taskboard-analytics');
    const inputEl = panel.querySelector('#taskboardInput');
    const importanceEl = panel.querySelector('#taskboardImportance');
    const urgencyEl = panel.querySelector('#taskboardUrgency');
    const runEl  = panel.querySelector('#taskboardRun');
    const holdEl = panel.querySelector('#taskboardHold');
    const composeEl = panel.querySelector('.taskboard-compose');
    const hideEl  = panel.querySelector('.tb-hide');
    modelToggleEl = panel.querySelector('#taskboardModelBadge');
    syncStatusEl = panel.querySelector('#taskboardSyncStatus');

    function formatNumber(value) {
      const num = Number(value);
      if (!Number.isFinite(num)) return '0';
      return num.toLocaleString('ja-JP');
    }

    function formatBytes(value) {
      const size = Number(value);
      if (!Number.isFinite(size) || size < 0) return '-';
      if (size === 0) return '0 B';
      const units = ['B', 'KB', 'MB', 'GB', 'TB'];
      const idx = Math.min(units.length - 1, Math.floor(Math.log(size) / Math.log(1024)));
      const val = size / Math.pow(1024, idx);
      return `${val >= 10 ? val.toFixed(0) : val.toFixed(1)} ${units[idx]}`;
    }

    function loadExternalScriptOnce(url, checker) {
      if (typeof checker === 'function') {
        try {
          const existing = checker();
          if (existing) return Promise.resolve(existing);
        } catch (_) {}
      }
      if (!externalScriptPromises[url]) {
        externalScriptPromises[url] = new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = url;
          script.async = true;
          script.onload = () => {
            try {
              resolve(typeof checker === 'function' ? (checker() || true) : true);
            } catch (err) {
              resolve(true);
            }
          };
          script.onerror = () => reject(new Error(`Failed to load ${url}`));
          document.head.appendChild(script);
        });
      }
      return externalScriptPromises[url].then(result => {
        if (result) return result;
        if (typeof checker === 'function') {
          try {
            const checked = checker();
            if (checked) return checked;
          } catch (_) {}
        }
        return true;
      });
    }

    function ensureThreeLibrary() {
      if (window.THREE) return Promise.resolve(window.THREE);
      return loadExternalScriptOnce('//cdn.jsdelivr.net/npm/three@0.158/build/three.min.js', () => window.THREE);
    }

    async function ensureForceGraphLibrary() {
      if (window.ForceGraph3D) return window.ForceGraph3D;
      await ensureThreeLibrary();
      return loadExternalScriptOnce('//cdn.jsdelivr.net/npm/3d-force-graph', () => window.ForceGraph3D);
    }

    async function ensureBloomPass(graphInstance) {
      if (!graphInstance || typeof graphInstance.postProcessingComposer !== 'function') return;
      try {
        if (typeof graphInstance.postProcessing === 'function') {
          graphInstance.postProcessing(true);
        }
        const composer = graphInstance.postProcessingComposer();
        if (!composer || composer.__hasBloomPass) return;
        await ensureThreeLibrary();
        if (!bloomPassClass) {
          const mod = await import('https://esm.sh/three/examples/jsm/postprocessing/UnrealBloomPass.js?external=three');
          bloomPassClass = mod?.UnrealBloomPass || mod?.default || null;
        }
        if (!bloomPassClass || !window.THREE) return;
        const renderer = graphInstance.renderer && graphInstance.renderer();
        const size = renderer?.getSize ? renderer.getSize(new window.THREE.Vector2()) : new window.THREE.Vector2(graph3dCanvasEl?.clientWidth || window.innerWidth, graph3dCanvasEl?.clientHeight || window.innerHeight);
        const bloomPass = new bloomPassClass(size, 1.6, 0.85, 0.0);
        bloomPass.strength = 1.78;
        bloomPass.radius = 0.82;
        bloomPass.threshold = 0.0;
        composer.addPass(bloomPass);
        composer.__hasBloomPass = true;
      } catch (error) {
        console.warn('[Taskboard][3D] bloom setup failed', error);
      }
    }

    function graph3dSetStatus(message, mode = 'info') {
      if (!graph3dStatusEl) return;
      const text = typeof message === 'string' ? message : '';
      graph3dStatusEl.textContent = text;
      graph3dStatusEl.classList.remove('is-error', 'is-loading', 'is-success', 'is-hidden');
      if (!text) {
        graph3dStatusEl.classList.add('is-hidden');
        return;
      }
      if (mode === 'error') graph3dStatusEl.classList.add('is-error');
      else if (mode === 'loading') graph3dStatusEl.classList.add('is-loading');
      else if (mode === 'success') graph3dStatusEl.classList.add('is-success');
    }

    function normalizeGraph3dViewMode(value) {
      return value === 'color' ? 'color' : 'media';
    }

    function updateGraph3dModeToggle() {
      const mode = normalizeGraph3dViewMode(state.graph3dViewMode);
      if (graph3dModeMediaEl) {
        graph3dModeMediaEl.classList.toggle('is-active', mode === 'media');
        graph3dModeMediaEl.setAttribute('aria-pressed', mode === 'media' ? 'true' : 'false');
      }
      if (graph3dModeColorEl) {
        graph3dModeColorEl.classList.toggle('is-active', mode === 'color');
        graph3dModeColorEl.setAttribute('aria-pressed', mode === 'color' ? 'true' : 'false');
      }
    }

    function buildGraph3dMediaUrl(node) {
      const base = typeof state.backendBase === 'string' ? state.backendBase : '';
      const normalizedBase = base.replace(/\/$/, '');
      const rawPath = typeof node.path === 'string' ? node.path.replace(/^\/+/, '') : '';
      if (!rawPath) return normalizedBase || '';
      if (normalizedBase) {
        return `${normalizedBase}/${encodeURI(rawPath)}`;
      }
      return `/${encodeURI(rawPath)}`;
    }

    function isGraph3dMediaNode(node) {
      return !!(node && (node.type === 'image' || node.type === 'video'));
    }

    function getGraph3dSphereObject(node, cacheKey) {
      if (!window.THREE) return null;
      if (!graph3dSphereGeometry) {
        graph3dSphereGeometry = new THREE.SphereGeometry(1, 36, 36);
      }
      if (cacheKey && graph3dNodeObjectCache.has(cacheKey)) {
        const cached = graph3dNodeObjectCache.get(cacheKey);
        return cached?.object || cached;
      }
      const baseColor = new THREE.Color(GRAPH3D_NODE_COLORS[node.type] || GRAPH3D_NODE_COLORS.other);
      const material = new THREE.MeshStandardMaterial({
        color: baseColor.clone().lerp(new THREE.Color('#dbeafe'), 0.18),
        emissive: baseColor.clone().multiplyScalar(0.45),
        emissiveIntensity: 1.2,
        metalness: 0.05,
        roughness: 0.4,
        transparent: true,
        opacity: 0.94
      });
      const mesh = new THREE.Mesh(graph3dSphereGeometry, material);
      const nodeSize = node.type === 'root' ? 18 : node.type === 'folder' ? 11 : 8;
      mesh.scale.set(nodeSize, nodeSize, nodeSize);
      if (cacheKey) graph3dNodeObjectCache.set(cacheKey, { object: mesh, resourceKey: null });
      return mesh;
    }

    function createVideoPlaceholderTexture(node) {
      const canvas = document.createElement('canvas');
      canvas.width = 480;
      canvas.height = 320;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const gradient = ctx.createLinearGradient(0, 0, 0, 320);
        gradient.addColorStop(0, '#0f172a');
        gradient.addColorStop(1, '#1d4ed8');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 480, 320);
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(0, 0, 480, 320);
        ctx.fillStyle = 'rgba(255,255,255,0.88)';
        ctx.beginPath();
        ctx.moveTo(210, 160);
        ctx.lineTo(210, 130);
        ctx.lineTo(270, 160);
        ctx.lineTo(210, 190);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(15,23,42,0.65)';
        ctx.beginPath();
        ctx.arc(240, 160, 58, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.beginPath();
        ctx.moveTo(228, 160);
        ctx.lineTo(228, 138);
        ctx.lineTo(260, 160);
        ctx.lineTo(228, 182);
        ctx.closePath();
        ctx.fill();
        ctx.font = 'bold 28px "Inter", sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillText('VIDEO', 24, 44);
      }
      const texture = new THREE.Texture(canvas);
      texture.needsUpdate = true;
      texture.colorSpace = THREE.SRGBColorSpace || texture.colorSpace;
      return texture;
    }

    function loadImageTexture(node) {
      return new Promise((resolve, reject) => {
        if (!window.THREE) {
          reject(new Error('THREE unavailable'));
          return;
        }
        const url = buildGraph3dMediaUrl(node);
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          try {
            const texture = new THREE.Texture(img);
            texture.needsUpdate = true;
            texture.colorSpace = THREE.SRGBColorSpace || texture.colorSpace;
            resolve(texture);
          } catch (err) {
            reject(err);
          }
        };
        img.onerror = reject;
        img.src = url;
      });
    }

    function loadVideoResource(node, key) {
      return new Promise((resolve, reject) => {
        if (!window.THREE) {
          reject(new Error('THREE unavailable'));
          return;
        }
        const url = buildGraph3dMediaUrl(node);
        const video = document.createElement('video');
        video.crossOrigin = 'anonymous';
        video.muted = true;
        video.playsInline = true;
        video.preload = 'auto';
        video.src = url;
        let rafId = null;
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('canvas_context_unavailable'));
          return;
        }
        const texture = new THREE.Texture(canvas);
        texture.needsUpdate = true;
        texture.colorSpace = THREE.SRGBColorSpace || texture.colorSpace;

        const stop = () => {
          try { video.pause(); } catch (_) {}
          if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = null;
          }
        };

        const renderFrame = () => {
          if (!video.paused && !video.ended) {
            try {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              texture.needsUpdate = true;
            } catch (_) {}
            rafId = requestAnimationFrame(renderFrame);
          }
        };

        const play = () => {
          if (video.readyState < 2) return;
          try {
            video.play().catch(() => {});
            if (!rafId) {
              renderFrame();
            }
          } catch (_) {}
        };

        const dispose = () => {
          stop();
          video.removeAttribute('src');
          video.load();
          graph3dVideoResources.delete(key);
        };

        video.addEventListener('loadedmetadata', () => {
          const width = video.videoWidth || 640;
          const height = video.videoHeight || 360;
          canvas.width = width;
          canvas.height = height;
          try {
            const targetTime = Math.min(0.12, (video.duration || 0.12) - 0.01);
            video.currentTime = Math.max(0, targetTime);
          } catch (_) {}
        }, { once: true });

        video.addEventListener('loadeddata', () => {
          try {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            texture.needsUpdate = true;
            resolve({ texture, play, stop, dispose, video });
          } catch (err) {
            reject(err);
          }
        }, { once: true });

        video.addEventListener('error', () => {
          dispose();
          reject(new Error('video_texture_failed'));
        }, { once: true });

        try { video.load(); } catch (_) {}
      });
    }

    const graph3dMediaTexturePromises = new Map();

    function getGraph3dMediaObject(node, cacheKey) {
      if (!window.THREE) return getGraph3dSphereObject(node, cacheKey);
      if (cacheKey && graph3dNodeObjectCache.has(cacheKey)) {
        return graph3dNodeObjectCache.get(cacheKey);
      }
      const group = new THREE.Group();
      const baseColor = new THREE.Color(GRAPH3D_NODE_COLORS[node.type] || GRAPH3D_NODE_COLORS.image);
      const spriteMaterial = new THREE.SpriteMaterial({
        color: baseColor.clone().lerp(new THREE.Color('#cbd5f5'), 0.4),
        transparent: true,
        opacity: 0.92,
        toneMapped: false
      });
      const width = node.type === 'image' ? 26 : 24;
      const height = width * (node.type === 'image' ? 0.68 : 0.62);
      const sprite = new THREE.Sprite(spriteMaterial);
      sprite.scale.set(width, height, 1);
      group.add(sprite);

      const frameMaterial = new THREE.SpriteMaterial({
        color: baseColor.clone().lerp(new THREE.Color('#ffffff'), 0.55),
        transparent: true,
        opacity: 0.28,
        toneMapped: false
      });
      const frame = new THREE.Sprite(frameMaterial);
      frame.scale.set(width * 1.08, height * 1.08, 1);
      frame.position.set(0, 0, -0.02);
      group.add(frame);

      if (node.type === 'video') {
        spriteMaterial.map = createVideoPlaceholderTexture(node);
        spriteMaterial.color.set(0xffffff);
        spriteMaterial.opacity = 1;
        spriteMaterial.needsUpdate = true;
      }

      const resourceKey = node.path || node.id || Math.random().toString(36);
      if (cacheKey) graph3dNodeObjectCache.set(cacheKey, { object: group, resourceKey: node.type === 'video' ? resourceKey : null, controls: null });
      if (node.type === 'video') {
        if (!graph3dVideoResources.has(resourceKey)) {
          graph3dVideoResources.set(resourceKey, loadVideoResource(node, resourceKey).catch((err) => { graph3dVideoResources.delete(resourceKey); throw err; }));
        }
        graph3dVideoResources.get(resourceKey)
          .then((resource) => {
            spriteMaterial.map = resource.texture;
            spriteMaterial.color.set(0xffffff);
            spriteMaterial.opacity = 1;
            spriteMaterial.needsUpdate = true;
            if (cacheKey) graph3dNodeObjectCache.set(cacheKey, { object: group, resourceKey, controls: resource });
          })
          .catch(() => {
            spriteMaterial.map = createVideoPlaceholderTexture(node);
            spriteMaterial.color.set(0xffffff);
            spriteMaterial.opacity = 1;
            spriteMaterial.needsUpdate = true;
          });
      } else {
        if (!graph3dMediaTexturePromises.has(resourceKey)) {
          graph3dMediaTexturePromises.set(resourceKey, loadImageTexture(node).catch((err) => { graph3dMediaTexturePromises.delete(resourceKey); throw err; }));
        }
        graph3dMediaTexturePromises.get(resourceKey)
          .then((texture) => {
            spriteMaterial.map = texture;
            spriteMaterial.color.set(0xffffff);
            spriteMaterial.opacity = 1;
            spriteMaterial.needsUpdate = true;
            if (cacheKey) graph3dNodeObjectCache.set(cacheKey, { object: group, resourceKey: null, controls: null });
          })
          .catch(() => {
            spriteMaterial.color.set('#334155');
            spriteMaterial.opacity = 0.85;
          });
        return group;
      }

      return group;
    }

    function buildGraph3dNodeObject(node) {
      if (!node) return null;
      const mode = normalizeGraph3dViewMode(state.graph3dViewMode);
      const cacheKey = node && node.id != null ? `${mode}:${node.id}` : null;
      if (mode === 'media' && isGraph3dMediaNode(node)) {
        return getGraph3dMediaObject(node, cacheKey);
      }
      return getGraph3dSphereObject(node, cacheKey);
    }

    function refreshGraph3dNodeObjects({ force = false } = {}) {
      if (!graph3dInstance || typeof graph3dInstance.nodeThreeObject !== 'function') return;
     if (force) {
       stopGraph3dActiveVideo();
       graph3dNodeObjectCache.forEach((entry) => {
         if (entry && entry.controls && typeof entry.controls.stop === 'function') {
           entry.controls.stop();
          }
          if (entry && entry.controls && typeof entry.controls.dispose === 'function') {
            entry.controls.dispose();
          }
        });
       graph3dNodeObjectCache.clear();
        graph3dMediaTexturePromises.clear();
        graph3dVideoResources.forEach((promise) => {
          promise.then((resource) => {
            if (resource && typeof resource.dispose === 'function') {
              resource.dispose();
            }
          }).catch(() => {});
        });
        graph3dVideoResources.clear();
      }
      graph3dInstance.nodeThreeObject((node) => buildGraph3dNodeObject(node));
      if (typeof graph3dInstance.refresh === 'function') {
        graph3dInstance.refresh();
      }
    }

    function stopGraph3dActiveVideo() {
      if (!graph3dActiveVideoKey) return;
      const cached = graph3dNodeObjectCache.get(graph3dActiveVideoKey);
      if (cached && cached.controls && typeof cached.controls.stop === 'function') {
        cached.controls.stop();
      }
      graph3dActiveVideoKey = null;
    }

    function startGraph3dVideoForNode(node) {
      if (!node || node.type !== 'video') return;
      const mode = normalizeGraph3dViewMode(state.graph3dViewMode);
      if (mode !== 'media') {
        stopGraph3dActiveVideo();
        return;
      }
      const cacheKey = node.id != null ? `${mode}:${node.id}` : null;
      if (!cacheKey) return;
      if (graph3dActiveVideoKey === cacheKey) return;
      stopGraph3dActiveVideo();
      const cached = graph3dNodeObjectCache.get(cacheKey);
      if (cached && cached.controls && typeof cached.controls.play === 'function') {
        cached.controls.play();
        graph3dActiveVideoKey = cacheKey;
      } else if (cached && cached.resourceKey && graph3dVideoResources.has(cached.resourceKey)) {
        graph3dVideoResources.get(cached.resourceKey)
          .then((resource) => {
            if (resource && typeof resource.play === 'function') {
              resource.play();
              graph3dNodeObjectCache.set(cacheKey, { ...cached, controls: resource });
              graph3dActiveVideoKey = cacheKey;
            }
          })
          .catch(() => {});
      }
    }

    function setGraph3dViewMode(nextMode) {
      const normalized = normalizeGraph3dViewMode(nextMode);
      if (state.graph3dViewMode === normalized) return;
      state.graph3dViewMode = normalized;
      updateGraph3dModeToggle();
      refreshGraph3dNodeObjects({ force: true });
      schedulePersist();
      hideGraph3dContextMenu();
    }

    function resetGraph3dInfo() {
      if (graph3dNodeNameEl) graph3dNodeNameEl.textContent = '-';
      if (graph3dNodeTypeEl) graph3dNodeTypeEl.textContent = '-';
      if (graph3dNodePathEl) graph3dNodePathEl.textContent = '-';
      if (graph3dNodeSizeEl) graph3dNodeSizeEl.textContent = '-';
    }

    function applyGraph3dInfo(node) {
      if (!node) {
        resetGraph3dInfo();
        return;
      }
      if (graph3dNodeNameEl) graph3dNodeNameEl.textContent = node.name || '-';
      if (graph3dNodeTypeEl) graph3dNodeTypeEl.textContent = GRAPH3D_TYPE_LABELS[node.type] || node.type || '-';
      if (graph3dNodePathEl) {
        if (node.type === 'root') {
          graph3dNodePathEl.textContent = graph3dDataCache?.baseDir || '-';
        } else {
          graph3dNodePathEl.textContent = node.path || '-';
        }
      }
      if (graph3dNodeSizeEl) {
        if (node.type === 'folder') {
          const folders = formatNumber(node.childFolderCount || 0);
          const files = formatNumber(node.childFileCount || 0);
          graph3dNodeSizeEl.textContent = `${folders} フォルダ / ${files} ファイル`;
        } else if (node.type === 'root') {
          const folderTotal = formatNumber(graph3dDataCache?.stats?.folders || 0);
          const fileTotal = formatNumber(graph3dDataCache?.stats?.files || 0);
          graph3dNodeSizeEl.textContent = `${folderTotal} フォルダ / ${fileTotal} ファイル`;
        } else {
          graph3dNodeSizeEl.textContent = Number.isFinite(Number(node.size)) ? formatBytes(node.size) : '-';
        }
      }
    }

    function getGraph3dNodeById(nodeId) {
      if (nodeId == null || !graph3dInstance || typeof graph3dInstance.graphData !== 'function') return null;
      const data = graph3dInstance.graphData();
      if (!data || !Array.isArray(data.nodes)) return null;
      return data.nodes.find((node) => node && node.id === nodeId) || null;
    }

    function moveCameraToGraph3dNode(node, duration = 600) {
      if (!node || !graph3dInstance || typeof graph3dInstance.cameraPosition !== 'function') return;
      try {
        const camera = typeof graph3dInstance.camera === 'function' ? graph3dInstance.camera() : null;
        const distance = 180;
        const x = Number.isFinite(node.x) ? node.x : 0;
        const y = Number.isFinite(node.y) ? node.y : 0;
        const z = Number.isFinite(node.z) ? node.z : 0;
        const length = Math.max(Math.hypot(x, y, z), 1);
        const ratio = 1 + distance / length;
        graph3dInstance.cameraPosition({ x: x * ratio, y: y * ratio, z: z * ratio }, node, duration);
        if (camera && typeof graph3dInstance.controls === 'function') {
          const controls = graph3dInstance.controls();
          if (controls && controls.target && typeof controls.target.set === 'function') {
            controls.target.set(node.x || 0, node.y || 0, node.z || 0);
            controls.update && controls.update();
          }
        }
      } catch (_) {}
    }

    function focusGraph3dNode(node, duration = 600) {
      if (!node) return false;
      graph3dPinnedNode = node;
      applyGraph3dInfo(node);
      hideGraph3dContextMenu();
      moveCameraToGraph3dNode(node, duration);
      startGraph3dVideoForNode(node);
      syncGraph3dSearchHighlightByNode(node);
      return true;
    }

    function focusGraph3dNodeById(nodeId, duration = 600) {
      const node = getGraph3dNodeById(nodeId);
      if (!node) return false;
      return focusGraph3dNode(node, duration);
    }

    function syncGraph3dSearchHighlightByNode(node) {
      if (!graph3dSearchMatches.length) return;
      if (!node || node.id == null) {
        highlightGraph3dSearchResult(graph3dSearchActiveIndex, { scroll: false });
        return;
      }
      const idx = graph3dSearchMatches.findIndex(match => match && match.id === node.id);
      if (idx >= 0) {
        graph3dSearchActiveIndex = idx;
        highlightGraph3dSearchResult(idx, { scroll: true });
      }
    }

    function renderGraph3dSearchMessage(message) {
      if (!graph3dSearchResultsEl) return;
      graph3dSearchResultsEl.innerHTML = message
        ? `<li class="tb-3d-search-empty" role="presentation">${escapeHtml(message)}</li>`
        : '';
      graph3dSearchResultsEl.scrollTop = 0;
      graph3dSearchMatches = [];
      graph3dSearchMatchesTotal = 0;
      graph3dSearchActiveIndex = -1;
      if (graph3dSearchInputEl) {
        graph3dSearchInputEl.removeAttribute('aria-activedescendant');
        graph3dSearchInputEl.setAttribute('aria-expanded', 'false');
      }
    }

    function initializeGraph3dSearchUI() {
      if (graph3dSearchCountEl) graph3dSearchCountEl.textContent = '';
      renderGraph3dSearchMessage('');
      updateGraph3dSearchState();
    }

    function updateGraph3dSearchCount() {
      if (!graph3dSearchCountEl) return;
      const hasTerm = graph3dSearchInputEl && graph3dSearchInputEl.value && graph3dSearchInputEl.value.trim();
      if (!hasTerm) {
        graph3dSearchCountEl.textContent = '';
        return;
      }
      if (graph3dLoadPromise) {
        graph3dSearchCountEl.textContent = '...';
        return;
      }
      if (!graph3dDataCache || !Array.isArray(graph3dDataCache.nodes) || !graph3dDataCache.nodes.length) {
        graph3dSearchCountEl.textContent = '...';
        return;
      }
      if (!graph3dSearchMatchesTotal) {
        graph3dSearchCountEl.textContent = '0件';
        return;
      }
      if (graph3dSearchMatchesTotal > graph3dSearchMatches.length) {
        graph3dSearchCountEl.textContent = `${graph3dSearchMatches.length} / ${graph3dSearchMatchesTotal}件`;
        return;
      }
      graph3dSearchCountEl.textContent = `${graph3dSearchMatchesTotal}件`;
    }

    function renderGraph3dSearchResults() {
      if (!graph3dSearchResultsEl) return;
      if (!graph3dSearchMatches.length) {
        renderGraph3dSearchMessage('一致するノードが見つかりません。');
        updateGraph3dSearchCount();
        return;
      }
      const items = graph3dSearchMatches.map((node, idx) => {
        const isActive = idx === graph3dSearchActiveIndex;
        const optionId = `taskboard3dSearchOption-${idx}`;
        const displayPath = node.type === 'root'
          ? (graph3dDataCache?.baseDir || node.path || node.name || '')
          : (node.path || node.name || '');
        const shownPath = displayPath ? escapeHtml(displayPath) : '(パスなし)';
        const classes = ['tb-3d-search-item-btn'];
        if (isActive) classes.push('is-active');
        return `<li class="tb-3d-search-item" role="option" data-index="${idx}"><button type="button" class="${classes.join(' ')}" data-index="${idx}" data-node-id="${escapeAttr(String(node.id))}" id="${optionId}" aria-selected="${isActive ? 'true' : 'false'}"><span class="tb-3d-search-item-path">${shownPath}</span></button></li>`;
      });
      graph3dSearchResultsEl.innerHTML = items.join('');
      if (graph3dSearchInputEl) {
        const activeId = graph3dSearchActiveIndex >= 0 ? `taskboard3dSearchOption-${graph3dSearchActiveIndex}` : '';
        if (activeId) {
          graph3dSearchInputEl.setAttribute('aria-activedescendant', activeId);
        } else {
          graph3dSearchInputEl.removeAttribute('aria-activedescendant');
        }
        graph3dSearchInputEl.setAttribute('aria-expanded', graph3dSearchMatches.length ? 'true' : 'false');
      }
      updateGraph3dSearchCount();
    }

    function highlightGraph3dSearchResult(nextIndex, options = {}) {
      if (!graph3dSearchResultsEl || !graph3dSearchMatches.length) return;
      const clamped = Math.max(0, Math.min(nextIndex, graph3dSearchMatches.length - 1));
      graph3dSearchActiveIndex = clamped;
      const buttons = graph3dSearchResultsEl.querySelectorAll('.tb-3d-search-item-btn');
      buttons.forEach((btn) => {
        const idx = Number(btn.dataset.index);
        const isActive = idx === clamped;
        btn.classList.toggle('is-active', isActive);
        btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
        if (isActive && btn.id && graph3dSearchInputEl) {
          graph3dSearchInputEl.setAttribute('aria-activedescendant', btn.id);
        }
        if (!isActive && graph3dSearchInputEl && graph3dSearchInputEl.getAttribute('aria-activedescendant') === btn.id) {
          graph3dSearchInputEl.removeAttribute('aria-activedescendant');
        }
        if (isActive && options.scroll !== false) {
          const container = btn.closest('.tb-3d-search-item');
          if (container && typeof container.scrollIntoView === 'function') {
            container.scrollIntoView({ block: 'nearest' });
          }
        }
      });
    }

    function activateGraph3dSearchResult(index) {
      if (!graph3dSearchMatches.length) return;
      const normalized = Math.max(0, Math.min(index, graph3dSearchMatches.length - 1));
      const target = graph3dSearchMatches[normalized];
      if (!target) return;
      highlightGraph3dSearchResult(normalized, { scroll: true });
      const focus = () => {
        if (!focusGraph3dNodeById(target.id)) {
          focusGraph3dNode(target);
        }
      };
      if (!graph3dInstance) {
        const promise = ensureGraph3dInitialized().catch(() => null);
        if (promise && typeof promise.then === 'function') {
          promise.then(() => focus());
        }
      } else {
        focus();
      }
    }

    function updateGraph3dSearchResults(rawTerm, options = {}) {
      const term = typeof rawTerm === 'string' ? rawTerm.trim() : '';
      if (!graph3dSearchResultsEl) return;
      if (!term) {
        renderGraph3dSearchMessage('');
        updateGraph3dSearchCount();
        return;
      }
      if (!graph3dDataCache || !Array.isArray(graph3dDataCache.nodes) || !graph3dDataCache.nodes.length) {
        renderGraph3dSearchMessage('3Dデータを読み込み中です...');
        updateGraph3dSearchCount();
        return;
      }
      const lower = term.toLowerCase();
      const allMatches = graph3dDataCache.nodes.filter((node) => {
        if (!node || typeof node !== 'object') return false;
        if (node.id == null) return false;
        const name = node.name ? String(node.name).toLowerCase() : '';
        const path = node.path ? String(node.path).toLowerCase() : '';
        return name.includes(lower) || path.includes(lower);
      });
      graph3dSearchMatchesTotal = allMatches.length;
      graph3dSearchMatches = allMatches.slice(0, GRAPH3D_SEARCH_LIMIT);
      if (!graph3dSearchMatches.length) {
        renderGraph3dSearchMessage('一致するノードが見つかりません。');
        updateGraph3dSearchCount();
        return;
      }
      const keepIndex = options && options.keepIndex === true;
      if (!keepIndex || graph3dSearchActiveIndex < 0 || graph3dSearchActiveIndex >= graph3dSearchMatches.length) {
        graph3dSearchActiveIndex = 0;
        if (graph3dSearchResultsEl) graph3dSearchResultsEl.scrollTop = 0;
      }
      renderGraph3dSearchResults();
      if (graph3dSearchMatches.length) {
        highlightGraph3dSearchResult(graph3dSearchActiveIndex, { scroll: false });
      }
    }

    function refreshGraph3dSearchResults(options = {}) {
      if (!graph3dSearchInputEl) return;
      const term = graph3dSearchInputEl.value && graph3dSearchInputEl.value.trim();
      if (term) {
        updateGraph3dSearchResults(term, options);
      } else {
        renderGraph3dSearchMessage('');
        updateGraph3dSearchCount();
      }
    }

    function updateGraph3dSearchState() {
      if (!graph3dSearchInputEl) return;
      const collapsed = !!state.graph3dCollapsed;
      graph3dSearchInputEl.disabled = collapsed;
      graph3dSearchInputEl.setAttribute('aria-disabled', collapsed ? 'true' : 'false');
      if (collapsed) {
        renderGraph3dSearchMessage('');
        updateGraph3dSearchCount();
      } else {
        refreshGraph3dSearchResults({ keepIndex: true });
      }
    }

    function handleGraph3dSearchInput(event) {
      const value = event && event.target ? event.target.value : '';
      graph3dSearchActiveIndex = 0;
      updateGraph3dSearchResults(value);
    }

    function handleGraph3dSearchKeyDown(event) {
      if (!graph3dSearchInputEl) return;
      const key = event.key;
      if (key === 'ArrowDown') {
        if (!graph3dSearchMatches.length) return;
        event.preventDefault();
        const next = graph3dSearchActiveIndex + 1;
        highlightGraph3dSearchResult(next >= graph3dSearchMatches.length ? 0 : next);
        return;
      }
      if (key === 'ArrowUp') {
        if (!graph3dSearchMatches.length) return;
        event.preventDefault();
        const prev = graph3dSearchActiveIndex - 1;
        const nextIndex = prev < 0 ? graph3dSearchMatches.length - 1 : prev;
        highlightGraph3dSearchResult(nextIndex);
        return;
      }
      if (key === 'Enter') {
        if (!graph3dSearchMatches.length) return;
        event.preventDefault();
        activateGraph3dSearchResult(graph3dSearchActiveIndex >= 0 ? graph3dSearchActiveIndex : 0);
        return;
      }
      if (key === 'Escape') {
        if (!graph3dSearchInputEl.value) return;
        event.preventDefault();
        graph3dSearchInputEl.value = '';
        graph3dSearchActiveIndex = -1;
        renderGraph3dSearchMessage('');
        updateGraph3dSearchCount();
      }
    }

    function handleGraph3dSearchResultsClick(event) {
      const button = event.target && event.target.closest ? event.target.closest('.tb-3d-search-item-btn') : null;
      if (!button) return;
      const index = Number(button.dataset.index);
      if (!Number.isFinite(index) || index < 0) return;
      activateGraph3dSearchResult(index);
      if (graph3dSearchInputEl) {
        graph3dSearchInputEl.focus();
      }
    }

    function handleGraph3dSearchResultsPointerMove(event) {
      const item = event.target && event.target.closest ? event.target.closest('.tb-3d-search-item-btn') : null;
      if (!item) return;
      const index = Number(item.dataset.index);
      if (!Number.isFinite(index) || index < 0) return;
      if (graph3dSearchActiveIndex === index) return;
      highlightGraph3dSearchResult(index, { scroll: false });
    }

    function bindGraph3dSearchEvents() {
      if (graph3dSearchInputEl && !graph3dSearchInputEl._tbGraphBound) {
        graph3dSearchInputEl.addEventListener('input', handleGraph3dSearchInput);
        graph3dSearchInputEl.addEventListener('keydown', handleGraph3dSearchKeyDown);
        graph3dSearchInputEl._tbGraphBound = true;
      }
      if (graph3dSearchResultsEl && !graph3dSearchResultsEl._tbGraphBound) {
        graph3dSearchResultsEl.addEventListener('click', handleGraph3dSearchResultsClick);
        graph3dSearchResultsEl.addEventListener('pointermove', handleGraph3dSearchResultsPointerMove);
        graph3dSearchResultsEl._tbGraphBound = true;
      }
    }

    function updateGraph3dStats(stats, totals) {
      if (!graph3dStatsEl) return;
      if (!stats) {
        graph3dStatsEl.innerHTML = '<li class="tb-3d-stat-item">データなし</li>';
        return;
      }
      const entries = [
        ['フォルダ', stats.folders],
        ['ファイル', stats.files],
        ['画像', stats.images],
        ['動画', stats.videos],
        ['音声', stats.audio],
        ['コード', stats.code],
        ['テキスト', stats.text],
        ['ドキュメント', stats.doc],
        ['HTML', stats.html],
        ['YAML', stats.yaml],
        ['JSON', stats.json],
        ['その他', stats.other]
      ];
      const filtered = entries.filter(([, value]) => Number(value) > 0);
      const rows = (filtered.length ? filtered : [['データなし', 0]]).map(([label, value]) => {
        return `<li class="tb-3d-stat-item"><span class="tb-3d-stat-label">${escapeHtml(label)}</span><span class="tb-3d-stat-value">${label === 'データなし' ? '-' : formatNumber(value)}</span></li>`;
      });
      if (totals && Number.isFinite(Number(totals.nodes))) {
        rows.unshift(`<li class="tb-3d-stat-item tb-3d-stat-total"><span class="tb-3d-stat-label">ノード</span><span class="tb-3d-stat-value">${formatNumber(totals.nodes)}</span></li>`);
      }
      graph3dStatsEl.innerHTML = rows.join('');
    }

    function prepareGraph3dCanvasContainer() {
      if (!graph3dCanvasEl) return null;
      if (!graph3dCanvasContainer || !graph3dCanvasContainer.isConnected) {
        graph3dCanvasContainer = document.createElement('div');
        graph3dCanvasContainer.className = 'tb-3d-canvas-inner';
        graph3dCanvasEl.appendChild(graph3dCanvasContainer);
      }
      return graph3dCanvasContainer;
    }

    function setupGraph3dScene(ForceGraphFactory, data) {
      if (!graph3dCanvasEl) return;
      stopGraph3dActiveVideo();
      graph3dVideoResources.forEach((promise) => {
        promise.then((resource) => {
          if (resource && typeof resource.dispose === 'function') {
            resource.dispose();
          } else if (resource && typeof resource.stop === 'function') {
            resource.stop();
          }
        }).catch(() => {});
      });
      graph3dVideoResources.clear();
      graph3dNodeObjectCache.clear();
      if (graph3dInstance && typeof graph3dInstance._destructor === 'function') {
        try { graph3dInstance._destructor(); } catch (_) {}
      }
      const container = prepareGraph3dCanvasContainer();
      if (!container) return;
      container.innerHTML = '';
      if (graph3dStatusEl) graph3dStatusEl.classList.add('is-hidden');
      resetGraph3dInfo();
      const forceGraphFn = typeof ForceGraphFactory === 'function' ? ForceGraphFactory : window.ForceGraph3D;
      if (typeof forceGraphFn !== 'function') return;
      const graphInitializer = forceGraphFn();
      if (typeof graphInitializer !== 'function') return;
      const Graph = graphInitializer(container);
      if (!Graph) return;
      graph3dInstance = Graph;
      graph3dAutoFitLocked = false;
      graph3dHasInitialFit = false;
      try {
        const controls = Graph.controls && Graph.controls();
        if (controls && typeof controls.addEventListener === 'function') {
          controls.addEventListener('start', () => {
            graph3dAutoFitLocked = true;
          }, { once: true });
        }
      } catch (_) {}
      try {
        if (graph3dResizeObserver && typeof graph3dResizeObserver.disconnect === 'function') {
          graph3dResizeObserver.disconnect();
        }
      } catch (_) {}
      Graph.backgroundColor('#000003')
        .graphData({ nodes: Array.isArray(data?.nodes) ? data.nodes : [], links: Array.isArray(data?.links) ? data.links : [] })
        .nodeLabel(node => `${node.name || ''}\n${GRAPH3D_TYPE_LABELS[node.type] || node.type || ''}`)
        .nodeColor(node => GRAPH3D_NODE_COLORS[node.type] || GRAPH3D_NODE_COLORS.other)
        .nodeOpacity(0.9)
        .nodeVal(node => {
          if (node.type === 'root') return 28;
          if (node.type === 'folder') return 14;
          if (node.type === 'video') return 10;
          if (node.type === 'image') return 8;
          return 6;
        })
        .linkOpacity(0.9)
        .linkWidth(() => 3.2)
        .linkColor(() => 'rgba(210, 230, 255, 0.92)')
        .linkDirectionalParticles(9)
        .linkDirectionalParticleSpeed(0.0085)
        .linkDirectionalParticleWidth(2.5);

      Graph.onNodeHover(node => {
        if (!graph3dPinnedNode) applyGraph3dInfo(node || null);
        graph3dCanvasEl.style.cursor = node ? 'pointer' : '';
        if (node && node.type === 'video') {
          startGraph3dVideoForNode(node);
        } else {
          stopGraph3dActiveVideo();
        }
      });
      Graph.onNodeClick(node => {
        if (!node) return;
        if (graph3dPinnedNode && graph3dPinnedNode.id === node.id) {
          graph3dPinnedNode = null;
          applyGraph3dInfo(node);
        } else {
          graph3dPinnedNode = node;
          applyGraph3dInfo(node);
        }
        syncGraph3dSearchHighlightByNode(node);
        graph3dAutoFitLocked = true;
        const camera = Graph.camera();
        if (!camera) return;
        const distance = 180;
        const x = node.x || 0;
        const y = node.y || 0;
        const z = node.z || 0;
        const length = Math.max(Math.hypot(x, y, z), 1);
        const ratio = 1 + distance / length;
        Graph.cameraPosition({ x: x * ratio, y: y * ratio, z: z * ratio }, node, 600);
      });

      // ノードの右クリックイベントを追加
      Graph.onNodeRightClick((node, event) => {
        if (!node || !node.name) return;
        // イベントオブジェクトが渡されない場合は、最後のマウスイベントを使用
        const mouseEvent = event || window.event || { clientX: 0, clientY: 0 };
        
        // デフォルトのコンテキストメニューを防ぐ
        if (mouseEvent && mouseEvent.preventDefault) {
          mouseEvent.preventDefault();
        }
        
        showGraph3dContextMenu(node, mouseEvent);
      });

      if (typeof Graph.onBackgroundClick === 'function') {
        Graph.onBackgroundClick(() => {
          graph3dPinnedNode = null;
          applyGraph3dInfo(null);
          hideGraph3dContextMenu();
          stopGraph3dActiveVideo();
          syncGraph3dSearchHighlightByNode(null);
        });
      }

      if (typeof Graph.nodeThreeObjectExtend === 'function') {
        try { Graph.nodeThreeObjectExtend(false); } catch (_) {}
      }
      if (window.THREE) {
        graph3dSphereGeometry = new THREE.SphereGeometry(1, 36, 36);
      } else {
        graph3dSphereGeometry = null;
      }
      graph3dMediaTexturePromises.clear();
      refreshGraph3dNodeObjects({ force: true });
      refreshGraph3dSearchResults({ keepIndex: true });

      try {
        Graph.d3Force('link').distance(48);
        Graph.d3Force('charge').strength(-120);
      } catch (_) {}

      let graphFitTimer = null;
      const attemptFit = (delay = 0, { force = false } = {}) => {
        if (graph3dAutoFitLocked && !force) return;
        if (graphFitTimer) {
          clearTimeout(graphFitTimer);
          graphFitTimer = null;
        }
        graphFitTimer = setTimeout(() => {
          try {
            const controls = Graph.controls && Graph.controls();
            if (controls && controls.target) {
              controls.target.set(0, 0, 0);
              controls.update && controls.update();
              controls.enableDamping = true;
              controls.dampingFactor = 0.08;
            }
            Graph.cameraPosition({ x: 0, y: 0, z: 900 }, { x: 0, y: 0, z: 0 }, 0);
            Graph.zoomToFit(600, 120);
            graph3dHasInitialFit = true;
          } catch (_) {}
        }, delay);
      };

      const clearGraph3dCanvasInlineSize = () => {
        if (!graph3dCanvasContainer) return;
        graph3dCanvasContainer.style.removeProperty('width');
        graph3dCanvasContainer.style.removeProperty('height');
      };

      const applyGraphDimensions = (width, height, triggerFit = false) => {
        if (!graph3dInstance) return;
        clearGraph3dCanvasInlineSize();
        let w = Number.isFinite(Number(width)) ? Number(width) : 0;
        let h = Number.isFinite(Number(height)) ? Number(height) : 0;
        if ((!w || w <= 0 || !h || h <= 0) && graph3dCanvasEl) {
          const rect = graph3dCanvasEl.getBoundingClientRect();
          if (!w || w <= 0) {
            w = rect?.width || graph3dCanvasEl.clientWidth || graph3dCanvasEl.offsetWidth || 0;
          }
          if (!h || h <= 0) {
            h = rect?.height || graph3dCanvasEl.clientHeight || graph3dCanvasEl.offsetHeight || 0;
          }
        }
        if ((!w || w <= 0) && graph3dLastCanvasSize.width > 0) {
          w = graph3dLastCanvasSize.width;
        }
        if ((!h || h <= 0) && graph3dLastCanvasSize.height > 0) {
          h = graph3dLastCanvasSize.height;
        }
        const safeWidth = Math.max(160, Math.floor(w || 0));
        const safeHeight = Math.max(160, Math.floor(h || 0));
        if (typeof graph3dInstance.width === 'function') {
          graph3dInstance.width(safeWidth);
        }
        if (typeof graph3dInstance.height === 'function') {
          graph3dInstance.height(safeHeight);
        }
        if (safeWidth > 160) {
          graph3dLastCanvasSize.width = safeWidth;
        }
        if (safeHeight > 160) {
          graph3dLastCanvasSize.height = safeHeight;
        }
        clearGraph3dCanvasInlineSize();
        if (triggerFit) attemptFit(200);
      };

      try {
        applyGraphDimensions(graph3dCanvasEl.clientWidth, graph3dCanvasEl.clientHeight, false);
        if (typeof Graph.postProcessing === 'function') {
          Graph.postProcessing(true);
        }
        if (typeof Graph.refresh === 'function') {
          Graph.refresh();
        }
        ensureBloomPass(Graph).catch(() => {});
        if (Graph.renderer && typeof Graph.renderer === 'function') {
          const renderer = Graph.renderer();
          if (renderer) {
            renderer.toneMappingExposure = 1.25;
          }
        }
        attemptFit(400, { force: true });
        if (typeof ResizeObserver !== 'undefined') {
          graph3dResizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
              if (entry.target === graph3dCanvasEl) {
                const { width: w, height: h } = entry.contentRect || {};
                applyGraphDimensions(w, h, true);
              }
            }
          });
          graph3dResizeObserver.observe(graph3dCanvasEl);
        }
        setTimeout(() => {
          if (container && !container.querySelector('canvas')) {
            graph3dSetStatus('3Dビューの初期化に失敗しました。', 'error');
          }
        }, 1200);
      } catch (_) {}

      const rootNode = Array.isArray(data?.nodes) ? data.nodes.find(n => n.type === 'root') : null;
      if (rootNode) applyGraph3dInfo(rootNode);
    }

    async function ensureGraph3dInitialized(options = {}) {
      if (state.graph3dCollapsed) return null;
      const { forceReload = false } = options || {};
      if (graph3dLoadPromise) return graph3dLoadPromise;
      if (!forceReload && graph3dInstance && graph3dDataCache) {
        graph3dSetStatus('', 'success');
        return Promise.resolve(graph3dInstance);
      }
      graph3dLoadPromise = (async () => {
        graph3dSetStatus('ディレクトリを解析中...', 'loading');
        if (graph3dReloadEl) {
          graph3dReloadEl.disabled = true;
          graph3dReloadEl.classList.add('is-loading');
        }
        graph3dPinnedNode = null;
        if (graph3dSearchInputEl && graph3dSearchInputEl.value && graph3dSearchInputEl.value.trim()) {
          renderGraph3dSearchMessage('3Dデータを解析中です...');
          updateGraph3dSearchCount();
        }
        try {
          const ForceGraphFactory = await ensureForceGraphLibrary();
          const base = await probeBackendBase();
          if (!base) throw new Error('バックエンドに接続できません');
          const endpoint = `${base.replace(/\/$/, '')}/api/directory-graph`;
          const res = await fetch(endpoint, { cache: 'no-store' });
          if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(text ? `${res.status} ${text}` : `HTTP ${res.status}`);
          }
          const data = await res.json();
          graph3dDataCache = data;
          const nodeCount = Array.isArray(data?.nodes) ? data.nodes.length : 0;
          const linkCount = Array.isArray(data?.links) ? data.links.length : 0;
          console.log('[Taskboard][3D] graph data', { nodes: nodeCount, links: linkCount, baseDir: data?.baseDir });
          if (graph3dBaseEl) graph3dBaseEl.textContent = data.baseDir || '-';
          updateGraph3dStats(data.stats, data.totals);
          setupGraph3dScene(ForceGraphFactory, data);
          if (!nodeCount || nodeCount <= 1) {
            graph3dSetStatus('表示できるノードがありません。SCAN_PATHの内容を確認してください。', 'info');
          } else {
            graph3dSetStatus('', 'success');
          }
          return graph3dInstance;
        } catch (err) {
          graph3dSetStatus(err && err.message ? `エラー: ${err.message}` : '3Dビューの読み込みに失敗しました。', 'error');
          throw err;
        } finally {
          if (graph3dReloadEl) {
            graph3dReloadEl.disabled = false;
            graph3dReloadEl.classList.remove('is-loading');
          }
          graph3dLoadPromise = null;
        }
      })();
      return graph3dLoadPromise;
    }

    function updateGraph3dToggleLabel() {
      if (!graph3dToggleEl) return;
      graph3dToggleEl.setAttribute('aria-expanded', state.graph3dCollapsed ? 'false' : 'true');
      graph3dToggleEl.classList.toggle('is-active', !state.graph3dCollapsed);
    }

    function updateGraph3dInfoVisibility() {
      if (!graph3dInfoToggleEl) return;
      const collapsed = !!state.graph3dInfoCollapsed;
      if (graph3dSideEl) {
        graph3dSideEl.classList.toggle('is-collapsed', collapsed);
      }
      const label = collapsed ? 'info' : 'ノード情報を隠す';
      graph3dInfoToggleEl.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      graph3dInfoToggleEl.setAttribute('aria-label', label);
      graph3dInfoToggleEl.title = label;
      graph3dInfoToggleEl.classList.toggle('is-active', !collapsed);
      graph3dInfoToggleEl.disabled = !!state.graph3dCollapsed;
      graph3dInfoToggleEl.setAttribute('aria-disabled', state.graph3dCollapsed ? 'true' : 'false');
      if (graph3dInfoLabelEl) {
        graph3dInfoLabelEl.textContent = label;
      }
      const shouldOffset = !collapsed && !state.graph3dCollapsed && graph3dSideEl
        && typeof graph3dSideEl.getBoundingClientRect === 'function';
      if (shouldOffset) {
        let isNarrow = false;
        try {
          isNarrow = typeof window !== 'undefined'
            && typeof window.matchMedia === 'function'
            && window.matchMedia('(max-width: 900px)').matches;
        } catch (_) {}
        if (isNarrow) {
          graph3dInfoToggleEl.style.transform = '';
        } else {
          const rect = graph3dSideEl.getBoundingClientRect();
          const offset = rect && rect.width ? Math.max(0, Math.round(rect.width + 18)) : 0;
          graph3dInfoToggleEl.style.transform = offset ? `translateX(-${offset}px)` : '';
        }
      } else {
        graph3dInfoToggleEl.style.transform = '';
      }
    }

    function renderGraph3dPanel() {
      updateGraph3dToggleLabel();
      updateGraph3dModeToggle();
      updateGraph3dInfoVisibility();
      updateGraph3dSearchState();
      updateViewMode();
      if (state.graph3dCollapsed) {
        graph3dSetStatus('', 'info');
        resetGraph3dInfo();
        return;
      }
      ensureGraph3dInitialized().catch(() => {});
    }

    function setGraph3dCollapsed(nextValue) {
      const next = !!nextValue;
      if (state.graph3dCollapsed === next) return;
      if (!next) {
        if (!state.heatmapCollapsed) setHeatmapCollapsed(true);
        if (!state.matrixCollapsed) setMatrixCollapsed(true);
      }
      state.graph3dCollapsed = next;
      renderGraph3dPanel();
      if (!next) setOpen(true);
      schedulePersist();
      if (next && graph3dResizeObserver && typeof graph3dResizeObserver.disconnect === 'function') {
        try { graph3dResizeObserver.disconnect(); } catch (_) {}
        graph3dResizeObserver = null;
      }
      if (next) stopGraph3dActiveVideo();
    }

    function setGraph3dInfoCollapsed(nextValue) {
      const next = !!nextValue;
      if (state.graph3dInfoCollapsed === next) return;
      state.graph3dInfoCollapsed = next;
      updateGraph3dInfoVisibility();
      schedulePersist();
    }

    // グラフ3Dコンテキストメニューを作成
    function ensureGraph3dContextMenu() {
      if (graph3dContextMenu) return graph3dContextMenu;
      
      graph3dContextMenu = document.createElement('div');
      graph3dContextMenu.className = 'taskboard-context-menu graph3d-context-menu';
      graph3dContextMenu.innerHTML = `
        <button type="button" class="tb-context-item" data-action="copy-path">
          <span>ファイルパスをコピー</span>
        </button>
        <button type="button" class="tb-context-item" data-action="copy-name">
          <span>ファイル名をコピー</span>
        </button>
      `;
      document.body.appendChild(graph3dContextMenu);

      graph3dContextMenu.addEventListener('click', async (evt) => {
        const button = evt.target.closest('.tb-context-item');
        if (!button) return;
        
        const action = button.dataset.action;
        const node = graph3dContextMenu._targetNode;
        
        if (!node || !node.name) return;
        
        try {
          if (action === 'copy-path') {
            await copyTextToClipboard(node.name);
            hideGraph3dContextMenu();
            showCopyNotification('ファイルパスをコピーしました');
          } else if (action === 'copy-name') {
            const fileName = node.name.split('/').pop() || node.name;
            await copyTextToClipboard(fileName);
            hideGraph3dContextMenu();
            showCopyNotification('ファイル名をコピーしました');
          }
        } catch (err) {
          console.error('コピーに失敗しました:', err);
          showCopyNotification('コピーに失敗しました', 'error');
        }
      });

      // グローバルクリックで閉じる
      const onGlobalClick = (evt) => {
        if (!graph3dContextMenu.contains(evt.target)) {
          hideGraph3dContextMenu();
        }
      };
      
      // ESCキーで閉じる
      const onGlobalKeydown = (evt) => {
        if (evt.key === 'Escape') {
          hideGraph3dContextMenu();
        }
      };

      // イベントリスナーを保存
      graph3dContextMenu._globalClickHandler = onGlobalClick;
      graph3dContextMenu._globalKeydownHandler = onGlobalKeydown;

      return graph3dContextMenu;
    }

    // グラフ3Dコンテキストメニューを表示
    function showGraph3dContextMenu(node, event) {
      if (!node || !event) return;
      
      const menu = ensureGraph3dContextMenu();
      menu._targetNode = node;
      
      // マウス位置を取得
      const x = event.clientX || event.pageX || 0;
      const y = event.clientY || event.pageY || 0;
      
      // メニューを表示
      menu.classList.add('is-visible');
      
      // 位置を設定（画面外に出ないように調整）
      setTimeout(() => {
        const rect = menu.getBoundingClientRect();
        const viewWidth = window.innerWidth;
        const viewHeight = window.innerHeight;
        
        let left = x;
        let top = y;
        
        if (left + rect.width > viewWidth) {
          left = viewWidth - rect.width - 10;
        }
        if (top + rect.height > viewHeight) {
          top = viewHeight - rect.height - 10;
        }
        
        menu.style.left = left + 'px';
        menu.style.top = top + 'px';
      }, 0);

      // グローバルイベントリスナーを追加
      document.addEventListener('click', menu._globalClickHandler);
      document.addEventListener('keydown', menu._globalKeydownHandler);
    }

    // グラフ3Dコンテキストメニューを非表示
    function hideGraph3dContextMenu() {
      if (graph3dContextMenu) {
        graph3dContextMenu.classList.remove('is-visible');
        graph3dContextMenu._targetNode = null;
        
        // グローバルイベントリスナーを削除
        if (graph3dContextMenu._globalClickHandler) {
          document.removeEventListener('click', graph3dContextMenu._globalClickHandler);
        }
        if (graph3dContextMenu._globalKeydownHandler) {
          document.removeEventListener('keydown', graph3dContextMenu._globalKeydownHandler);
        }
      }
    }

    // コピー通知を表示
    function showCopyNotification(message, type = 'success') {
      // 既存の通知を削除
      const existingNotification = document.querySelector('.copy-notification');
      if (existingNotification) {
        existingNotification.remove();
      }

      // 新しい通知を作成
      const notification = document.createElement('div');
      notification.className = `copy-notification copy-notification--${type}`;
      notification.textContent = message;
      notification.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: ${type === 'error' ? 'rgba(239, 68, 68, 0.9)' : 'rgba(34, 197, 94, 0.9)'};
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        font-size: 0.9rem;
        font-weight: 600;
        z-index: 100000;
        pointer-events: none;
        animation: slideIn 0.3s ease;
      `;
      document.body.appendChild(notification);

      // 2秒後に削除
      setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
      }, 2000);
    }
    updateSyncStatusFromState('info');
    updateModelBadge();
    if (importanceEl) {
      importanceEl.value = normalizePriorityLevel(state.composeImportance, 'medium');
      importanceEl.addEventListener('change', (event) => {
        const value = normalizePriorityLevel(event.target.value, 'medium');
        state.composeImportance = value;
        importanceEl.value = value;
        schedulePersist();
      });
    }
    if (urgencyEl) {
      urgencyEl.value = normalizePriorityLevel(state.composeUrgency, 'medium');
      urgencyEl.addEventListener('change', (event) => {
        const value = normalizePriorityLevel(event.target.value, 'medium');
        state.composeUrgency = value;
        urgencyEl.value = value;
        schedulePersist();
      });
    }
    modelToggleEl?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showModelDial();
    });

    let taskContextMenuEl = null;
    let taskContextMenuCopySource = null;
    let taskContextMenuBound = false;

    function resetTaskContextMenuLabels() {
      if (!taskContextMenuEl) return;
      taskContextMenuEl.querySelectorAll('.tb-context-item').forEach((btn) => {
        if (btn.dataset && btn.dataset.label) {
          btn.innerHTML = btn.dataset.label;
        }
      });
    }

    function hideTaskContextMenu() {
      if (!taskContextMenuEl) return;
      taskContextMenuEl.classList.remove('is-visible');
      taskContextMenuEl.setAttribute('aria-hidden', 'true');
      resetTaskContextMenuLabels();
      taskContextMenuCopySource = null;
    }

    async function copyTextToClipboard(text) {
      if (!text) return false;
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (_) {
        try {
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.style.position = 'fixed';
          ta.style.left = '-9999px';
          document.body.appendChild(ta);
          ta.focus();
          ta.select();
          const ok = document.execCommand('copy');
          document.body.removeChild(ta);
          return ok;
        } catch (err) {
          console.warn('copy failed', err);
          return false;
        }
      }
    }

    function buildTaskCopySource(task) {
      if (!task || typeof task !== 'object') {
        return { all: '', prompt: '', response: '', summary: '' };
      }
      const bundle = task.copyBundle && typeof task.copyBundle === 'object' ? task.copyBundle : null;
      const prompt = (bundle && typeof bundle.prompt === 'string'
        ? bundle.prompt
        : (typeof task.prompt === 'string' ? task.prompt : '')).trim();
      const response = (bundle && typeof bundle.response === 'string'
        ? bundle.response
        : (typeof task.response === 'string' ? task.response : '')).trim();
      const summary = (bundle && typeof bundle.summary === 'string'
        ? bundle.summary
        : (typeof task.completionSummary === 'string' ? task.completionSummary : '')).trim();

      if (bundle && typeof bundle.full === 'string' && bundle.full.trim()) {
        return {
          all: bundle.full.trim(),
          prompt,
          response,
          summary
        };
      }

      const metaLines = Array.isArray(bundle?.meta)
        ? bundle.meta.filter(line => typeof line === 'string' && line.trim()).map(line => line.trim())
        : [];
      if (!metaLines.length) {
        metaLines.push(`タスクID: ${task.id}`);
        if (task.status) metaLines.push(`ステータス: ${task.status}`);
        if (task.model || task.provider) {
          const providerLabel = task.provider ? ` / ${task.provider}` : '';
          metaLines.push(`モデル: ${task.model || '(不明)'}${providerLabel}`.trim());
        }
        const startedAt = formatTaskTimestamp(task.createdAt) || (task.createdAt || '');
        if (startedAt) metaLines.push(`開始: ${startedAt}`);
        const updatedAt = (task.updatedAt && task.updatedAt !== task.createdAt)
          ? (formatTaskTimestamp(task.updatedAt) || task.updatedAt)
          : null;
        if (updatedAt) metaLines.push(`更新: ${updatedAt}`);
        if (task.exitCode != null) metaLines.push(`終了コード: ${task.exitCode}`);
        if (task.externalTerminal && task.externalTerminal.command) {
          metaLines.push(`外部コマンド: ${task.externalTerminal.command}`);
        }
      }

      const sectionBlocks = [];
      if (prompt) sectionBlocks.push(`【プロンプト】\n${prompt}`);
      if (response) sectionBlocks.push(`【AIレスポンス】\n${response}`);
      if (summary) sectionBlocks.push(`【完了まとめ】\n${summary}`);

      const allParts = [];
      if (metaLines.length) allParts.push(metaLines.join('\n'));
      if (sectionBlocks.length) allParts.push(sectionBlocks.join('\n\n'));
      const all = allParts.join('\n\n').trim();

      return { all, prompt, response, summary };
    }

    function setTaskContextButtonState(action, enabled) {
      if (!taskContextMenuEl) return;
      const btn = taskContextMenuEl.querySelector(`[data-action="${action}"]`);
      if (!btn) return;
      const isEnabled = !!enabled;
      btn.disabled = !isEnabled;
      btn.setAttribute('aria-disabled', isEnabled ? 'false' : 'true');
      btn.classList.toggle('is-disabled', !isEnabled);
    }

    function ensureTaskContextMenu() {
      if (!taskContextMenuEl) {
        const menu = document.createElement('div');
        menu.className = 'taskboard-context-menu';
        menu.setAttribute('role', 'menu');
        menu.setAttribute('aria-hidden', 'true');
        menu.innerHTML = `
          <button type="button" class="tb-context-item" data-action="copy-all" data-label="📋 タスク全体をコピー" role="menuitem">📋 タスク全体をコピー</button>
          <button type="button" class="tb-context-item" data-action="copy-prompt" data-label="📝 プロンプトをコピー" role="menuitem">📝 プロンプトをコピー</button>
          <button type="button" class="tb-context-item" data-action="copy-response" data-label="🤖 応答をコピー" role="menuitem">🤖 応答をコピー</button>
          <button type="button" class="tb-context-item" data-action="copy-summary" data-label="✍️ 完了まとめをコピー" role="menuitem">✍️ 完了まとめをコピー</button>
        `;
        document.body.appendChild(menu);
        taskContextMenuEl = menu;
      }
      if (!taskContextMenuBound && taskContextMenuEl) {
        taskContextMenuEl.addEventListener('click', async (event) => {
          const btn = event.target.closest('.tb-context-item');
          if (!btn || btn.disabled) return;
          event.preventDefault();
          event.stopPropagation();
          const action = btn.getAttribute('data-action');
          if (!action || !taskContextMenuCopySource) return;
          const map = {
            'copy-all': taskContextMenuCopySource.all,
            'copy-prompt': taskContextMenuCopySource.prompt,
            'copy-response': taskContextMenuCopySource.response,
            'copy-summary': taskContextMenuCopySource.summary
          };
          const targetText = map[action] || '';
          if (!targetText) return;
          const original = btn.dataset.label || btn.innerHTML;
          const ok = await copyTextToClipboard(targetText);
          if (ok) {
            btn.innerHTML = '✅ コピーしました';
            btn.disabled = true;
            setTimeout(() => {
              if (btn.dataset && btn.dataset.label) btn.innerHTML = btn.dataset.label;
              btn.disabled = !!map[action] ? false : true;
              hideTaskContextMenu();
            }, 1200);
          }
        });
        const onGlobalClick = (evt) => {
          if (!taskContextMenuEl) return;
          if (taskContextMenuEl.contains(evt.target)) return;
          hideTaskContextMenu();
        };
        const onGlobalKeydown = (evt) => {
          if (evt.key === 'Escape') hideTaskContextMenu();
        };
        document.addEventListener('click', onGlobalClick, true);
        document.addEventListener('keydown', onGlobalKeydown, true);
        document.addEventListener('scroll', hideTaskContextMenu, true);
        window.addEventListener('resize', hideTaskContextMenu);
        taskContextMenuBound = true;
      }
      return taskContextMenuEl;
    }

    function showTaskContextMenu(task, clientX, clientY) {
      const menu = ensureTaskContextMenu();
      if (!menu) return;
      taskContextMenuCopySource = buildTaskCopySource(task);
      setTaskContextButtonState('copy-all', !!taskContextMenuCopySource.all);
      setTaskContextButtonState('copy-prompt', !!taskContextMenuCopySource.prompt);
      setTaskContextButtonState('copy-response', !!taskContextMenuCopySource.response);
      setTaskContextButtonState('copy-summary', !!taskContextMenuCopySource.summary);

      let left = Math.max(clientX, 8);
      let top = Math.max(clientY, 8);
      menu.style.left = `${Math.round(left)}px`;
      menu.style.top = `${Math.round(top)}px`;
      menu.classList.add('is-visible');
      menu.setAttribute('aria-hidden', 'false');

      const rect = menu.getBoundingClientRect();
      if (rect.right > window.innerWidth) {
        left = Math.max(8, window.innerWidth - rect.width - 8);
      }
      if (rect.bottom > window.innerHeight) {
        top = Math.max(8, window.innerHeight - rect.height - 8);
      }
      menu.style.left = `${Math.round(left)}px`;
      menu.style.top = `${Math.round(top)}px`;
    }

    if (listEl && !listEl.dataset.contextBound) {
      listEl.dataset.contextBound = '1';
      listEl.addEventListener('contextmenu', (event) => {
        const targetCard = event.target.closest('.task-item');
        if (!targetCard) return;
        const selection = window.getSelection && window.getSelection();
        if (selection && selection.toString().trim()) return;
        if (event.shiftKey) return;
        event.preventDefault();
        const id = targetCard.getAttribute('data-id');
        if (!id) return;
        const task = state.tasks.find((t) => String(t.id) === String(id));
        if (!task) return;
        hideTaskContextMenu();
        showTaskContextMenu(task, event.clientX, event.clientY);
      });
    }
    if (heatmapToggleEl) {
      heatmapToggleEl.addEventListener('click', (e) => {
        e.preventDefault();
        if (state.heatmapCollapsed) {
          setHeatmapCollapsed(false);
        } else {
          setHeatmapCollapsed(true);
        }
      });
      updateHeatmapToggleLabel();
    }
    if (matrixToggleEl) {
      matrixToggleEl.addEventListener('click', (e) => {
        e.preventDefault();
        if (state.matrixCollapsed) {
          setMatrixCollapsed(false);
        } else {
          setMatrixCollapsed(true);
        }
      });
      updateMatrixToggleLabel();
    } else {
      updateMatrixToggleLabel();
    }
    if (graph3dToggleEl) {
      graph3dToggleEl.addEventListener('click', (e) => {
        e.preventDefault();
        if (state.graph3dCollapsed) {
          setGraph3dCollapsed(false);
        } else {
          setGraph3dCollapsed(true);
        }
      });
      updateGraph3dToggleLabel();
    } else {
      updateGraph3dToggleLabel();
    }
    if (graph3dReloadEl) {
      graph3dReloadEl.addEventListener('click', (e) => {
        e.preventDefault();
        if (state.graph3dCollapsed) {
          setGraph3dCollapsed(false);
        }
        ensureGraph3dInitialized({ forceReload: true }).catch(() => {});
      });
    }
    if (graph3dInfoToggleEl) {
      graph3dInfoToggleEl.addEventListener('click', (e) => {
        e.preventDefault();
        if (graph3dInfoToggleEl.disabled) return;
        setGraph3dInfoCollapsed(!state.graph3dInfoCollapsed);
      });
    }
    if (graph3dModeMediaEl) {
      graph3dModeMediaEl.addEventListener('click', (e) => {
        e.preventDefault();
        setGraph3dViewMode('media');
      });
    }
    if (graph3dModeColorEl) {
      graph3dModeColorEl.addEventListener('click', (e) => {
        e.preventDefault();
        setGraph3dViewMode('color');
      });
    }
    updateGraph3dModeToggle();
    updateViewMode();
    if (matrixEl && !matrixEl.dataset.bound) {
      matrixEl.dataset.bound = '1';
      function openTaskFromMatrixChip(id) {
        if (!id) return;
        const task = state.tasks.find((t) => String(t.id) === String(id));
        if (!task) return;
        setOpen(true);
        if (!isTaskExpanded(task)) {
          setTaskExpanded(task, true);
        }
        render();
        requestAnimationFrame(() => {
          const escapedId = (window.CSS && typeof window.CSS.escape === 'function')
            ? window.CSS.escape(String(id))
            : String(id).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
          const card = listEl ? listEl.querySelector(`.task-item[data-id="${escapedId}"]`) : null;
          if (card) {
            card.classList.add('task-highlight');
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => card.classList.remove('task-highlight'), 1200);
          }
        });
      }

      matrixEl.addEventListener('click', (event) => {
        const chip = event.target.closest('.tb-matrix-chip');
        const cell = event.target.closest('.tb-matrix-cell');
        if (chip && !chip.classList.contains('tb-matrix-chip-more')) {
          const id = chip.getAttribute('data-id');
          const parentCell = chip.closest('.tb-matrix-cell');
          if (parentCell) {
            const importance = parentCell.getAttribute('data-importance');
            const urgency = parentCell.getAttribute('data-urgency');
            if (importance && urgency) {
              setMatrixSelection({ importance, urgency });
            }
          }
          if (id) {
            openTaskFromMatrixChip(id);
          }
          return;
        }
        if (cell) {
          const importance = cell.getAttribute('data-importance');
          const urgency = cell.getAttribute('data-urgency');
          if (!importance || !urgency) return;
          const already = state.matrixSelection
            && state.matrixSelection.importance === importance
            && state.matrixSelection.urgency === urgency;
          if (already) {
            clearMatrixSelection();
          } else {
            setMatrixSelection({ importance, urgency });
          }
        }
      });

      matrixEl.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') return;
        const chip = event.target.closest('.tb-matrix-chip');
        if (chip && !chip.classList.contains('tb-matrix-chip-more')) {
          const id = chip.getAttribute('data-id');
          if (id) {
            const parentCell = chip.closest('.tb-matrix-cell');
            if (parentCell) {
              const importance = parentCell.getAttribute('data-importance');
              const urgency = parentCell.getAttribute('data-urgency');
              if (importance && urgency) {
                setMatrixSelection({ importance, urgency });
              }
            }
            event.preventDefault();
            openTaskFromMatrixChip(id);
          }
          return;
        }
        const cell = event.target.closest('.tb-matrix-cell');
        if (!cell) return;
        const importance = cell.getAttribute('data-importance');
        const urgency = cell.getAttribute('data-urgency');
        if (!importance || !urgency) return;
        event.preventDefault();
        const already = state.matrixSelection
          && state.matrixSelection.importance === importance
          && state.matrixSelection.urgency === urgency;
        if (already) {
          clearMatrixSelection();
        } else {
          setMatrixSelection({ importance, urgency });
        }
      });
    }
    // Create a global dial overlay for MCP tools
    let dialOverlay = document.getElementById('mcpDialOverlay');
    if (!dialOverlay) {
      dialOverlay = document.createElement('div');
      dialOverlay.id = 'mcpDialOverlay';
      dialOverlay.className = 'mcp-dial-overlay';
      
      const dialContainer = document.createElement('div');
      dialContainer.className = 'mcp-dial-container';
      
      // 3D回転ラッパー
      const itemsWrapper = document.createElement('div');
      itemsWrapper.className = 'mcp-dial-items-wrapper';
      dialContainer.appendChild(itemsWrapper);
      
      // 3D軌道エフェクト（オプション）
      const orbit3D = document.createElement('div');
      orbit3D.className = 'mcp-dial-orbit-3d';
      itemsWrapper.appendChild(orbit3D);
      
      // 中央の入力エリア
      const center = document.createElement('div');
      center.className = 'mcp-dial-center';
      center.innerHTML = `
        <input type="text" class="mcp-dial-input" id="mcpDialInput" placeholder="ツールを検索..." autocomplete="off" />
        <div class="mcp-dial-hint">クリックまたはEnterで選択</div>
      `;
      dialContainer.appendChild(center);
      
      // 固定位置のツールチップ
      const fixedTooltip = document.createElement('div');
      fixedTooltip.className = 'mcp-dial-tooltip-fixed';
      fixedTooltip.id = 'mcpDialTooltipFixed';
      dialOverlay.appendChild(fixedTooltip);
      
      // ツールアイテムコンテナ
      const itemsContainer = document.createElement('div');
      itemsContainer.id = 'mcpDialItems';
      itemsContainer.className = 'mcp-dial-items';
      itemsWrapper.appendChild(itemsContainer);
      
      // 閉じるボタン
      const closeBtn = document.createElement('button');
      closeBtn.className = 'mcp-dial-close';
      closeBtn.innerHTML = '×';
      closeBtn.setAttribute('aria-label', '閉じる');
      
      dialOverlay.appendChild(dialContainer);
      dialOverlay.appendChild(closeBtn);
      document.body.appendChild(dialOverlay);
      
      // イベントリスナー
      closeBtn.addEventListener('click', () => {
        dialOverlay.classList.remove('active');
        hideTooltip();
        if (inputEl) inputEl.focus();
      });
      
      dialOverlay.addEventListener('click', (e) => {
        if (e.target === dialOverlay) {
          dialOverlay.classList.remove('active');
          hideTooltip();
          if (inputEl) inputEl.focus();
        }
      });
      
      // ダイヤル内の入力欄のイベント
      const dialInput = center.querySelector('#mcpDialInput');
      dialInput?.addEventListener('input', (e) => {
        const value = e.target.value;
        updateDialItems(value);
      });
      
      let dialActiveIndex = 0;
      dialInput?.addEventListener('keydown', (e) => {
        const items = Array.from(dialOverlay.querySelectorAll('.mcp-dial-item'));
        
        if (e.key === 'Escape') {
          dialOverlay.classList.remove('active');
          hideTooltip();
          if (inputEl) inputEl.focus();
        } else if (e.key === 'Enter') {
          const activeItem = dialOverlay.querySelector('.mcp-dial-item.active');
          if (activeItem) {
            activeItem.click();
          }
        } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          if (items.length > 0) {
            dialActiveIndex = (dialActiveIndex + 1) % items.length;
            items.forEach((item, i) => {
              item.classList.toggle('active', i === dialActiveIndex);
            });
          }
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          if (items.length > 0) {
            dialActiveIndex = (dialActiveIndex - 1 + items.length) % items.length;
            items.forEach((item, i) => {
              item.classList.toggle('active', i === dialActiveIndex);
            });
          }
        }
      });
    }

    async function probeBackendBase(){
      const candidates = [];
      const add = (s) => { if (s && !candidates.includes(s)) candidates.push(s); };
      // 優先: 明示指定
      add(state.backendBase);
      // 典型候補（Node.jsサーバーを最優先）
      add('http://localhost:7777');
      add('http://127.0.0.1:7777');
      add('/backend');
      add('http://localhost:3001/backend');
      add('http://127.0.0.1:3001/backend');
      for (const base of candidates) {
        try {
          const url = base.replace(/\/$/, '') + '/api/config';
          const res = await fetch(url, { cache: 'no-cache', mode: 'cors' });
          if (res.ok) {
            if (state.backendBase !== base) {
              state.backendBase = base;
              schedulePersist();
            }
            return base;
          }
        } catch(_) {}
    }
    return state.backendBase;
  }


    async function launchCodexTerminalSession(prompt, modelOption){
      const base = await probeBackendBase();
      const payload = {
        action: 'launch',
        prompt: typeof prompt === 'string' ? prompt : '',
        model: modelOption && modelOption.id ? modelOption.id : null
      };
      const res = await fetch(`${base.replace(/\/$/, '')}/api/terminal/codex`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        if (res.status === 404) {
          return;
        }
        let detail = '';
        try {
          const data = await res.json();
          detail = data && (data.message || data.error) ? (data.message || data.error) : '';
        } catch (_) {
          detail = await res.text().catch(() => '') || '';
        }
        const message = detail ? `${res.status} ${detail}` : `HTTP ${res.status}`;
        throw new Error(message);
      }
      const data = await res.json();
      if (!data || !data.sessionId) {
        throw new Error('invalid_response');
      }
      return data;
    }

    async function focusCodexTerminalSession(sessionId, appleSessionId){
      if (!sessionId) return;
      const base = await probeBackendBase();
      const res = await fetch(`${base.replace(/\/$/, '')}/api/terminal/codex`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(appleSessionId ? { action: 'focus', sessionId, appleSessionId } : { action: 'focus', sessionId })
      });
      if (!res.ok) {
        let detail = '';
        try {
          const data = await res.json();
          detail = data && (data.message || data.error) ? (data.message || data.error) : '';
        } catch (_) {
          detail = await res.text().catch(() => '') || '';
        }
        const message = detail ? `${res.status} ${detail}` : `HTTP ${res.status}`;
        throw new Error(message);
      }
    }

    async function focusExternalTerminalTask(task) {
      if (!task || !task.externalTerminal || !task.externalTerminal.sessionId) return;
      try {
        await focusCodexTerminalSession(task.externalTerminal.sessionId, task.externalTerminal.appleSessionId || null);
      } catch (err) {
        console.error('Failed to focus terminal session', err);
      }
    }

    async function requestCompletionSummary(task) {
      const base = await probeBackendBase();
      const payload = {
        action: 'summary',
        taskPrompt: task && typeof task.prompt === 'string' ? task.prompt : '',
        basePrompt: '完了済みにする際に自動でterminalにこれまでの作業をまとめて、特に編集、生成したファイルパスを必ず記述すること'
      };
      if (task && task.externalTerminal && task.externalTerminal.sessionId) {
        payload.sessionId = task.externalTerminal.sessionId;
        if (task.externalTerminal.appleSessionId) {
          payload.appleSessionId = task.externalTerminal.appleSessionId;
        }
      }
      const res = await fetch(`${base.replace(/\/$/, '')}/api/terminal/codex`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        let detail = '';
        try {
          const data = await res.json();
          detail = data && (data.message || data.error) ? (data.message || data.error) : '';
        } catch (_) {
          detail = await res.text().catch(() => '') || '';
        }
        const message = detail ? `${res.status} ${detail}` : `HTTP ${res.status}`;
        throw new Error(message);
      }
      return res.json();
    }

    async function generateCompletionSummaryForTask(task) {
      try {
        return await requestCompletionSummary(task);
      } catch (err) {
        console.error('Completion summary generation failed', err);
        const message = err && err.message ? err.message : String(err || 'unknown_error');
        return {
          summary: `完了要約の生成に失敗しました: ${message}`
        };
      }
    }


    function formatSaasLabel(baseName) {
      return `saas_${baseName}`;
    }

    function prettySaasDescription(doc) {
      if (doc.title) return `${doc.title} (${doc.file})`;
      return doc.file;
    }

    async function loadSaasDocuments(backendBase){
      try {
        const endpoint = `${backendBase.replace(/\/$/, '')}/api/saas/list`;
        const res = await fetch(endpoint, { cache: 'no-cache' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const payload = await res.json();
        const files = Array.isArray(payload.files) ? payload.files : [];
        const docs = files.map(doc => {
          const label = formatSaasLabel(doc.id || doc.file.replace(/\.ya?ml$/i, ''));
          return {
            name: label,
            label,
            description: prettySaasDescription(doc),
            kind: 'saas',
            saasFile: doc.file,
            saasPath: doc.path,
            saasTitle: doc.title || '',
            saasSummary: doc.summary || '',
            icon: 'DOC'
          };
        });
        state.saasDocs = docs;
        return docs;
      } catch (err) {
        console.warn('Failed to load SaaS YAML docs:', err);
        state.saasDocs = [];
        return [];
      }
    }

    async function loadMCPTools(){
      // バックエンド（Node.jsサーバー）から、現在参照中のMCP定義を取得
      try {
        const backendBase = await probeBackendBase();
        if (state.backendBase !== backendBase) {
          state.backendBase = backendBase;
          schedulePersist();
        }
        const res = await fetch(`${backendBase.replace(/\/$/, '')}/api/claude/mcp/servers`, { cache: 'no-cache' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const servers = Array.isArray(data.servers) ? data.servers : [];
        
        // 基本情報のみを保持（詳細はホバー時に取得）
        const tools = servers.map((s, idx) => {
          const toolName = String(s.name || `tool-${idx+1}`);
          return {
            name: toolName,
            label: toolName,
            description: String(s.description || s.url || ''),
            icon: guessIconFromName(toolName),
            color: guessColorFromName(toolName),
            url: s.url || ''
          };
        });

        const saasDocs = await loadSaasDocuments(backendBase);
        state.mcpTools = tools.concat(saasDocs);
        console.log('MCP tools loaded:', tools.length, 'SaaS docs:', saasDocs.length);
      } catch(err) {
        console.warn('Failed to load MCP tools from backend:', err);
        try {
          const fallbackBase = state.backendBase || 'http://localhost:7777';
          const saasDocs = await loadSaasDocuments(fallbackBase);
          state.mcpTools = [...saasDocs];
        } catch (innerErr) {
          console.warn('Failed to load SaaS YAML docs during fallback:', innerErr);
          state.mcpTools = [];
        }
      }
    }

    function guessIconFromName(name){
      const n = name.toLowerCase();
      if (n.startsWith('t2i') || n.includes('image')) return 'IMG';
      if (n.startsWith('t2m') || n.includes('music')) return 'MUS';
      if (n.startsWith('t2v') || n.includes('video')) return 'VID';
      if (n.includes('visual') || n.includes('diagram')) return 'VIS';
      if (n.includes('search') || n.includes('crawl')) return 'WEB';
      if (n.includes('editor')) return 'EDT';
      return 'APP';
    }
    
    // カテゴリごとの色定義
    function getCategoryColors(cat, tool = {}) {
      const colors = {
        IMG: { bg: '#FF6B6B', icon: 'https://cdn-icons-png.flaticon.com/512/3342/3342137.png' }, // 赤系 - 画像
        VID: { bg: '#4ECDC4', icon: 'https://cdn-icons-png.flaticon.com/512/3179/3179068.png' }, // ターコイズ - 動画
        MUS: { bg: '#95E1D3', icon: 'https://cdn-icons-png.flaticon.com/512/3141/3141766.png' }, // ミント - 音楽
        VIS: { bg: '#A8E6CF', icon: 'https://cdn-icons-png.flaticon.com/512/3179/3179068.png' }, // ライトグリーン - ビジュアル（ビデオアイコンに変更）
        WEB: { bg: '#5B9FFF', icon: 'https://cdn-icons-png.flaticon.com/512/2991/2991114.png' }, // ブルー - ウェブ
        EDT: { bg: '#C7A8FF', icon: 'https://cdn-icons-png.flaticon.com/512/3179/3179068.png' }, // パープル - エディタ（ビデオアイコン共通）
        DOC: { bg: '#38BDF8', icon: 'https://cdn-icons-png.flaticon.com/512/4205/4205906.png' }, // 水色 - SaaSドキュメント（人型）
        APP: { bg: '#FFD93D', icon: 'https://cdn-icons-png.flaticon.com/512/3573/3573187.png' }  // イエロー - アプリ
      };
      if (tool && tool.icon && colors[tool.icon]) return colors[tool.icon];
      return colors[cat] || colors.APP;
    }

    function svgForCategory(cat, color){
      const c = color || '#4a9eff';
      const common = (child) => `<svg width="32" height="32" viewBox="0 0 40 40" aria-hidden="true" preserveAspectRatio="xMidYMid meet"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${c}" stop-opacity=".95"/><stop offset="100%" stop-color="${c}" stop-opacity=".75"/></linearGradient></defs>${child}</svg>`;
      switch (cat) {
        case 'IMG':
          return common(`<rect x="6" y="8" width="28" height="24" rx="6" fill="url(#g)"/><path d="M10 26l7-7 6 6 5-5 6 6v6H10z" fill="#fff" opacity=".9"/>`);
        case 'VID':
          return common(`<rect x="6" y="8" width="28" height="24" rx="6" fill="url(#g)"/><polygon points="16,16 28,20 16,24" fill="#fff" opacity=".9"/>`);
        case 'MUS':
          return common(`<rect x="6" y="8" width="28" height="24" rx="6" fill="url(#g)"/><path d="M22 14v10a3 3 0 1 1-2-2.8V16l8-2v6a3 3 0 1 1-2-2.8V12l-6 2z" fill="#fff" opacity=".9"/>`);
        case 'VIS':
          return common(`<rect x="6" y="8" width="28" height="24" rx="6" fill="url(#g)"/><circle cx="20" cy="20" r="6" fill="none" stroke="#fff" stroke-width="2"/><path d="M8 20c3-5 7-8 12-8s9 3 12 8c-3 5-7 8-12 8s-9-3-12-8z" fill="none" stroke="#fff" stroke-width="2" opacity=".9"/>`);
        case 'WEB':
          return common(`<rect x="6" y="8" width="28" height="24" rx="6" fill="url(#g)"/><circle cx="20" cy="20" r="8" fill="none" stroke="#fff" stroke-width="2"/><path d="M12 20h16M20 12c4 4 4 12 0 16c-4-4-4-12 0-16z" stroke="#fff" stroke-width="2" fill="none"/>`);
        case 'EDT':
          return common(`<rect x="6" y="8" width="28" height="24" rx="6" fill="url(#g)"/><path d="M14 26l12-12 2 2-12 12H14v-2z" fill="#fff" opacity=".9"/><path d="M24 12l2 2" stroke="#fff" stroke-width="2"/>`);
        default:
          return common(`<rect x="6" y="8" width="28" height="24" rx="6" fill="url(#g)"/><path d="M14 16h12v12H14z" fill="#fff" opacity=".9"/>`);
      }
    }

    function guessColorFromName(name){
      const palette = ['#4A90E2','#7ED321','#F5A623','#BD10E0','#50E3C2','#B8E986','#F8E71C','#D0021B','#9013FE','#417505'];
      let hash = 0; for (let i=0;i<name.length;i++){ hash = (hash*31 + name.charCodeAt(i))>>>0; }
      return palette[hash % palette.length];
    }
    
    // 円形ダイヤルにツールを配置する関数
    function updateDialItems(searchQuery = ''){
      const itemsContainer = document.getElementById('mcpDialItems');
      if (!itemsContainer || !dialOverlay) return;
      const mode = dialOverlay.dataset.mode === 'model' ? 'model' : 'mcp';
      if (mode === 'model') {
        renderModelDialItems(itemsContainer, searchQuery);
      } else {
        renderMcpDialItems(itemsContainer, searchQuery);
      }
    }

    function renderModelDialItems(itemsContainer, searchQuery = '') {
      ensureRequiredModelOptions();
      const dialInput = document.getElementById('mcpDialInput');
      if (dialInput) {
        dialInput.placeholder = 'モデルを検索...';
      }
      itemsContainer.classList.add('model-mode');
      itemsContainer.innerHTML = '';

      const q = searchQuery.toLowerCase();
      const filtered = q === ''
        ? state.modelOptions
        : state.modelOptions.filter(model => {
            const base = `${model.id || ''} ${model.label || ''} ${model.shortLabel || ''} ${model.description || ''} ${model.provider || ''}`.toLowerCase();
            return base.includes(q);
          });

      console.log('[TaskBoard] renderModelDialItems options:', state.modelOptions.map(opt => opt.id));

      const tooltip = getTooltipElement();
      if (tooltip) {
        tooltip.innerHTML = filtered.length
          ? `<div class="mcp-tooltip-content"><div class="mcp-tooltip-desc">モデルを選択すると、このチャットで呼び出すCLIが切り替わります。</div></div>`
          : `<div class="mcp-tooltip-content"><div class="mcp-tooltip-desc">該当するモデルが見つかりません</div></div>`;
        tooltip.classList.add('visible');
        tooltip.scrollTop = 0;
      }

      if (filtered.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'mcp-dial-empty';
        empty.textContent = '利用可能なモデルが見つかりません';
        itemsContainer.appendChild(empty);
        return;
      }

      filtered.forEach((model, index) => {
        const item = document.createElement('div');
        item.className = 'mcp-dial-item model-item';
        item.style.position = 'relative';
        item.style.left = '';
        item.style.top = '';
        item.style.width = '';
        item.style.height = '';
        item.style.animationDelay = `${index * 0.05}s`;
        item.setAttribute('data-model', model.id);
        item.innerHTML = `
          <div class="model-item-inner">
            <div class="model-item-title">@${escapeHtml(model.shortLabel || model.label || model.id)}</div>
            <div class="model-item-desc">${escapeHtml(model.description || '')}</div>
            ${model.provider ? `<div class="model-item-provider">${escapeHtml(model.provider)}</div>` : ''}
          </div>
        `;

        if (model.id === state.activeModelId) {
          item.classList.add('selected');
          item.classList.add('active');
        }

        item.addEventListener('click', () => {
          setActiveModel(model.id);
          dialOverlay.classList.remove('active');
          hideTooltip();
          if (inputEl) inputEl.focus();
        });

        item.addEventListener('mouseenter', () => {
          itemsContainer.querySelectorAll('.mcp-dial-item').forEach(el => el.classList.remove('active'));
          item.classList.add('active');
          setTooltipSource(item);
          if (tooltip) {
            tooltip.innerHTML = `<div class="mcp-tooltip-content"><div class="mcp-tooltip-desc">${escapeHtml(model.description || '')}</div></div>`;
            tooltip.classList.add('visible');
            tooltip.scrollTop = 0;
          }
        });

        item.addEventListener('mouseleave', () => {
          scheduleTooltipHide(item);
        });

        itemsContainer.appendChild(item);
      });
    }

    function renderMcpDialItems(itemsContainer, searchQuery = '') {
      const dialInput = document.getElementById('mcpDialInput');
      if (dialInput) {
        dialInput.placeholder = 'ツールを検索...';
      }
      itemsContainer.classList.remove('model-mode');
      itemsContainer.innerHTML = '';

      const q = searchQuery.toLowerCase();
      const filtered = q === '' ? state.mcpTools : state.mcpTools.filter(tool => {
        const name = (tool.name || '').toLowerCase();
        const label = (tool.label || '').toLowerCase();
        const desc = (tool.description || '').toLowerCase();
        const summary = (tool.saasSummary || '').toLowerCase();
        return name.includes(q) || label.includes(q) || desc.includes(q) || summary.includes(q);
      });

      if (filtered.length === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:var(--text-weak);';
        empty.textContent = 'ツールが見つかりません';
        itemsContainer.appendChild(empty);
        return;
      }

      const containerSize = window.innerWidth < 768 ? 600 : 900;
      const itemCount = filtered.length;

      let radius, itemSize, sizeClass;
      if (itemCount <= 6) {
        radius = window.innerWidth < 768 ? 200 : 300;
        itemSize = window.innerWidth < 768 ? 120 : 150;
        sizeClass = '';
      } else if (itemCount <= 12) {
        radius = window.innerWidth < 768 ? 220 : 330;
        itemSize = window.innerWidth < 768 ? 110 : 140;
        sizeClass = 'size-medium';
      } else if (itemCount <= 20) {
        radius = window.innerWidth < 768 ? 240 : 360;
        itemSize = window.innerWidth < 768 ? 100 : 130;
        sizeClass = 'size-small';
      } else {
        radius = window.innerWidth < 768 ? 230 : 350;
        itemSize = window.innerWidth < 768 ? 100 : 120;
        sizeClass = 'size-small';
      }

      const centerX = containerSize / 2;
      const centerY = containerSize / 2;
      const angleStep = (2 * Math.PI) / Math.min(itemCount, 20);
      const startAngle = -Math.PI / 2;

      filtered.forEach((tool, index) => {
        let angle, x, y, currentRadius;

        if (itemCount > 20 && index >= 20) {
          const innerIndex = index - 20;
          const innerCount = itemCount - 20;
          const innerAngleStep = (2 * Math.PI) / innerCount;
          currentRadius = radius * 0.6;
          angle = startAngle + innerAngleStep * innerIndex;
        } else {
          angle = startAngle + angleStep * index;
          currentRadius = radius;
        }

        x = centerX + currentRadius * Math.cos(angle);
        y = centerY + currentRadius * Math.sin(angle);

        const item = document.createElement('div');
        const isInnerCircle = itemCount > 20 && index >= 20;
        const classes = ['mcp-dial-item', sizeClass];
        if (isInnerCircle) classes.push('inner-circle');
        item.className = classes.filter(Boolean).join(' ');
        item.style.width = `${itemSize}px`;
        item.style.height = `${itemSize}px`;
        item.style.left = `${x}px`;
        item.style.top = `${y}px`;
        item.style.animationDelay = `${index * 0.05}s`;
        item.setAttribute('data-tool', tool.name);

        const angleDeg = (angle * 180 / Math.PI);
        item.setAttribute('data-angle', angleDeg);
        item.style.setProperty('--rotation', `${angleDeg}deg`);

        const iconCat = tool.kind === 'saas' ? 'DOC' : guessIconFromName(tool.name);
        const categoryInfo = getCategoryColors(iconCat, tool);

        item.innerHTML = `
          <div class="mcp-dial-item-inner">
            <div class="mcp-dial-icon" style="background: ${categoryInfo.bg};">
              <img src="${categoryInfo.icon}" style="width: 80%; height: 80%; object-fit: contain; filter: brightness(0) invert(1);" />
            </div>
            <div class="mcp-dial-label">${escapeHtml(tool.label || tool.name)}</div>
          </div>
        `;

        item.addEventListener('click', () => {
          item.classList.add('selected');
          setTimeout(() => {
            if (inputEl) {
              const displayName = tool.kind === 'saas'
                ? `data/saas/${tool.saasFile || (tool.label || tool.name)}`
                : (tool.description || tool.name);
              inputEl.value = displayName;
              inputEl.focus();
            }
            dialOverlay.classList.remove('active');
            hideTooltip();
          }, 300);
        });

        item.addEventListener('mouseenter', async () => {
          itemsContainer.querySelectorAll('.mcp-dial-item').forEach(el => {
            el.classList.remove('active');
          });
          item.classList.add('active');

          const fixedTooltip = getTooltipElement();
          if (fixedTooltip && tool.description) {
            setTooltipSource(item);
            fixedTooltip.innerHTML = `
              <div class="mcp-tooltip-content">
                <div class="mcp-tooltip-desc">${escapeHtml(tool.description)}</div>
                <div class="mcp-tooltip-section">詳細情報を読み込み中...</div>
              </div>
            `;
            fixedTooltip.classList.add('visible');
            fixedTooltip.scrollTop = 0;

            try {
              const details = await fetchMCPToolDetails(tool);
              const sections = [];
              if (details.error) {
                sections.push(`<div class=\"mcp-tooltip-section error\">⚠️ ${escapeHtml(details.error)}</div>`);
              }
              if (details.endpoint) {
                sections.push(`<div class=\"mcp-tooltip-section\"><strong>エンドポイント:</strong> ${details.method ? `${escapeHtml(details.method)} ` : ''}${escapeHtml(details.endpoint)}</div>`);
              }
              if (details.params) {
                sections.push(`<div class=\"mcp-tooltip-section\"><strong>パラメータ:</strong><br>${escapeHtml(details.params)}</div>`);
              }
              if (details.example) {
                sections.push(`<div class=\"mcp-tooltip-section\"><strong>使用例:</strong><br><code>${escapeHtml(details.example)}</code></div>`);
              }
              if (details.rawSnippet) {
                sections.push(`<div class=\"mcp-tooltip-section\"><strong>Raw:</strong><br><code>${escapeHtml(details.rawSnippet)}</code></div>`);
              }

              fixedTooltip.innerHTML = `
                <div class=\"mcp-tooltip-content\">
                  <div class=\"mcp-tooltip-desc\">${escapeHtml(tool.description)}</div>
                  ${sections.join('\\n')}
                </div>
              `;
            } catch (err) {
              console.warn('Failed to load tool details:', err);
              fixedTooltip.innerHTML = `
                <div class=\"mcp-tooltip-content\">
                  <div class=\"mcp-tooltip-desc\">${escapeHtml(tool.description)}</div>
                  <div class=\"mcp-tooltip-section error\">⚠️ ${escapeHtml(err && err.message ? err.message : '詳細の取得に失敗しました')}</div>
                </div>
              `;
            }
          }
        });

        item.addEventListener('mouseleave', (e) => {
          const tooltipEl = getTooltipElement();
          if (tooltipEl && e.relatedTarget && tooltipEl.contains(e.relatedTarget)) {
            return;
          }
          scheduleTooltipHide(item);
        });

        itemsContainer.appendChild(item);
      });

      const firstItem = itemsContainer.querySelector('.mcp-dial-item');
      if (firstItem) firstItem.classList.add('active');
    }
    
    // 円形ダイヤルを表示する関数
    function showMCPDial(){
      if (!dialOverlay) return;
      dialOverlay.dataset.mode = 'mcp';
      dialOverlay.classList.add('active', 'mode-mcp');
      dialOverlay.classList.remove('mode-model');
      const dialInput = document.getElementById('mcpDialInput');
      if (dialInput) {
        dialInput.value = '';
        dialInput.placeholder = 'ツールを検索...';
        setTimeout(() => dialInput.focus(), 100);
      }
      updateDialItems('');
    }

    function showModelDial(){
      if (!dialOverlay) return;
      dialOverlay.dataset.mode = 'model';
      dialOverlay.classList.add('active', 'mode-model');
      dialOverlay.classList.remove('mode-mcp');
      const dialInput = document.getElementById('mcpDialInput');
      if (dialInput) {
        dialInput.value = '';
        dialInput.placeholder = 'モデルを検索...';
        setTimeout(() => dialInput.focus(), 100);
      }
      updateDialItems('');
    }

    function cssStatus(s){
      if (s === 'running') return 'doing';
      if (s === 'completed') return 'done';
      if (s === 'failed') return 'done';
      if (s === 'external') return 'doing';
      if (s === 'codex-working') return 'working'; // Codex実行中用のステータス
      if (s === 'codex-waiting') return 'waiting'; // Codex待機中用のステータス
      if (s === 'codex-idle') return 'idle'; // Codex監視停止用のステータス
      if (s === 'pending') return 'todo';
      return 'todo';
    }
    function iconFor(s){
      if (s === 'running') return '⏳';
      if (s === 'completed') return '✔';
      if (s === 'failed') return '×';
      if (s === 'external') return '🖥';
      if (s === 'codex-working') return '🛠️'; // Codex実行中用のアイコン
      if (s === 'codex-waiting') return '⏸️'; // Codex待機中用のアイコン
      if (s === 'codex-idle') return '💤'; // Codex監視停止のアイコン
      if (s === 'pending') return '📝';
      return '';
    }

    function formatTaskTimestamp(value) {
      if (!value) return null;
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return null;
      try {
        return date.toLocaleString('ja-JP', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
          timeZone: TASK_TIMEZONE
        });
      } catch (_) {
        return date.toISOString();
      }
    }
    function ensureCodexMonitorState(task){
      if (!task || typeof task !== 'object') return;
      if (typeof task.codexPollingDisabled !== 'boolean') task.codexPollingDisabled = false;
      if (typeof task.codexIdleChecks !== 'number' || !Number.isFinite(task.codexIdleChecks)) task.codexIdleChecks = 0;
      if (typeof task.codexHasSeenWorking !== 'boolean') task.codexHasSeenWorking = false;
    }
    function mergeTask(task){
      if (task && typeof task === 'object') {
        if (Array.isArray(task.logs)) {
          task.logs = task.logs.map(log => {
            const text = String(log);
            return text.length > MAX_LOG_LENGTH ? text.slice(-MAX_LOG_LENGTH) : text;
          });
        } else if (typeof task.logs === 'string') {
          const text = task.logs;
          task.logs = text.length > MAX_LOG_LENGTH ? text.slice(-MAX_LOG_LENGTH) : text;
        }
      }
      const id = String(task.id);
      const idx = state.tasks.findIndex(x => String(x.id) === id);
      if (idx >= 0) {
        const existing = state.tasks[idx];
        const preservedManual = existing && typeof existing.manualDone === 'boolean' ? existing.manualDone : false;
        const incomingManual = typeof task.manualDone === 'boolean' ? task.manualDone : undefined;
        state.tasks[idx] = { ...existing, ...task };
        if (incomingManual === undefined) {
          state.tasks[idx].manualDone = preservedManual;
        }
        if (typeof task.completionSummary !== 'string') {
          state.tasks[idx].completionSummary = typeof existing.completionSummary === 'string' ? existing.completionSummary : '';
        }
        state.tasks[idx].importance = normalizePriorityLevel(state.tasks[idx].importance, 'medium');
        state.tasks[idx].urgency = normalizePriorityLevel(state.tasks[idx].urgency, 'medium');
        ensureCodexMonitorState(state.tasks[idx]);
      } else {
        if (typeof task.manualDone !== 'boolean') {
          task.manualDone = false;
        }
        if (typeof task.completionSummary !== 'string') {
          task.completionSummary = '';
        }
        task.importance = normalizePriorityLevel(task.importance, 'medium');
        task.urgency = normalizePriorityLevel(task.urgency, 'medium');
        ensureCodexMonitorState(task);
        state.tasks.unshift(task);
      }
      state.tasks.sort((a,b)=>new Date(b.createdAt||0) - new Date(a.createdAt||0));
      cleanupTasksAndLogs();
      schedulePersist();
    }

    function handleInlineCommand(rawText) {
      const trimmed = typeof rawText === 'string' ? rawText.trim() : '';
      if (!trimmed || trimmed.charAt(0) !== '@') return false;
      const match = trimmed.match(/^@([a-zA-Z0-9_-]+)(?:\s+(.*))?$/);
      if (!match) return false;
      const commandId = match[1].toLowerCase();
      const rest = match[2] ? match[2].trim() : '';
      if (commandId === 'claude' || commandId === 'codex') {
        const options = { initialInput: rest };
        Promise.resolve(terminalManager.open(commandId, options)).catch((err) => {
          console.error('[Terminal] Failed to open PTY session', err);
        });
        return true;
      }
      return false;
    }

    async function submitRemoteTask(text, options = {}){
      const {
        existingTask = null,
        importance: importanceOverride = null,
        urgency: urgencyOverride = null,
        modelOption: explicitModel = null
      } = typeof options === 'object' && options ? options : {};

      const basePrompt = existingTask && typeof existingTask.prompt === 'string'
        ? existingTask.prompt
        : (typeof text === 'string' ? text : '');
      const prompt = basePrompt.trim();

      let selectedModel = explicitModel || null;
      if (!selectedModel && existingTask && existingTask.model) {
        selectedModel = findModelOption(existingTask.model);
      }
      if (!selectedModel) {
        selectedModel = getActiveModelOption();
      }

      const importance = normalizePriorityLevel(
        importanceOverride != null ? importanceOverride : (existingTask ? existingTask.importance : state.composeImportance),
        'medium'
      );
      const urgency = normalizePriorityLevel(
        urgencyOverride != null ? urgencyOverride : (existingTask ? existingTask.urgency : state.composeUrgency),
        'medium'
      );

      const isExternalModel = selectedModel && selectedModel.externalTerminalType === 'codex-iterm';
      const allowEmptyPrompt = isExternalModel;
      if (!prompt && !allowEmptyPrompt) return;

      if (!existingTask && prompt && handleInlineCommand(prompt)) return;

      const now = new Date().toISOString();
      let task;
      if (existingTask) {
        task = { ...existingTask };
        if (!task.id) task.id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        if (!task.createdAt) task.createdAt = now;
        task.status = isExternalModel ? 'external' : 'running';
        task.updatedAt = now;
        task.error = null;
        task.response = '';
        task.result = null;
        task.logs = Array.isArray(task.logs) ? task.logs.slice() : [];
        task.urls = Array.isArray(task.urls) ? task.urls.slice() : [];
        task.files = Array.isArray(task.files) ? task.files.slice() : [];
        task.manualDone = false;
        task.completionSummary = '';
      } else {
        const tempId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        task = {
          id: tempId,
          status: isExternalModel ? 'external' : 'running',
          prompt: prompt,
          createdAt: now,
          updatedAt: now,
          response: '',
          result: null,
          error: null,
          logs: [],
          urls: [],
          files: [],
          manualDone: false,
          completionSummary: ''
        };
      }

      task.prompt = typeof task.prompt === 'string' ? task.prompt : basePrompt;
      task.importance = importance;
      task.urgency = urgency;
      if (selectedModel) {
        task.model = selectedModel.id || task.model || null;
        task.provider = selectedModel.provider || task.provider || null;
      } else {
        task.model = task.model || null;
        task.provider = task.provider || null;
      }

      const effectivePrompt = typeof task.prompt === 'string' ? task.prompt : '';

      if (selectedModel && selectedModel.ptyCommand) {
        const commandId = selectedModel.ptyCommand;
        const inlinePrompt = effectivePrompt ? `@${commandId} ${effectivePrompt}` : `@${commandId}`;
        if (!handleInlineCommand(inlinePrompt)) {
          Promise.resolve(terminalManager.open(commandId, { initialInput: effectivePrompt }))
            .catch((err) => console.error('[Terminal] Failed to open PTY session via model shortcut', err));
        }
        return;
      }

      if (isExternalModel) {
        try {
          const result = await launchCodexTerminalSession(effectivePrompt, selectedModel);
          const sessionId = result && result.sessionId ? String(result.sessionId) : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
          task.status = 'external';
          task.updatedAt = now;
          task.externalTerminal = {
            sessionId,
            app: result && result.app ? String(result.app) : 'iTerm',
            command: result && result.command ? String(result.command) : 'codex',
            appleSessionId: result && result.appleSessionId ? String(result.appleSessionId) : null
          };
          task.codexIsWorking = false;
          task.logs = [];
          mergeTask(task);
          render();
        } catch (err) {
          const message = err && err.message ? err.message : String(err || 'unknown_error');
          task.status = 'failed';
          task.error = `Codexターミナルの起動に失敗: ${message}`;
          task.updatedAt = now;
          mergeTask(task);
          render();
        }
        return;
      }

      mergeTask(task);
      render();

      const base = await probeBackendBase();
      if (!base) {
        task.status = 'failed';
        task.error = 'バックエンド未接続のため実行できません';
        task.updatedAt = new Date().toISOString();
        mergeTask(task);
        render();
        return;
      }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 300000); // 5分のタイムアウト
        const endpointPath = selectedModel && selectedModel.endpoint ? selectedModel.endpoint : '/api/claude/chat';
        const payload = Object.assign({ prompt: effectivePrompt, importance, urgency }, buildModelPayload(selectedModel));

        const res = await fetch(`${base.replace(/\/$/, '')}${endpointPath}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!res.ok) throw new Error(`submit failed (${res.status})`);
        const data = await res.json();
        task.status = 'completed';
        task.response = data && typeof data.response === 'string' ? data.response : '';
        task.result = data && data.result ? data.result : null;
        task.serverId = data && data.taskId ? String(data.taskId) : task.serverId || null;
        const assistantLogs = Array.isArray(data && data.logs) ? data.logs.map(log => String(log)) : [];
        task.logs = assistantLogs;
        const cacheKey = task.serverId || task.id;
        const combinedLogs = assistantLogs.join('\n');
        if (combinedLogs.trim()) {
          const limitedLogs = combinedLogs.length > MAX_LOG_LENGTH ? combinedLogs.slice(-MAX_LOG_LENGTH) : combinedLogs;
          taskLogsCache[cacheKey] = limitedLogs;
          schedulePersist();
        } else {
          delete taskLogsCache[cacheKey];
          schedulePersist();
        }
        task.updatedAt = new Date().toISOString();
      } catch (err) {
        task.status = 'failed';
        if (err.name === 'AbortError') {
          task.error = 'タイムアウト: 処理に時間がかかりすぎました（5分以上）';
        } else {
          task.error = String(err && err.message || err);
        }
        task.updatedAt = new Date().toISOString();
        const errorLog = `ログ取得エラー: ${task.error}`;
        taskLogsCache[task.serverId || task.id] = errorLog.length > MAX_LOG_LENGTH ? errorLog.slice(-MAX_LOG_LENGTH) : errorLog;
        schedulePersist();
      }

      mergeTask(task);
      render();
    }

    function createPendingTask(text){
      const rawInput = typeof text === 'string' ? text : '';
      const prompt = rawInput.trim();
      if (!prompt) return;
      const selectedModel = getActiveModelOption();
      const now = new Date().toISOString();
      const tempId = `pending-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const importance = normalizePriorityLevel(state.composeImportance, 'medium');
      const urgency = normalizePriorityLevel(state.composeUrgency, 'medium');
      const task = {
        id: tempId,
        status: 'pending',
        prompt,
        createdAt: now,
        updatedAt: now,
        response: '',
        result: null,
        error: null,
        model: selectedModel ? selectedModel.id : null,
        provider: selectedModel && selectedModel.provider ? selectedModel.provider : null,
        manualDone: false,
        completionSummary: '',
        importance,
        urgency,
        logs: [],
        urls: [],
        files: []
      };
      mergeTask(task);
      render();
    }

    function isTaskExpanded(task){
      if (!task) return false;
      const key = expansionKeyForTask(task);
      if (!key) return false;
      return state.expandedTaskIds ? state.expandedTaskIds.has(key) : false;
    }

    function setTaskExpanded(task, expanded){
      if (!task) return;
      const key = expansionKeyForTask(task);
      if (!key) return;
      if (!state.expandedTaskIds) state.expandedTaskIds = new Set();
      if (expanded) state.expandedTaskIds.add(key);
      else state.expandedTaskIds.delete(key);
      schedulePersist();
    }

    function toggleTaskExpansion(task){
      if (!task) return;
      const next = !isTaskExpanded(task);
      setTaskExpanded(task, next);
      render();
    }

    function render(){
      if (!listEl) return;
      if (!Array.isArray(state.tasks) || state.tasks.length === 0){
        listEl.innerHTML = `<div class="tb-empty">タスクはありません。チャット欄から追加してください。</div>`;
        renderHeatmap();
        renderPriorityMatrix();
        renderGraph3dPanel();
        return;
      }

      document.querySelectorAll('.task-log-popup').forEach(el => el.remove());

      state.tasks.forEach(t => {
        const logsArray = Array.isArray(t.logs) ? t.logs : (typeof t.logs === 'string' ? [t.logs] : []);
        const joined = logsArray.join('\n');
        const cacheKey = String(t.serverId || t.id);
        if (joined.trim()) {
          taskLogsCache[cacheKey] = joined.length > MAX_LOG_LENGTH ? joined.slice(-MAX_LOG_LENGTH) : joined;
        } else if (!taskLogsCache[cacheKey] || !taskLogsCache[cacheKey].trim()) {
          delete taskLogsCache[cacheKey];
        }
      });
      const notices = [];
      if (state.heatmapSelection) {
        const parts = [];
        if (state.heatmapSelection.dayLabel) parts.push(state.heatmapSelection.dayLabel);
        else parts.push(state.heatmapSelection.dayKey);
        const hourLabel = state.heatmapSelection.hourLabel || formatHourLabel(state.heatmapSelection.hour);
        parts.push(hourLabel);
        const label = parts.join(' / ');
        notices.push(`
          <div class="tb-filter-notice" data-role="heatmap-filter">
            <span class="tb-filter-label">選択中: ${escapeHtml(label)}</span>
            <button type="button" class="tb-filter-clear" data-action="clear-heatmap-filter" aria-label="選択をクリア">×</button>
          </div>
        `);
      }
      if (state.matrixSelection) {
        const badge = `${renderPriorityBadge('importance', state.matrixSelection.importance)} ${renderPriorityBadge('urgency', state.matrixSelection.urgency)}`;
        notices.push(`
          <div class="tb-filter-notice" data-role="matrix-filter">
            <span class="tb-filter-label">選択中: ${badge}</span>
            <button type="button" class="tb-filter-clear" data-action="clear-matrix-filter" aria-label="選択をクリア">×</button>
          </div>
        `);
      }
      const noticeHtml = notices.join('');

      const baseTasks = state.heatmapSelection
        ? state.tasks.filter(matchesHeatmapSelection)
        : state.tasks.slice();
      const tasksToRender = state.matrixSelection
        ? baseTasks.filter(matchesMatrixSelection)
        : baseTasks;

      const cardsHtml = tasksToRender.map(t => {
        const manualDone = !!(t && t.manualDone);
        const activeTerminal = (!manualDone && t && t.externalTerminal && t.externalTerminal.sessionId) ? t.externalTerminal : null;
        const isExternal = !!activeTerminal;
        const isCodex = activeTerminal && activeTerminal.command && activeTerminal.command.toLowerCase().includes('codex');
        const codexMonitorStopped = isCodex && !!t.codexPollingDisabled;
        const responseText = String(t.response || '');
        let s = t && typeof t.status === 'string' && t.status ? t.status : (isExternal ? 'external' : 'running');
        
        // Codexの場合のステータス判定を詳細化
        if (isCodex && (s === 'external' || s === 'running')) {
          if (codexMonitorStopped) {
            s = 'codex-idle';
          } else {
            // codexIsWorkingプロパティまたはレスポンステキストをチェック
            const isActuallyWorking = t.codexIsWorking || (responseText && responseText.toLowerCase().includes('working'));
            s = isActuallyWorking ? 'codex-working' : 'codex-waiting';
          }
        }
        
        const cls = cssStatus(s);
        const icon = manualDone ? '✅' : iconFor(s);
        const summaryPending = !!(t && t.completionSummaryPending);
        const isExpanded = isTaskExpanded(t);
        const promptPreview = getPromptPreview(t);
        const rawPrompt = typeof t.prompt === 'string' ? t.prompt : '';
        const effectivePreview = promptPreview || rawPrompt;
        const titleSource = isExpanded ? (rawPrompt || effectivePreview) : effectivePreview;
        const titleHtml = isExpanded
          ? escapeHtml(titleSource).replace(/\r?\n/g, '<br>')
          : escapeHtml(titleSource);
        const titleAttr = escapeAttr(rawPrompt || effectivePreview);
        const toggleTitle = isExpanded ? '詳細を閉じる' : '詳細を表示';
        const urlMatches = responseText.matchAll(/https?:\/\/[^\s`]+/g);
        const pathMatches = responseText.matchAll(/\/(?:Users|home)\/[^\s`]+/g);
        const importanceLevel = normalizePriorityLevel(t.importance, 'medium');
        const urgencyLevel = normalizePriorityLevel(t.urgency, 'medium');
        const priorityBadges = `${renderPriorityBadge('importance', importanceLevel)}${renderPriorityBadge('urgency', urgencyLevel)}`;
        const items = [];

        if (s === 'pending') {
          items.push(`<span class="tb-meta-item" data-action="start-now" title="このタスクをすぐに実行" style="display:inline-flex;align-items:center;gap:4px;margin-right:8px;cursor:pointer;padding:4px 8px;border-radius:999px;background:rgba(74,158,255,0.18);border:1px solid rgba(74,158,255,0.35);transition:background 0.2s;">
            <svg width="16" height="16" viewBox="0 0 24 24" class="tb-meta-icon" aria-hidden="true" style="color:#4a9eff;"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>
            <span>今すぐ実行</span>
          </span>`);
        }

        if (isExternal && activeTerminal && activeTerminal.sessionId) {
          const terminalLabel = activeTerminal.app ? String(activeTerminal.app) : 'ターミナル';
          const sessionIdAttr = escapeHtml(String(activeTerminal.sessionId));
          const terminalTitle = `${terminalLabel} を前面に表示`;
          const buttonLabel = `${terminalLabel}を開く`;
          items.push(`<span class="tb-meta-item" data-action="focus-terminal" data-session="${sessionIdAttr}" title="${escapeHtml(terminalTitle)}" style="display:inline-flex;align-items:center;gap:4px;margin-right:8px;cursor:pointer;padding:4px;border-radius:4px;background:rgba(148, 163, 184, 0.18);transition:background 0.2s;">
            <svg width="16" height="16" viewBox="0 0 24 24" class="tb-meta-icon" aria-hidden="true" style="color:#38bdf8;"><path fill="currentColor" d="M4 5a2 2 0 0 0-2 2v9c0 1.105.895 2 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H4Zm0 2h16v9H4V7Zm2 2v2h6V9H6Zm0 4v2h4v-2H6Z"/></svg>
            <span>${escapeHtml(buttonLabel)}</span>
          </span>`);
        }

        if (isCodex && codexMonitorStopped && !manualDone) {
          items.push(`<span class="tb-meta-item" data-action="resume-codex-monitor" title="Codexセッションの監視を再開" style="display:inline-flex;align-items:center;gap:4px;margin-right:8px;cursor:pointer;padding:4px;border-radius:4px;background:rgba(59,130,246,0.12);transition:background 0.2s;">
            <svg width="16" height="16" viewBox="0 0 24 24" class="tb-meta-icon" aria-hidden="true" style="color:#60a5fa;"><path fill="currentColor" d="M12 5a7 7 0 1 1-6.32 4H3l3.89-4.26L10.77 9H7.61a5 5 0 1 0 4.39-2.5V5Z"/></svg>
            <span>監視再開</span>
          </span>`);
        }

        const chosenModel = (() => {
          if (t.model) {
            const exact = state.modelOptions.find(opt => opt.id === t.model);
            if (exact) return exact;
          }
          if (t.provider) {
            const byProvider = state.modelOptions.find(opt => opt.provider === t.provider);
            if (byProvider) return byProvider;
          }
          return state.modelOptions[0] || null;
        })();
        const modelBadge = chosenModel
          ? `<span class="tb-model-pill" data-model="${escapeHtml(chosenModel.id)}">${escapeHtml(chosenModel.shortLabel || chosenModel.label || chosenModel.id)}</span>`
          : '';

        const manualToggleLabel = summaryPending
          ? '完了まとめを取得しています...'
          : manualDone
              ? '完了済み（クリックで未完了に戻す）'
              : (isExternal
                  ? 'Codex+terminal セッションを終了して完了にします'
                  : '手動で完了にします');
        const manualToggleText = summaryPending
          ? '要約取得中...'
          : manualDone 
              ? '完了済み' 
              : (s === 'codex-working')
                  ? '仕事中'
                  : (s === 'codex-waiting')
                      ? '待機中'
                      : (s === 'codex-idle')
                          ? '監視停止'
                          : '未完了';
        const manualToggleClasses = `tb-done-toggle${manualDone ? ' is-active' : ''}${summaryPending ? ' is-loading' : ''}`;
        const manualToggleBusyAttrs = summaryPending ? ' aria-busy="true" disabled' : '';
        const manualToggle = `<button type="button" class="${manualToggleClasses}" data-action="toggle-done" aria-pressed="${manualDone ? 'true' : 'false'}" title="${escapeHtml(manualToggleLabel)}"${manualToggleBusyAttrs}>${manualToggleText}</button>`;

        const detailBlocks = [];
        if (manualDone && t.completionSummary) {
          detailBlocks.push(`<div class="tb-summary" data-role="completion-summary">
                <div class="tb-summary-title">完了まとめ</div>
                <pre class="tb-summary-body">${escapeHtml(t.completionSummary)}</pre>
             </div>`);
        } else if (summaryPending) {
          detailBlocks.push(`<div class="tb-summary tb-summary--pending" data-role="completion-summary">
                <div class="tb-summary-title">完了まとめ</div>
                <div class="tb-summary-body tb-summary-body--pending" role="status" aria-live="polite">
                  <span class="tb-summary-spinner" aria-hidden="true"></span>
                  <span>完了まとめを取得中です...</span>
                </div>
             </div>`);
        }
        const detailHtml = detailBlocks.length
          ? (isExpanded ? `<div class="task-details">${detailBlocks.join('')}</div>` : '')
          : '';

        // URL検出
        for (const match of urlMatches) {
          const url = match[0].replace(/[.,;]+$/, '');
          if (!items.some(item => item.includes(encodeURIComponent(url)))) {
            items.push(`<span class="tb-meta-item" data-action="open-url" title="リンクを開く" data-url="${encodeURIComponent(url)}" style="display:inline-flex;align-items:center;gap:4px;margin-right:8px;cursor:pointer;padding:4px;border-radius:4px;background:rgba(74,158,255,0.1);transition:background 0.2s;">
              <svg width="16" height="16" viewBox="0 0 24 24" class="tb-meta-icon" aria-hidden="true" style="color:#4a9eff;"><path fill="currentColor" d="M10 3H3v7h2V6.41l9.29 9.3l1.42-1.42l-9.3-9.29H10V3Zm4 0v2h3.59l-9.3 9.29l1.42 1.42l9.29-9.3V13h2V3h-7ZM5 14v7h7v-2H7v-5H5Zm12 5h-3v2h7v-7h-2v5Z"/></svg>
            </span>`);
          }
        }
        
        // パス検出（ファイルとフォルダを判別）
        const addedPaths = new Set();
        const addedDirs = new Set();
        
        for (const match of pathMatches) {
          const path = match[0].replace(/[.,;]+$/, '');
          
          if (!addedPaths.has(path)) {
            addedPaths.add(path);
            
            // ファイルとして扱う（デフォルト）
            items.push(`<span class="tb-meta-item" data-action="open-file" title="ファイルを開く" data-path="${encodeURIComponent(path)}" style="display:inline-flex;align-items:center;gap:4px;margin-right:8px;cursor:pointer;padding:4px;border-radius:4px;background:rgba(74,158,255,0.1);transition:background 0.2s;">
              <svg width="16" height="16" viewBox="0 0 24 24" class="tb-meta-icon" aria-hidden="true" style="color:#4a9eff;"><path fill="currentColor" d="M6 2a2 2 0 0 0-2 2v16c0 1.1.9 2 2 2h12a2 2 0 0 0 2-2V8l-6-6H6Zm7 1.5L18.5 9H13V3.5ZM8 13h8v2H8v-2Zm0 4h8v2H8v-2Z"/></svg>
            </span>`);
            
            // ファイルパスからディレクトリパスを抽出してフォルダアイコンも追加
            const lastSlash = path.lastIndexOf('/');
            if (lastSlash > 0) {
              const dirPath = path.substring(0, lastSlash);
              if (!addedDirs.has(dirPath)) {
                addedDirs.add(dirPath);
                items.push(`<span class="tb-meta-item" data-action="open-folder" title="フォルダを開く" data-path="${encodeURIComponent(dirPath)}" style="display:inline-flex;align-items:center;gap:4px;margin-right:8px;cursor:pointer;padding:4px;border-radius:4px;background:rgba(74,158,255,0.1);transition:background 0.2s;">
                  <svg width="16" height="16" viewBox="0 0 24 24" class="tb-meta-icon" aria-hidden="true" style="color:#4a9eff;"><path fill="currentColor" d="M10 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2h-8l-2-2Z"/></svg>
                </span>`);
              }
            }
          }
        }
        
        const createdAt = t.createdAt ? new Date(t.createdAt).getTime() : Date.now();
        const elapsed = Date.now() - createdAt;
        const progressPct = Math.max(0, Math.min(100, Math.round((elapsed / 300000) * 100)));
        const showProgress = s === 'running' && !isExternal;
        const startedAt = formatTaskTimestamp(t.createdAt);
        const finishedAt = !showProgress ? formatTaskTimestamp(t.updatedAt) : null;

        // 経過時間に応じてステータステキストを変更
        let statusText = '';
        if (s === 'codex-working') {
          statusText = '';  // 仕事中は上部ボタンに表示するのでここでは空
        } else if (s === 'codex-waiting') {
          statusText = '';  // 待機中も上部ボタンに表示するのでここでは空
        } else if (s === 'codex-idle') {
          statusText = 'Codex監視を停止しました。必要であれば「監視再開」を押してください。';
        } else if (isExternal && !isCodex) {
          const terminalLabel = activeTerminal && activeTerminal.app ? activeTerminal.app : 'ターミナル';
          statusText = `${terminalLabel}操作中`;
        } else if (s === 'pending') {
          statusText = '保留中';
        } else if (showProgress) {
          if (elapsed < 60000) {
            statusText = '準備中';
          } else if (elapsed < 180000) {
            statusText = '生成中';
          } else {
            statusText = '長時間処理中';
          }
        } else if (!items.length) {
          statusText = t.error ? String(t.error) : s;
        }

        if (summaryPending) {
          statusText = '完了まとめ取得中';
        }
        if (manualDone) {
          statusText = '手動完了';
        }

        const serverIdAttr = t.serverId ? escapeHtml(String(t.serverId)) : '';
        const cacheKey = escapeHtml(String(t.serverId || t.id));
        const cardClasses = `task-item ${cls}${manualDone ? ' manual-done' : ''}${isExpanded ? ' is-expanded' : ''}`;
        return `
          <div class="${cardClasses}" data-id="${String(t.id)}" data-server-id="${serverIdAttr}" data-cache-key="${cacheKey}" data-expanded="${isExpanded ? 'true' : 'false'}">
            <button class="task-status ${cls}" data-action="open" title="${escapeHtml(toggleTitle)}" aria-expanded="${isExpanded ? 'true' : 'false'}">
              <span class="i">${icon}</span>
            </button>
            <div class="task-text">
            <div class="task-title-row" data-action="open">
                <span class="task-title-text" title="${titleAttr}">${titleHtml}</span>
                ${modelBadge}<span class="tb-priority-wrap">${priorityBadges}</span>${manualToggle}
              </div>
              ${startedAt ? `<div class="tb-timestamp">開始: ${escapeHtml(startedAt)}${finishedAt ? ` / 更新: ${escapeHtml(finishedAt)}` : ''}</div>` : ''}
              <div class="tb-meta" style="font-size:.75rem;color:var(--text-weak);margin-top:3px;">
              ${statusText ? `<span class="tb-meta-text" style="display:inline-block;opacity:0.8;margin-right:8px;">${escapeHtml(statusText)}</span>` : ''}
              ${items.join('')}
            </div>
            ${detailHtml}
            ${showProgress ? `
              <div class="tb-progress" style="margin-top:6px;height:6px;border-radius:999px;background:rgba(255,255,255,0.1);overflow:hidden;position:relative;">
                <div class="tb-progress-bar" style="height:100%;width:${progressPct}%;background:linear-gradient(90deg,#4a9eff,#00d4ff);transition:width 0.5s ease;position:relative;overflow:hidden;">
                  <div class="tb-progress-shine" style="position:absolute;top:0;left:0;right:0;bottom:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.3),transparent);animation:shine 1.5s infinite;"></div>
                </div>
                </div>
              ` : ''}
            </div>
          </div>
        `;
      }).join('');

      let finalHtml = '';
      if (noticeHtml) finalHtml += noticeHtml;
      if (tasksToRender.length) {
        finalHtml += cardsHtml;
      } else if (state.heatmapSelection) {
        finalHtml += '<div class="tb-empty">選択した時間帯に一致するタスクが見つかりません。ヒートマップをクリックし直すか、フィルターを解除してください。</div>';
      } else if (state.matrixSelection) {
        finalHtml += '<div class="tb-empty">該当するタスクがありません。別のマトリクスセルを選択してください。</div>';
      } else {
        finalHtml += '<div class="tb-empty">タスクはありません。チャット欄から追加してください。</div>';
      }

      listEl.innerHTML = finalHtml;

      renderHeatmap();
      renderPriorityMatrix();
      renderGraph3dPanel();

      listEl.querySelectorAll('[data-action="clear-heatmap-filter"]').forEach(btn => {
        if (btn.dataset.bound === '1') return;
        btn.dataset.bound = '1';
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          clearHeatmapSelection();
        });
      });
      listEl.querySelectorAll('[data-action="clear-matrix-filter"]').forEach(btn => {
        if (btn.dataset.bound === '1') return;
        btn.dataset.bound = '1';
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          clearMatrixSelection();
        });
      });

      listEl.querySelectorAll('.task-item').forEach(card => {
        if (card.dataset.logsBound === '1') return;
        card.dataset.logsBound = '1';
        const localId = card.getAttribute('data-id') || '';
        const taskRef = localId ? state.tasks.find(t => String(t.id) === String(localId)) : null;
        if (taskRef && taskRef.externalTerminal && taskRef.externalTerminal.sessionId) {
          return;
        }
        const serverIdAttr = card.getAttribute('data-server-id') || '';
        const fetchableId = serverIdAttr && serverIdAttr.trim() ? serverIdAttr.trim() : null;
        const cacheKey = card.getAttribute('data-cache-key') || fetchableId || localId;
        if (!cacheKey) return;
        let popupEl = null;
        let pollTimer = null;
        let fetching = false;

        let hideTimer = null;

        const ensurePopup = () => {
          if (!popupEl) {
            popupEl = document.createElement('div');
            popupEl.className = 'task-log-popup';
            popupEl.innerHTML = '<div class="task-log-inner">ログを読み込んでいます...</div>';
            document.body.appendChild(popupEl);
            popupEl.addEventListener('mouseenter', () => {
              if (hideTimer) {
                clearTimeout(hideTimer);
                hideTimer = null;
              }
            });
            popupEl.addEventListener('mouseleave', () => {
              hideWithDelay(60);
            });
          }
          return popupEl;
        };

        const positionPopup = () => {
          const popup = ensurePopup();
          const rect = card.getBoundingClientRect();
          const left = rect.left + rect.width / 2 + window.scrollX;
          const top = Math.max(rect.top + window.scrollY - 20, 16);
          popup.style.left = `${left}px`;
          popup.style.top = `${top}px`;
          return popup;
        };

        const renderLogs = (logs) => {
          const text = typeof logs === 'string' ? logs : '';
          const trimmed = text.trim();
          if (!trimmed) {
            hidePopup();
            delete taskLogsCache[cacheKey];
            schedulePersist();
            return;
          }
          const popup = positionPopup();
          const previousInner = popup.querySelector('.task-log-inner');
          const prevScrollTop = previousInner ? previousInner.scrollTop : 0;
          const wasPinnedBottom = previousInner ? (previousInner.scrollTop + previousInner.clientHeight >= previousInner.scrollHeight - 12) : true;
          const html = markdownToHtml(text);
          popup.innerHTML = `<div class="task-log-inner">${html}</div>`;
          const newInner = popup.querySelector('.task-log-inner');
          if (newInner) {
            if (wasPinnedBottom) {
              newInner.scrollTop = newInner.scrollHeight;
            } else {
              newInner.scrollTop = Math.min(prevScrollTop, Math.max(0, newInner.scrollHeight - newInner.clientHeight));
            }
          }
          popup.classList.add('visible');
          taskLogsCache[cacheKey] = text.length > MAX_LOG_LENGTH ? text.slice(-MAX_LOG_LENGTH) : text;
          schedulePersist();
        };

        const setLoading = () => {
          const popup = positionPopup();
          if (!popup.classList.contains('visible')) {
            popup.innerHTML = '<div class="task-log-inner">ログを読み込んでいます...</div>';
            popup.classList.add('visible');
          }
        };

        const hidePopup = () => {
          if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
          }
          if (popupEl) {
            popupEl.classList.remove('visible');
          }
        };

        const hideWithDelay = (delay = 80) => {
          if (hideTimer) clearTimeout(hideTimer);
          hideTimer = setTimeout(() => {
            hideTimer = null;
            hidePopup();
          }, delay);
        };

        const stopPolling = () => {
          if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
          }
        };

        const fetchLogsFromServer = async (initial = false) => {
          if (!fetchableId || fetching) return;
          fetching = true;
          const previous = taskLogsCache[cacheKey] || '';
          try {
            const base = state.backendBase || 'http://localhost:7777';
            const res = await fetch(`${base.replace(/\/$/, '')}/api/agent/result?id=${encodeURIComponent(fetchableId)}&logs=1`, { cache: 'no-store' });
            if (!res.ok) {
              const body = await res.text().catch(() => '');
              const errorMessage = `ログ取得エラー: HTTP ${res.status}${res.statusText ? ' ' + res.statusText : ''}${body ? `\n${body}` : ''}`;
              const limitedError = errorMessage.length > MAX_LOG_LENGTH ? errorMessage.slice(-MAX_LOG_LENGTH) : errorMessage;
              taskLogsCache[cacheKey] = limitedError;
              schedulePersist();
              if (popupEl && popupEl.classList.contains('visible')) {
                renderLogs(errorMessage);
              }
              fetching = false;
              return;
            }
            const data = await res.json();
            const logs = data && data.task && typeof data.task.logs === 'string' ? data.task.logs : '';
            if (logs.trim()) {
              if (logs !== previous) {
                const normalizedLogs = logs.length > MAX_LOG_LENGTH ? logs.slice(-MAX_LOG_LENGTH) : logs;
                taskLogsCache[cacheKey] = normalizedLogs;
                schedulePersist();
                if (popupEl && popupEl.classList.contains('visible')) {
                  renderLogs(logs);
                }
              } else if (initial && popupEl && popupEl.classList.contains('visible') && !previous.trim()) {
                renderLogs(logs);
              }
            } else {
              delete taskLogsCache[cacheKey];
              schedulePersist();
              if (initial && popupEl && popupEl.classList.contains('visible')) {
                hidePopup();
              }
            }
          } catch (err) {
            const msg = err && err.message ? err.message : String(err);
            const errorText = `ログ取得エラー: ${msg}`;
            const limitedErrorText = errorText.length > MAX_LOG_LENGTH ? errorText.slice(-MAX_LOG_LENGTH) : errorText;
            taskLogsCache[cacheKey] = limitedErrorText;
            schedulePersist();
            if (popupEl && popupEl.classList.contains('visible')) {
              renderLogs(errorText);
            }
          } finally {
            fetching = false;
          }
        };

        card.addEventListener('mouseenter', async () => {
          const cachedValue = taskLogsCache[cacheKey];
          const hasCached = typeof cachedValue === 'string' && cachedValue.trim().length > 0;
          if (popupEl && popupEl.classList.contains('visible') && hasCached) {
            return;
          }
          if (hideTimer) {
            clearTimeout(hideTimer);
            hideTimer = null;
          }

          if (hasCached) {
            renderLogs(cachedValue);
          } else if (fetchableId) {
            setLoading();
            await fetchLogsFromServer(true);
          } else {
            hidePopup();
          }

          if (fetchableId && !pollTimer) {
            pollTimer = setInterval(() => fetchLogsFromServer(false), 1500);
          }
        });

        card.addEventListener('mouseleave', () => {
          if (popupEl && popupEl.matches(':hover')) {
            return;
          }
          stopPolling();
          hideWithDelay();
        });

        card.addEventListener('blur', () => { stopPolling(); hideWithDelay(0); });
        card.addEventListener('focusout', () => { stopPolling(); hideWithDelay(0); });
      });
    }

    function setOpen(open){
      hideTaskContextMenu();
      state.open = !!open;
      panel.classList.toggle('open', state.open);
      panel.setAttribute('aria-hidden', state.open ? 'false' : 'true');
      toggleBtn.setAttribute('aria-pressed', state.open ? 'true' : 'false');
      schedulePersist();
    }

    toggleBtn.addEventListener('click', () => setOpen(!state.open));
    hideEl?.addEventListener('click', () => setOpen(false));
    runEl?.addEventListener('click', () => {
      const v = inputEl?.value;
      if (inputEl) inputEl.value = '';
      submitRemoteTask(v);
    });
    holdEl?.addEventListener('click', () => {
      const v = inputEl?.value;
      if (inputEl) inputEl.value = '';
      createPendingTask(v);
    });
    panel.addEventListener('keydown', (e) => {
      if (e.isComposing || e.keyCode === 229) return;
      if (!panel.contains(e.target)) return;
      if (dialOverlay && dialOverlay.contains(e.target)) return;
      if (!e.altKey && !e.ctrlKey && !e.metaKey) {
        if (e.key === '/') {
          e.preventDefault();
          e.stopPropagation();
          showMCPDial();
        } else if (e.key === '@') {
          e.preventDefault();
          e.stopPropagation();
          showModelDial();
        }
      }
    }, true);
    
    inputEl?.addEventListener('keydown', (e) => {
      if (e.isComposing || e.keyCode === 229) return;
      if (!e.altKey && !e.ctrlKey && !e.metaKey) {
        if (e.key === '/') {
          e.preventDefault();
          e.stopPropagation();
          showMCPDial();
          return;
        }
        if (e.key === '@') {
          e.preventDefault();
          e.stopPropagation();
          showModelDial();
          return;
        }
      }

      if (e.key === 'Enter') {
        e.preventDefault(); e.stopPropagation();
        const v = inputEl.value; inputEl.value = '';
        submitRemoteTask(v);
      }
    });
    // クリック外でダイヤルを非表示
    document.addEventListener('click', (e) => {
      if (!panel.contains(e.target) && dialOverlay && !dialOverlay.contains(e.target)) {
        dialOverlay.classList.remove('active');
        hideTooltip();
      }
    });
    listEl?.addEventListener('click', async (e) => {
      const any = e.target.closest('.task-item');
      if (!any) return;
      const id = any.getAttribute('data-id');
      if (!id) return;
      const actionEl = e.target.closest('[data-action]');
      try {
        const task = state.tasks.find(t => String(t.id) === String(id));
        if (!task) throw new Error('task not found');
        if (actionEl) {
          const action = actionEl.getAttribute('data-action');
          if (action === 'open-url') {
            const encodedUrl = actionEl.getAttribute('data-url');
            const url = encodedUrl ? decodeURIComponent(encodedUrl) : null;
            if (url) window.open(url, '_blank', 'noopener,noreferrer');
            return;
          }
          if (action === 'open-file') {
            const encodedPath = actionEl.getAttribute('data-path');
            const filePath = encodedPath ? decodeURIComponent(encodedPath) : null;
            if (filePath) {
              // 直接ファイルパスを開く（絶対パスの場合）
              if (filePath.startsWith('/')) {
                try {
                  const base = await probeBackendBase();
                  const res = await fetch(`${base.replace(/\/$/, '')}/api/open-file-absolute`, { 
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json' }, 
                    body: JSON.stringify({ path: filePath }) 
                  });
                  if (!res.ok) {
                    console.error('Failed to open file:', await res.text());
                  }
                } catch(err) {
                  console.error('Failed to open file:', err);
                  // フォールバック: ブラウザで開く
                  window.open(`file://${filePath}`, '_blank');
                }
              } else {
                // 相対パスの場合は従来通り
                const base = await probeBackendBase();
                fetch(`${base.replace(/\/$/, '')}/api/open-file`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: filePath }) }).catch(() => {});
              }
            }
            return;
          }
          if (action === 'open-folder') {
            const encodedPath = actionEl.getAttribute('data-path');
            const folderPath = encodedPath ? decodeURIComponent(encodedPath) : null;
            if (folderPath) {
              // フォルダを開く（絶対パスの場合）
              if (folderPath.startsWith('/')) {
                try {
                  const base = await probeBackendBase();
                  const res = await fetch(`${base.replace(/\/$/, '')}/api/open-folder-absolute`, { 
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json' }, 
                    body: JSON.stringify({ path: folderPath }) 
                  });
                  if (!res.ok) {
                    console.error('Failed to open folder:', await res.text());
                  }
                } catch(err) {
                  console.error('Failed to open folder:', err);
                }
              } else {
                // 相対パスの場合
                const base = await probeBackendBase();
                fetch(`${base.replace(/\/$/, '')}/api/open-folder`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: folderPath }) }).catch(() => {});
              }
            }
            return;
          }
          if (action === 'focus-terminal') {
            const encodedSession = actionEl.getAttribute('data-session');
            const sessionId = encodedSession && encodedSession.trim() ? encodedSession.trim() : null;
            if (sessionId) {
              await focusExternalTerminalTask(task);
            }
            return;
          }
          if (action === 'start-now') {
            e.preventDefault();
            e.stopPropagation();
            try {
              await submitRemoteTask(null, { existingTask: task });
            } catch (err) {
              console.error('Failed to execute pending task', err);
            }
            return;
          }
          if (action === 'resume-codex-monitor') {
            e.preventDefault();
            e.stopPropagation();
            task.codexPollingDisabled = false;
            task.codexIdleChecks = 0;
            task.codexHasSeenWorking = false;
            task.codexIsWorking = false;
            if (task.externalTerminal && task.externalTerminal.sessionId) {
              task.status = 'external';
            }
            schedulePersist();
            render();
            setTimeout(() => { try { updateCodexTaskStatuses(); } catch (_) {} }, 150);
            return;
          }
          if (action === 'toggle-done') {
            e.preventDefault();
            e.stopPropagation();
            const nextState = !task.manualDone;
            if (nextState) {
              const shouldRequestSummary = !!(task && task.externalTerminal && task.externalTerminal.sessionId);
              let summaryPayload = null;
              if (shouldRequestSummary) {
                task.completionSummaryPending = true;
                render();
                try {
                  summaryPayload = await generateCompletionSummaryForTask(task);
                } catch (err) {
                  console.error('Completion summary request failed', err);
                } finally {
                  task.completionSummaryPending = false;
                }
              }
              if (summaryPayload && typeof summaryPayload === 'object' && typeof summaryPayload.summary === 'string' && summaryPayload.summary.trim()) {
                // 改行や\n文字列を削除して1文にまとめる
                const cleanedSummary = summaryPayload.summary.trim()
                  .replace(/\\n/g, ' ')  // \n文字列を削除
                  .replace(/\n/g, ' ')   // 改行を削除
                  .replace(/\s+/g, ' ')  // 連続するスペースを1つに
                  .trim();
                task.completionSummary = cleanedSummary;
              } else if (!task.completionSummary || !task.completionSummary.trim()) {
                task.completionSummary = '完了としてマークしました。必要に応じて詳細を追記してください。';
              }
              task.manualDone = true;
              task.codexPollingDisabled = true;
              task.codexIdleChecks = Math.max(task.codexIdleChecks || 0, CODEX_IDLE_STOP_THRESHOLD);
              if (task.status === 'external') {
                task.status = 'completed';
              }
            } else {
              task.manualDone = false;
              task.completionSummaryPending = false;
              task.completionSummary = '';
              task.codexPollingDisabled = false;
              task.codexIdleChecks = 0;
              task.codexHasSeenWorking = false;
              if (task.externalTerminal && task.externalTerminal.sessionId) {
                task.status = 'external';
              }
            }
            task.updatedAt = new Date().toISOString();
            schedulePersist();
            render();
            return;
          }
          if (action === 'open' || action === 'open-card') {
            e.preventDefault();
            e.stopPropagation();
            toggleTaskExpansion(task);
            return;
          }
          // その他の data-action はここで処理済み
          if (action) return;
        }

        const clickedInsideDetails = e.target.closest('.task-details');
        if (clickedInsideDetails) return;

        const selection = window.getSelection ? window.getSelection() : null;
        if (selection && selection.rangeCount && selection.toString()) {
          return;
        }

        if (actionEl && actionEl.getAttribute('data-action') === 'focus-terminal') {
          // 念のためフォーカス系はここで打ち切る
          return;
        }

        if (e.altKey || e.metaKey) {
          const fullData = {
            id: task.id,
            status: task.status,
            prompt: task.prompt,
            response: task.response,
            result: task.result,
            error: task.error,
            createdAt: task.createdAt,
            updatedAt: task.updatedAt,
            executionDetails: task.result ? {
              turns: task.result.num_turns || task.result.numTurns,
              duration_ms: task.result.duration_ms || task.result.durationMs,
              cost_usd: task.result.total_cost_usd,
              usage: task.result.usage,
              session_id: task.result.session_id,
              is_error: task.result.is_error
            } : null,
            aiResult: task.result && task.result.result ? task.result.result : null
          };
          openJsonModal(JSON.stringify(fullData, null, 2), `Task #${id} - 詳細`);
          return;
        }

        e.preventDefault();
        e.stopPropagation();
        toggleTaskExpansion(task);
      } catch(err) {
        openJsonModal(JSON.stringify({ error: '結果の取得に失敗しました', id, detail: String(err && err.message || err) }, null, 2), 'Result Error');
      }
    });

    // 初期描画と監視開始
    render();
    setOpen(!!state.open);
    loadMCPTools(); // MCPツールを読み込む
    
    // デバッグ：ツールが読み込まれたか確認
    setTimeout(() => {
      console.log('MCP tools state:', state.mcpTools);
    }, 100);
    fetchServerTasksSnapshot().catch(() => {});
    setInterval(() => {
      fetchServerTasksSnapshot().catch(() => {});
    }, 60000);

    // タスクの定期更新
    setInterval(() => {
      const hasRunningOrExternal = state.tasks.some(t => t.status === 'running' || t.status === 'external');
      if (hasRunningOrExternal) render();
    }, 500);
    
    // Codexターミナルセッションのステータスを定期的にチェック
    async function updateCodexTaskStatuses() {
      // macOSでのみ実行
      if (navigator.platform && !navigator.platform.toLowerCase().includes('mac')) return;
      
      const codexTasks = state.tasks.filter(t => 
        t &&
        t.status === 'external' &&
        !t.manualDone &&
        !(t.codexPollingDisabled) &&
        t.externalTerminal && 
        t.externalTerminal.command && 
        t.externalTerminal.command.toLowerCase().includes('codex')
      );
      
      if (codexTasks.length === 0) return;
      
      const backendBase = await probeBackendBase();
      
      for (const task of codexTasks) {
        if (!task || !task.externalTerminal || !task.externalTerminal.sessionId) continue;
        ensureCodexMonitorState(task);
        if (task.codexPollingDisabled) continue;

        try {
          const response = await fetch(`${backendBase}/api/terminal/codex/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId: task.externalTerminal.sessionId,
              appleSessionId: task.externalTerminal.appleSessionId || null
            })
          });
          
          if (response.ok) {
            const data = await response.json();
            const wasWorking = task.codexIsWorking;
            const isNowWorking = data.isWorking || false;
            const backendSuggestStop = data.shouldStop === true;
            const backendIdlePolls = Number.isFinite(data.idlePolls) ? data.idlePolls : 0;
            if (data.seenWorking === true) {
              task.codexHasSeenWorking = true;
            }

            // レスポンスを更新して、Working状態を反映
            task.response = data.content || '';
            task.codexIsWorking = isNowWorking;
            if (isNowWorking) {
              task.codexHasSeenWorking = true;
              task.codexIdleChecks = 0;
            } else {
              task.codexIdleChecks = (task.codexIdleChecks || 0) + 1;
              if (backendIdlePolls > task.codexIdleChecks) {
                task.codexIdleChecks = backendIdlePolls;
              }
            }

            const shouldStopPolling = backendSuggestStop || (task.codexHasSeenWorking && task.codexIdleChecks >= CODEX_IDLE_STOP_THRESHOLD);
            if (shouldStopPolling && !task.codexPollingDisabled) {
              task.codexPollingDisabled = true;
              task.codexIsWorking = false;
              task.codexIdleChecks = Math.max(task.codexIdleChecks, CODEX_IDLE_STOP_THRESHOLD);
              console.log(`[Codex Status] Monitoring stopped for ${task.externalTerminal.sessionId} (idle=${task.codexIdleChecks}, backendSuggestStop=${backendSuggestStop})`);
              schedulePersist();
            }

            console.log(`[Codex Status] Session ${task.externalTerminal.sessionId}: Working=${isNowWorking} (was=${wasWorking}), idleChecks=${task.codexIdleChecks}, stopSuggested=${shouldStopPolling}`);
            
            // WorkingからWorking以外に変わった場合、自動的に完了まとめを取得
            // wasWorkingがtrueの場合のみ（初回チェック時はundefinedなので実行しない）
            if (wasWorking === true && !isNowWorking && !task.manualDone && !task.completionSummaryPending) {
              console.log(`[Codex Status] Working finished for ${task.externalTerminal.sessionId}, generating completion summary...`);
              
              // 完了まとめを自動生成
              task.completionSummaryPending = true;
              render();
              
              // 少し待ってから完了まとめを取得（出力が完全に終わるのを待つ）
              setTimeout(async () => {
                try {
                  const summaryPayload = await generateCompletionSummaryForTask(task);
                  if (summaryPayload && typeof summaryPayload === 'object' && typeof summaryPayload.summary === 'string' && summaryPayload.summary.trim()) {
                    // 改行や\n文字列を削除して1文にまとめる
                    const cleanedSummary = summaryPayload.summary.trim()
                      .replace(/\\n/g, ' ')  // \n文字列を削除
                      .replace(/\n/g, ' ')   // 改行を削除
                      .replace(/\s+/g, ' ')  // 連続するスペースを1つに
                      .trim();
                    task.completionSummary = cleanedSummary;
                    task.manualDone = true;
                    task.codexPollingDisabled = true;
                    task.codexIdleChecks = Math.max(task.codexIdleChecks || 0, CODEX_IDLE_STOP_THRESHOLD);
                    task.codexHasSeenWorking = true;
                    console.log(`[Codex Status] Completion summary generated for ${task.externalTerminal.sessionId}`);
                  } else {
                    // まとめが取得できなかった場合のデフォルトメッセージ
                    task.completionSummary = 'Codexでのタスクが完了しました。';
                    task.manualDone = true;
                    task.codexPollingDisabled = true;
                    task.codexIdleChecks = Math.max(task.codexIdleChecks || 0, CODEX_IDLE_STOP_THRESHOLD);
                    task.codexHasSeenWorking = true;
                  }
                } catch (err) {
                  console.error('[Codex Status] Failed to generate completion summary:', err);
                  // エラーの場合もデフォルトメッセージで完了
                  task.completionSummary = 'Codexでのタスクが完了しました。';
                  task.manualDone = true;
                  task.codexPollingDisabled = true;
                  task.codexIdleChecks = Math.max(task.codexIdleChecks || 0, CODEX_IDLE_STOP_THRESHOLD);
                  task.codexHasSeenWorking = true;
                } finally {
                  task.completionSummaryPending = false;
                  schedulePersist();
                  render();
                }
              }, 2000); // 2秒待機
            }
          }
        } catch (err) {
          console.warn('Failed to update Codex task status:', err);
        }
      }
      
      // 変更があった場合は再レンダリング
      render();
    }
    
    // 3秒ごとにCodexタスクの状態をチェック
    setInterval(updateCodexTaskStatuses, 3000);
    
    // 初回は即座に実行
    setTimeout(updateCodexTaskStatuses, 100);
    
    // ストレージ操作のグローバル関数は taskboard-storage.js 側で提供
    
  } catch(err) {
    console.error('TaskBoard init failed', err);
  }
}

// 初期化
document.addEventListener('DOMContentLoaded', () => {
  const forceReloadBtn = document.getElementById('forceReloadBtn');
  if (forceReloadBtn) {
    forceReloadBtn.addEventListener('click', () => {
      try { sessionStorage.setItem('kamuiForceReloadAt', String(Date.now())); } catch (_) {}
      try {
        const { origin, pathname, search, hash } = window.location;
        const params = new URLSearchParams(search);
        const token = Date.now().toString(36);
        if (params.has('forceReload')) params.delete('forceReload');
        params.set('forceReload', token);
        const newSearch = params.toString();
        const finalUrl = `${origin}${pathname}${newSearch ? `?${newSearch}` : ''}${hash || ''}`;
        window.location.replace(finalUrl);
      } catch (err) {
        console.warn('Force reload fallback', err);
        window.location.reload(true);
      }
    });
  }

  initUIFlow();
  renderPackages();
  renderServers();
  initClientSamples();
  initImageModals();
  initContextMenu();
  initDocMenuTable();
initTaskBoard();
});
