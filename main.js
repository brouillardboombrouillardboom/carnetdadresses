// config centralisée — clé anon Supabase (lecture publique uniquement, protégée par RLS)
const CFG = {
    url: 'https://nyzfqwwdkeqinnxduyqs.supabase.co',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55emZxd3dka2VxaW5ueGR1eXFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3NjQ5MTUsImV4cCI6MjA5MjM0MDkxNX0.nJ4HnkY34lhHPyWU6kCYoKFzdbi5ZTO398hQ0c9wiVQ',
};

const dbHeaders = { apikey: CFG.key, Authorization: `Bearer ${CFG.key}` };

const db = {
    async get(table) {
        const r = await fetch(`${CFG.url}/rest/v1/${table}?order=created_at.asc`, { headers: dbHeaders });
        if (!r.ok) throw new Error(`db.get ${table} : ${r.status}`);
        return r.json();
    }
};

let donnees = { structure:[], personnes:[], mouvements:[], objet:[], impression:[], couleur:[], pays:[], ville:[], date:[], images:[] };
let currentUnivers = sessionStorage.getItem('carnet_univers') || 'visuel';

function setUnivers(u) {
    currentUnivers = u;
    sessionStorage.setItem('carnet_univers', u);
    document.querySelectorAll('.univers-btn').forEach(b => b.classList.toggle('active', b.dataset.univers === u));
    reloadAll();
}

async function reloadAll() {
    // reset donnees
    donnees = { images: [] };
    await renderSections();
    const [entrees, images] = await Promise.all([
        fetch(`${CFG.url}/rest/v1/entrees?select=id,name,slug,href,tags,categorie,univers,lien&univers=eq.${currentUnivers}&pending=is.false&order=created_at.asc`, { headers: dbHeaders }).then(r=>r.json()),
        fetch(`${CFG.url}/rest/v1/images?select=id,src,pages,caption,tags,univers,pdf&univers=eq.${currentUnivers}&pending=is.false&order=created_at.asc`, { headers: dbHeaders }).then(r=>r.json()),
    ]);
    entrees.forEach(e => {
        if (!donnees[e.categorie]) donnees[e.categorie] = [];
        donnees[e.categorie].push(e);
    });
    donnees.images = images;
    invalidateItemsCache();
    filter();
    renderImages('col-images', document.body.dataset.tag ?? null);
}

// --- rendu dynamique sections depuis Supabase ---
async function renderSections() {
    const container = document.getElementById('sections-container');
    if (!container) return;
    const r2 = await fetch(`${CFG.url}/rest/v1/sections?univers=eq.${currentUnivers}&order=position.asc`, { headers: dbHeaders });
    if (!r2.ok) throw new Error('sections: '+r2.status);
    const sections = await r2.json();
    container.innerHTML = '';
    const cats = [];
    sections.forEach(sec => {
        const cols = sec.colonnes || [];
        const section = document.createElement('section');

        const grid = document.createElement('div');
        grid.className = sec.grid;
        if (cols.some(c => c.header)) {
            cols.forEach(col => {
                const d = document.createElement('div');
                d.className = 'col-header';
                d.textContent = col.header || '';
                grid.appendChild(d);
            });
        }
        cols.forEach(col => {
            const d = document.createElement('div');
            d.className = 'col'; d.id = col.col_id;
            grid.appendChild(d);
            if (col.categorie) {
                if (!donnees[col.categorie]) donnees[col.categorie] = [];
                cats.push(col.categorie);
            }
        });
        section.appendChild(grid);
        container.appendChild(section);
    });
    window._dynamicCats = cats;
}
let _itemsCache = null;
const tousItems = () => {
    if (_itemsCache) return _itemsCache;
    _itemsCache = Object.values(donnees).flat().filter(i => i.href);
    return _itemsCache;
};
const invalidateItemsCache = () => { _itemsCache = null; };

function renderCol(id, items) {
    const col = document.getElementById(id);
    if (!col) return;
    if (!items.length) { col.innerHTML = '<span class="empty">—</span>'; return; }
    col.innerHTML = '';
    items.forEach(item => {
        const wrap = document.createElement('span');
        wrap.className = 'entry-wrap';
        const a = document.createElement('a');
        // ajout de l'univers dans l'URL pour résoudre les slugs ambigus
        if (item.href) {
            const sep = item.href.includes('?') ? '&' : '?';
            a.href = item.href + (item.univers ? `${sep}univers=${item.univers}` : '');
        }
        a.textContent = item.name;
        wrap.appendChild(a);
        if (item.tags?.length) {
            const pop = document.createElement('span');
            pop.className = 'tags-pop';
            pop.dataset.tags = item.tags.join(' ');
            wrap.appendChild(pop);
        }
        col.appendChild(wrap);
    });
}

let lbPages = [], lbIndex = 0;

function openLightbox(pages, caption, i = 0) {
    lbPages = pages; lbIndex = i;
    const lb = document.getElementById('lightbox');
    lb.querySelector('img').src = lbPages[lbIndex];
    lb.querySelector('figcaption').textContent = caption;
    updateLbNav();
    lb.classList.add('open');
}

function updateLbNav() {
    const lb = document.getElementById('lightbox');
    if (lb.classList.contains('pdf-mode')) {
        lb.querySelector('.lb-prev').style.visibility = lbPdfTotal > 1 && lbPdfPage > 1 ? 'visible' : 'hidden';
        lb.querySelector('.lb-next').style.visibility = lbPdfTotal > 1 && lbPdfPage < lbPdfTotal ? 'visible' : 'hidden';
        lb.querySelector('.lb-counter').textContent = lbPdfTotal > 1 ? `${lbPdfPage} / ${lbPdfTotal}` : '';
    } else {
        lb.querySelector('.lb-prev').style.visibility = lbPages.length > 1 && lbIndex > 0 ? 'visible' : 'hidden';
        lb.querySelector('.lb-next').style.visibility = lbPages.length > 1 && lbIndex < lbPages.length - 1 ? 'visible' : 'hidden';
        lb.querySelector('.lb-counter').textContent = lbPages.length > 1 ? `${lbIndex+1} / ${lbPages.length}` : '';
    }
}

function lbNav(dir) {
    const lb = document.getElementById('lightbox');
    if (lb.classList.contains('pdf-mode')) {
        lbPdfPage = Math.max(1, Math.min(lbPdfTotal, lbPdfPage + dir));
        renderPdfPage();
    } else {
        lbIndex = Math.max(0, Math.min(lbPages.length - 1, lbIndex + dir));
        lb.querySelector('img').src = lbPages[lbIndex];
        updateLbNav();
    }
}

// === lightbox PDF ===
let lbPdf = null, lbPdfPage = 1, lbPdfTotal = 1, lbPdfRenderTask = null;

async function openPdfLightbox(pdfUrl, caption) {
    const lb = document.getElementById('lightbox');
    lb.classList.add('open', 'pdf-mode');
    lb.querySelector('figcaption').textContent = caption;
    lb.querySelector('img').style.display = 'none';

    let canvas = lb.querySelector('canvas.lb-pdf-canvas');
    if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.className = 'lb-pdf-canvas';
        canvas.style.cssText = 'max-width:90vw;max-height:80vh;object-fit:contain;display:block;';
        lb.querySelector('.lb-figure').insertBefore(canvas, lb.querySelector('.lb-bottom'));
    }
    canvas.style.display = 'block';

    // charger PDF.js si pas déjà fait
    if (!window.pdfjsLib) {
        await loadPdfJs();
    }
    try {
        lbPdf = await window.pdfjsLib.getDocument(pdfUrl).promise;
        lbPdfTotal = lbPdf.numPages;
        lbPdfPage = 1;
        await renderPdfPage();
    } catch (err) {
        console.error('PDF load:', err);
        lb.querySelector('figcaption').textContent = 'erreur de chargement PDF';
    }
}

async function renderPdfPage() {
    if (!lbPdf) return;
    if (lbPdfRenderTask) { try { lbPdfRenderTask.cancel(); } catch(_) {} }
    const page = await lbPdf.getPage(lbPdfPage);
    const canvas = document.querySelector('#lightbox canvas.lb-pdf-canvas');
    const v1 = page.getViewport({ scale: 1 });
    const scale = Math.min((window.innerWidth * 0.9) / v1.width, (window.innerHeight * 0.8) / v1.height, 3);
    const vp = page.getViewport({ scale });
    canvas.width = vp.width; canvas.height = vp.height;
    const ctx = canvas.getContext('2d');
    lbPdfRenderTask = page.render({ canvasContext: ctx, viewport: vp });
    await lbPdfRenderTask.promise;
    updateLbNav();
}

function loadPdfJs() {
    return new Promise((resolve, reject) => {
        // tenter charge ESM
        const s = document.createElement('script');
        s.type = 'module';
        s.textContent = `
            import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs')
                .then(mod => {
                    mod.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs';
                    window.pdfjsLib = mod;
                    window.dispatchEvent(new Event('pdfjsready'));
                });
        `;
        window.addEventListener('pdfjsready', () => resolve(), { once: true });
        setTimeout(() => reject(new Error('PDF.js timeout')), 10000);
        document.head.appendChild(s);
    });
}

function closeLightbox() {
    const lb = document.getElementById('lightbox');
    lb.classList.remove('open', 'pdf-mode');
    lb.querySelector('img').style.display = '';
    const canvas = lb.querySelector('canvas.lb-pdf-canvas');
    if (canvas) canvas.style.display = 'none';
    if (lbPdfRenderTask) { try { lbPdfRenderTask.cancel(); } catch(_) {} }
    lbPdf = null;
}

function renderImages(id, filterTag, searchQuery) {
    const col = document.getElementById(id);
    if (!col) return;
    let imgs = donnees.images || [];
    if (filterTag) imgs = imgs.filter(img => img.tags?.includes(filterTag));
    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        imgs = imgs.filter(img => {
            const tags = (img.tags || []).map(t => t.toLowerCase());
            const cap = (img.caption || '').toLowerCase();
            return cap.includes(q) || tags.some(t => t.includes(q));
        });
    }
    imgs = [...imgs].sort(() => Math.random() - 0.5);
    if (!imgs.length) { col.innerHTML = '<span class="empty">—</span>'; return; }
    col.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'img-grid';
    // sets précalculés pour résolution rapide des slugs (sortis de la boucle)
    const slugSet = new Set(tousItems().map(i => i.slug).filter(Boolean));
    const filmSlugs = (currentUnivers === 'film')
        ? new Set(tousItems().filter(i => i.categorie === 'film').map(i => i.slug))
        : null;

    imgs.forEach(img => {
        const pages = img.pages ?? [img.src];
        const figure = document.createElement('figure');
        figure.className = 'img-item';
        figure.dataset.src = pages[0];
        figure.dataset.tags = (img.tags || []).join(',');
        figure.dataset.caption = (img.caption || '').toLowerCase();
        const wrap = document.createElement('div');
        wrap.className = 'img-wrap';
        const el = document.createElement('img');
        el.src = pages[0]; el.alt = img.caption || ''; el.loading = 'lazy';

        // dans l'univers 'film' : clic image → page du film
        let targetSlug = null;
        if (filmSlugs) {
            targetSlug = (img.tags || []).find(t => filmSlugs.has(t))
                      || (img.tags || []).find(t => slugSet.has(t))
                      || null;
        }
        if (img.pdf) {
            el.onclick = () => openPdfLightbox(img.pdf, img.caption || '');
        } else if (targetSlug) {
            el.onclick = () => window.location.href = `page.html?slug=${encodeURIComponent(targetSlug)}&univers=film`;
        } else {
            el.onclick = () => openLightbox(pages, img.caption || '', 0);
        }
        wrap.appendChild(el);
        if (pages.length > 1) {
            let cur = 0;
            const counter = document.createElement('span');
            counter.className = 'mini-counter';
            counter.textContent = `1 / ${pages.length}`;
            const prev = document.createElement('button');
            prev.className = 'mini-arrow mini-prev'; prev.textContent = '←';
            prev.onclick = e => { e.stopPropagation(); cur = Math.max(0,cur-1); el.src=pages[cur]; counter.textContent=`${cur+1} / ${pages.length}`; };
            const next = document.createElement('button');
            next.className = 'mini-arrow mini-next'; next.textContent = '→';
            next.onclick = e => { e.stopPropagation(); cur = Math.min(pages.length-1,cur+1); el.src=pages[cur]; counter.textContent=`${cur+1} / ${pages.length}`; };
            wrap.append(prev, next, counter);
        }
        figure.appendChild(wrap);
        if (img.caption) {
            const cap = document.createElement('figcaption');
            cap.textContent = img.caption;
            figure.appendChild(cap);
        }
        grid.appendChild(figure);
    });
    col.appendChild(grid);
}

let _filterTimeout;
function filter() {
    clearTimeout(_filterTimeout);
    _filterTimeout = setTimeout(_filterImpl, 120);
}
function _filterImpl() {
    const q = document.getElementById('search')?.value.toLowerCase().trim() ?? '';
    let total = 0;
    (window._dynamicCats || ['structure','personnes','mouvements','objet','impression','couleur','pays','ville','date']).forEach(cat => {
        const f = donnees[cat]?.filter(item =>
            !q || (item.name || '').toLowerCase().includes(q) || item.tags?.some(t => t.toLowerCase().includes(q))
        ) ?? [];
        if (cat === 'date') f.sort((a,b) => a.name.localeCompare(b.name, undefined, {numeric: true}));
        renderCol('col-' + cat, f);
        total += f.length;
    });
    const c = document.getElementById('count');
    if (c) c.textContent = total + ' entrée' + (total !== 1 ? 's' : '');
    renderImages('col-images', document.body.dataset.tag ?? null, q);
    renderArticles('col-articles', q);
}

// rendu spécial pour l'univers biblio : articles groupés par sujet, triés alpha
function renderArticles(id, q) {
    const col = document.getElementById(id);
    if (!col) return;
    // récupère toutes les entrées avec un lien (catégorie sujet/date/auteur)
    let articles = tousItems().filter(i => i.lien);
    if (q) {
        articles = articles.filter(i =>
            (i.name || '').toLowerCase().includes(q)
            || (i.tags || []).some(t => t.toLowerCase().includes(q))
        );
    }
    // grouper par catégorie (sujet, date, auteur…)
    // mais en biblio on veut grouper par 'sujet' uniquement — ce sont les entrées de catégorie sujet
    // afficher les articles sous chaque sujet, triés alpha par nom
    // récupère la liste des sujets
    const sujets = (donnees['sujet'] || []).slice().sort((a,b) => (a.name||'').localeCompare(b.name||''));
    col.innerHTML = '';
    col.style.display = 'block';

    if (!sujets.length && !articles.length) {
        col.innerHTML = '<span class="empty">—</span>';
        return;
    }

    sujets.forEach(suj => {
        // tag du sujet (slug) doit être présent dans les tags des articles
        const matching = articles
            .filter(a => (a.tags || []).includes(suj.slug))
            .sort((a,b) => (a.name||'').localeCompare(b.name||''));
        if (!matching.length) return;
        const group = document.createElement('div');
        group.className = 'biblio-group';
        const h = document.createElement('div');
        h.className = 'biblio-group-title';
        h.textContent = suj.name;
        group.appendChild(h);
        const ul = document.createElement('ul');
        ul.className = 'biblio-list';
        matching.forEach(a => {
            const li = document.createElement('li');
            const link = document.createElement('a');
            link.href = a.lien;
            link.target = '_blank';
            link.rel = 'noopener';
            link.textContent = a.name;
            li.appendChild(link);
            ul.appendChild(li);
        });
        group.appendChild(ul);
        col.appendChild(group);
    });

    // articles non classés sous un sujet (orphelins)
    const classed = new Set();
    sujets.forEach(s => articles.forEach(a => { if ((a.tags||[]).includes(s.slug)) classed.add(a.id); }));
    const orphans = articles.filter(a => !classed.has(a.id))
        .sort((a,b) => (a.name||'').localeCompare(b.name||''));
    if (orphans.length) {
        const group = document.createElement('div');
        group.className = 'biblio-group';
        const h = document.createElement('div');
        h.className = 'biblio-group-title';
        h.textContent = '— sans sujet';
        group.appendChild(h);
        const ul = document.createElement('ul');
        ul.className = 'biblio-list';
        orphans.forEach(a => {
            const li = document.createElement('li');
            const link = document.createElement('a');
            link.href = a.lien;
            link.target = '_blank';
            link.rel = 'noopener';
            link.textContent = a.name;
            li.appendChild(link);
            ul.appendChild(li);
        });
        group.appendChild(ul);
        col.appendChild(group);
    }
}

function navigate(e) {
    if (e.key !== 'Enter') return;
    const q = document.getElementById('search').value.toLowerCase().trim();
    const match = tousItems().find(item =>
        item.name?.toLowerCase().includes(q) || item.tags?.some(t => t.includes(q))
    );
    if (match?.href) {
        const sep = match.href.includes('?') ? '&' : '?';
        window.location.href = match.href + (match.univers ? `${sep}univers=${match.univers}` : '');
    }
}

document.addEventListener('click', () => document.querySelectorAll('.tags-pop.open').forEach(p => p.classList.remove('open')));

document.addEventListener('DOMContentLoaded', async () => {
    const lb = document.createElement('div');
    lb.id = 'lightbox';
    const lbBack = document.createElement('div'); lbBack.className = 'lb-backdrop';
    const lbFig = document.createElement('figure'); lbFig.className = 'lb-figure';
    const lbClose = document.createElement('button'); lbClose.className = 'lb-close'; lbClose.textContent = '✕';
    const lbPrev = document.createElement('button'); lbPrev.className = 'lb-prev'; lbPrev.textContent = '←';
    const lbNext = document.createElement('button'); lbNext.className = 'lb-next'; lbNext.textContent = '→';
    const lbImg = document.createElement('img');
    const lbBottom = document.createElement('div'); lbBottom.className = 'lb-bottom';
    const lbCap = document.createElement('figcaption');
    const lbCounter = document.createElement('span'); lbCounter.className = 'lb-counter';
    lbBottom.append(lbCap, lbCounter);
    lbFig.append(lbClose, lbPrev, lbNext, lbImg, lbBottom);
    lb.append(lbBack, lbFig);
    document.body.appendChild(lb);
    lb.querySelector('.lb-backdrop').onclick = closeLightbox;
    lb.querySelector('.lb-close').onclick = closeLightbox;
    lb.querySelector('.lb-prev').onclick = () => lbNav(-1);
    lb.querySelector('.lb-next').onclick = () => lbNav(1);
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') closeLightbox();
        if (e.key === 'ArrowLeft') lbNav(-1);
        if (e.key === 'ArrowRight') lbNav(1);
    });

    // initialiser état du sélecteur univers selon valeur stockée
    document.querySelectorAll('.univers-btn').forEach(b => b.classList.toggle('active', b.dataset.univers === currentUnivers));

    try { await reloadAll(); }
    catch(err) { console.error('Supabase:', err); }
});