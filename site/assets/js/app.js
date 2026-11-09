/* assets/js/app.js – dedicated real estate plot listings, filters, blueprints, site visits (v55) */
(function () {
  console.log('[app] file loaded at', new Date().toISOString());

  const PLACEHOLDER_IMG = 'assets/img/plot-placeholder.svg';
  const HERO_INTERVAL_MS = 6000;
  const PRIVATE_DETAILS_NOTE = {
    Plot: 'MSRDC sanctioned layout plans, MahaRERA certificates, and detailed cost sheets are shared with you on enquiry or during your guided site visit.',
    Flat: 'The building layout and price breakup are shared with you directly on enquiry.'
  };

  const state = {
    location: '',
    plotType: '',
    budget: '',
    size: '',
    status: '',
    flatArea: '',
    flatBhk: '',
    flatFloor: '',
    data: [],
    plots: [],
    flats: [],
    filtered: [],
    heroIndex: 0,
    heroTimer: null,
    heroSource: []
  };

  const byId = (id) => document.getElementById(id);
  const safe = (v) => (v == null ? '' : String(v));
  const esc = (v) => safe(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uniqueSorted = (values) => Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));

  function track(eventName, params) {
    if (typeof window.gtag === 'function') window.gtag('event', eventName, params || {});
  }

  // ---------- formatting ----------

  const isFlat = (p) => p && p.category === 'Flat';

  function formatBhk(n) {
    return n == null ? '' : `${String(n).replace(/\.0+$/, '')} BHK`;
  }

  function floorText(p) {
    if (p.floor == null && p.totalFloors == null) return '';
    if (p.floor === 0) return p.totalFloors ? `Ground of ${p.totalFloors} floors` : 'Ground floor';
    if (p.floor != null && p.totalFloors != null) return `${p.floor} of ${p.totalFloors} floors`;
    return p.floor != null ? `${p.floor}th floor` : `${p.totalFloors} floors`;
  }

  function formatSqft(n) {
    return n == null ? '' : `${Number(n).toLocaleString('en-IN')} sq ft`;
  }

  function formatLakhs(rupees) {
    if (rupees == null) return '';
    if (rupees >= 1e7) {
      const cr = rupees / 1e7;
      return `₹ ${cr >= 10 ? cr.toFixed(1) : cr.toFixed(2).replace(/\.?0+$/, '')} Cr`;
    }
    const l = rupees / 1e5;
    return `₹ ${l >= 10 ? l.toFixed(1) : l.toFixed(2).replace(/\.?0+$/, '')} L`;
  }

  function sizeRange(p) {
    if (p.carpetArea != null) return `${formatSqft(p.carpetArea)} carpet`;
    const options = p.plotOptions || [];
    const sizes = options.map(o => o.size).filter(n => n != null);
    if (!sizes.length) return '';
    const min = Math.min(...sizes);
    const max = Math.max(...sizes);
    return min === max ? formatSqft(min) : `${min.toLocaleString('en-IN')} – ${max.toLocaleString('en-IN')} sq ft`;
  }

  function priceFrom(p) {
    if (p.price != null) return `${formatLakhs(p.price)}`;
    if (p.priceLabel) return p.priceLabel;
    const options = p.plotOptions || [];
    const prices = options.map(o => o.price).filter(n => n != null);
    if (!prices.length) return 'Price on request';
    const min = Math.min(...prices);
    return `From ${formatLakhs(min)}*`;
  }

  function optionPrice(o) {
    if (o.price != null) return formatLakhs(o.price);
    return o.priceLabel || 'On request';
  }

  function listingTitle(p) {
    return p.title || `${p.plotType || 'Plot'} in ${p.location}`;
  }

  function whatsappLink(text) {
    const num = safe(window.AGENT_WA || '919833987246').replace(/\D/g, '');
    return `https://wa.me/${num}?text=${encodeURIComponent(text || 'Hi, I am interested in plots near Panvel. Please share details.')}`;
  }

  // ---------- media ----------

  function imageCandidates(src) {
    const list = [];
    if (src && !src.startsWith('data:')) {
      list.push(src);
      const qIndex = src.indexOf('?');
      const cleanSrc = qIndex === -1 ? src : src.slice(0, qIndex);
      const suffix = qIndex !== -1 ? src.slice(qIndex) : '';
      const dot = cleanSrc.lastIndexOf('.');
      if (dot !== -1) {
        const base = cleanSrc.slice(0, dot);
        const ext = cleanSrc.slice(dot + 1).toLowerCase();
        if (ext === 'jpg' && !list.includes(`${base}.jpeg${suffix}`)) list.push(`${base}.jpeg${suffix}`);
        else if (ext === 'jpeg' && !list.includes(`${base}.jpg${suffix}`)) list.push(`${base}.jpg${suffix}`);
      }
    }
    const drive = safe(src).match(/^https:\/\/lh3\.googleusercontent\.com\/d\/([\w-]+)/);
    if (drive) list.push(`https://drive.google.com/thumbnail?id=${drive[1]}&sz=w1600`);
    if (!list.includes(PLACEHOLDER_IMG)) list.push(PLACEHOLDER_IMG);
    return list;
  }

  function hydrateImages(container) {
    if (!container) return;
    container.querySelectorAll('img[data-fallbacks]').forEach((img) => {
      const queue = (img.getAttribute('data-fallbacks') || '').split('|').map(s => s.trim()).filter(Boolean);
      img.removeAttribute('data-fallbacks');
      if (!queue.length) return;
      const handler = () => {
        const next = queue.shift();
        if (next) img.src = next;
        if (!queue.length) img.removeEventListener('error', handler);
      };
      img.addEventListener('error', handler);
    });
  }

  function mediaTypeFromSrc(src) {
    const clean = safe(src).split('?')[0].split('#')[0];
    const ext = clean.includes('.') ? clean.slice(clean.lastIndexOf('.') + 1).toLowerCase() : '';
    return ['mp4', 'webm', 'ogg', 'ogv', 'mov', 'm4v'].includes(ext) ? 'video' : 'image';
  }

  function getMediaList(p) {
    if (Array.isArray(p?.media) && p.media.length) {
      return p.media
        .map(item => (typeof item === 'string' ? { type: mediaTypeFromSrc(item), src: item } : { type: item.type || mediaTypeFromSrc(item.src), src: item.src }))
        .filter(item => item.src);
    }
    if (Array.isArray(p?.images) && p.images.length) return p.images.map(src => ({ type: 'image', src }));
    return [{ type: 'image', src: PLACEHOLDER_IMG }];
  }

  function buildImageTag(src, altText) {
    const candidates = imageCandidates(src);
    const primary = candidates.shift();
    const fallbackAttr = candidates.join('|');
    return `<img loading="lazy" src="${esc(primary)}" alt="${esc(altText)}"${fallbackAttr ? ` data-fallbacks="${esc(fallbackAttr)}"` : ''}>`;
  }

  function renderMedia(item, altText, mode) {
    const media = item || { type: 'image', src: PLACEHOLDER_IMG };
    if (media.type === 'youtube') {
      if (mode === 'detail') {
        return `<iframe class="media-el" src="https://www.youtube-nocookie.com/embed/${esc(media.src)}" title="${esc(altText)}" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe>`;
      }
      return buildImageTag(`https://i.ytimg.com/vi/${media.src}/hqdefault.jpg`, altText);
    }
    if (media.type === 'video') {
      const controls = mode === 'detail' ? ' controls' : '';
      const autoplay = mode === 'hero' ? ' autoplay loop' : '';
      return `<video class="media-el" src="${esc(media.src)}" muted playsinline preload="metadata"${controls}${autoplay} aria-label="${esc(altText)}"></video>`;
    }
    return buildImageTag(media.src || PLACEHOLDER_IMG, altText);
  }

  // ---------- filters ----------

  function parseRange(value) {
    if (!value) return null;
    const [min, max] = value.split('-').map(v => (v === '' ? null : Number(v)));
    return { min, max };
  }

  const inRange = (n, range) => !range || n == null || ((range.min == null || n >= range.min) && (range.max == null || n <= range.max));

  function matchesBudgetAndSize(p) {
    const budget = parseRange(state.budget);
    const size = parseRange(state.size);
    if (!budget && !size) return true;
    const options = p.plotOptions && p.plotOptions.length ? p.plotOptions : [{ price: p.price, size: null }];
    return options.some(o => {
      const priceVal = o.price != null ? o.price : p.price;
      const sizeVal = o.size != null ? o.size : null;
      const bOk = !budget || (priceVal != null && inRange(priceVal, budget));
      const sOk = !size || (sizeVal != null && inRange(sizeVal, size));
      return bOk && sOk;
    });
  }

  const locationPlaces = (p) => safe(p.location).split(',').map(s => s.trim()).filter(Boolean);

  function matchesLocation(p, filterLoc) {
    if (!filterLoc) return true;
    const target = filterLoc.toLowerCase().trim();
    const loc = safe(p.location).toLowerCase();
    if (target === 'panvel') return loc.includes('panvel');
    if (target === 'khalapur') return loc.includes('khalapur');
    if (target === 'khopoli') return loc.includes('khopoli');
    return loc.includes(target) || locationPlaces(p).some(place => place.toLowerCase().includes(target));
  }

  function matchesPlotType(p, filterType) {
    if (!filterType) return true;
    const target = filterType.toLowerCase().trim();
    const actual = safe(p.plotType).toLowerCase();
    if (target === 'residential' || target === 'residential plots') {
      return actual.includes('residential') || actual.includes('villa') || actual.includes('na');
    }
    if (target === 'commercial' || target === 'commercial plots') {
      return actual.includes('commercial') || actual.includes('retail');
    }
    if (target === 'villa plots') return actual.includes('villa');
    if (target === 'na plots') return actual.includes('na');
    return actual.includes(target);
  }

  function matchesStatus(p, filterStatus) {
    if (!filterStatus) return true;
    const target = filterStatus.toLowerCase().trim();
    const actual = safe(p.status).toLowerCase().trim();
    if (target === 'under construction') {
      return actual.includes('under') || actual.includes('construction') || actual.includes('development');
    }
    return actual.includes(target);
  }

  function applyFilters(data) {
    return data.filter(p =>
      matchesLocation(p, state.location) &&
      matchesPlotType(p, state.plotType) &&
      matchesStatus(p, state.status) &&
      matchesBudgetAndSize(p)
    );
  }

  function fillSelect(select, values, allLabel) {
    if (!select) return;
    const current = select.value;
    select.innerHTML = `<option value="">${esc(allLabel)}</option>` +
      values.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
    if (values.includes(current)) select.value = current;
  }

  function populateFilterOptions() {
    const locSelect = byId('fLocation');
    if (locSelect) {
      const cur = locSelect.value;
      locSelect.innerHTML = `
        <option value="">All locations</option>
        <option value="Panvel">Panvel</option>
        <option value="Khalapur">Khalapur</option>
        <option value="Khopoli">Khopoli</option>
      `;
      if (cur) locSelect.value = cur;
    }

    const typeSelect = byId('fType');
    if (typeSelect) {
      const cur = typeSelect.value;
      typeSelect.innerHTML = `
        <option value="">All plot types</option>
        <option value="Residential">Residential Plots</option>
        <option value="Commercial">Commercial Plots</option>
        <option value="Villa Plots">Villa Plots</option>
        <option value="NA Plots">NA Plots</option>
      `;
      if (cur) typeSelect.value = cur;
    }

    const statusSelect = byId('fStatus');
    if (statusSelect) {
      const cur = statusSelect.value;
      statusSelect.innerHTML = `
        <option value="">Any status</option>
        <option value="Under Construction">Under Construction</option>
        <option value="Pre-launch">Pre-launch</option>
        <option value="Ready for Registration">Ready for Registration</option>
      `;
      if (cur) statusSelect.value = cur;
    }

    const budgetSelect = byId('fBudget');
    if (budgetSelect && budgetSelect.options.length <= 1) {
      budgetSelect.innerHTML = `
        <option value="">Any budget</option>
        <option value="-5500000">Up to ₹55 Lakhs</option>
        <option value="-10000000">Up to ₹1 Crore</option>
        <option value="-12500000">Up to ₹1.25 Crore</option>
        <option value="-15000000">Up to ₹1.50 Crore</option>
        <option value="-17500000">Up to ₹1.75 Crore</option>
        <option value="-20000000">Up to ₹2 Crore</option>
        <option value="20000000-">Above ₹2 Crore</option>
      `;
    }
  }

  function applyUrlFilters() {
    const params = new URLSearchParams(window.location.search);
    const map = { location: 'fLocation', type: 'fType', status: 'fStatus', budget: 'fBudget', size: 'fSize' };
    Object.entries(map).forEach(([param, id]) => {
      const value = params.get(param);
      const el = byId(id);
      if (!value || !el) return;
      const match = Array.from(el.options).find(o =>
        o.value.toLowerCase().includes(value.toLowerCase()) ||
        o.textContent.toLowerCase().includes(value.toLowerCase())
      );
      if (match) el.value = match.value;
    });
  }

  function readFilters() {
    state.location = byId('fLocation')?.value || '';
    state.plotType = byId('fType')?.value || '';
    state.budget = byId('fBudget')?.value || '';
    state.size = byId('fSize')?.value || '';
    state.status = byId('fStatus')?.value || '';
  }

  function initFilters() {
    const wrap = byId('plotFilters');
    if (!wrap || wrap.dataset.bound === 'true') return;
    wrap.dataset.bound = 'true';
    wrap.querySelectorAll('select').forEach(sel => sel.addEventListener('change', () => {
      readFilters();
      renderPlots();
    }));
    byId('clearFilters')?.addEventListener('click', () => {
      wrap.querySelectorAll('select').forEach(sel => { sel.value = ''; });
      readFilters();
      renderPlots();
    });
  }

  // ---------- cards ----------

  function availabilityBadge(p) {
    if (!p.availability) return '';
    const cls = /sold/i.test(p.availability) ? ' badge-muted' : /few|limited/i.test(p.availability) ? ' badge-alert' : ' badge-ok';
    return `<span class="badge${cls}">${esc(p.availability)}</span>`;
  }

  function cardHTML(p) {
    const title = listingTitle(p);
    const facts = [
      sizeRange(p),
      p.landParcel ? `${p.landParcel}` : '',
      p.possession && !/ask/i.test(p.possession) ? `Possession ${p.possession}` : ''
    ].filter(Boolean);

    const waMsg = `Hi, I am interested in ${title} (${p.location}). Please share the cost sheet, blueprint and available plot sizes.`;

    return `
      <article class="card plot-card" data-listing-id="${esc(p.id)}">
        <div class="thumb single">
          ${renderMedia(getMediaList(p)[0], title, 'card')}
          <span class="badge badge-corner">${esc(p.plotType || 'Plot')}</span>
        </div>
        <div class="body pad">
          <div class="badges">
            ${p.status ? `<span class="badge badge-status">${esc(p.status)}</span>` : ''}
            <span class="badge badge-rera">✓ MahaRERA</span>
            ${availabilityBadge(p)}
          </div>
          <h5 class="title">${esc(title)}</h5>
          <div class="sub">📍 <strong>${esc(p.location)}</strong></div>
          <div class="price-row">
            <span class="price-label">Starting</span>
            <div class="price">${esc(priceFrom(p))}</div>
          </div>
          ${facts.length ? `<ul class="facts">${facts.map(f => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
          <div class="card-actions">
            <button class="btn-primary" type="button" data-details="${esc(p.id)}">Master Plan &amp; Details</button>
            <button class="btn-outline" type="button" data-visit="${esc(p.id)}">Book Site Visit</button>
            <a class="btn-wa-icon" target="_blank" rel="noopener" href="${esc(whatsappLink(waMsg))}" title="WhatsApp Details" aria-label="WhatsApp Details">💬</a>
          </div>
        </div>
      </article>
    `;
  }

  function renderGrid(list, opts) {
    const grid = byId(opts.gridId);
    if (!grid) return;
    const count = byId(opts.countId);
    if (count) count.textContent = opts.total ? `${list.length} of ${opts.total} verified township developments` : '';
    if (!list || list.length === 0) {
      grid.innerHTML = `
        <div class="card empty">
          <h3>No plots match these exact filters</h3>
          <p>Try clearing your filters or select a broader budget / location range. We have exclusive inventory across Panvel, Khalapur, and Khopoli.</p>
          <button type="button" class="btn-primary" data-clear>Reset all filters</button>
        </div>`;
      grid.querySelector('[data-clear]')?.addEventListener('click', () => byId(opts.clearId)?.click());
      return;
    }
    grid.innerHTML = list.map(cardHTML).join('');
    hydrateImages(grid);
    grid.querySelectorAll('[data-details]').forEach(btn => btn.addEventListener('click', () => showDetails(btn.getAttribute('data-details'))));
    grid.querySelectorAll('[data-visit]').forEach(btn => btn.addEventListener('click', () => {
      selectListingForEnquiry(findListing(btn.getAttribute('data-visit')), { type: 'Site visit' });
    }));
  }

  // ---------- hero slideshow ----------

  function stopHeroAuto() {
    if (state.heroTimer) {
      clearInterval(state.heroTimer);
      state.heroTimer = null;
    }
  }

  function renderHero(list) {
    const hero = byId('home')?.querySelector('.hero');
    if (!hero) return;
    const source = (list && list.length ? list : state.plots).slice(0, 5);
    state.heroSource = source;
    if (!source.length) {
      hero.innerHTML = '<div class="slide"><img src="assets/img/custom/royalcrestplotsblueprint.png" alt="Luxury Plotted Townships Panvel"></div>';
      return;
    }
    const idx = (state.heroIndex % source.length + source.length) % source.length;
    state.heroIndex = idx;
    const p = source[idx];
    const title = listingTitle(p);
    const media = getMediaList(p)[0] || { type: 'image', src: 'assets/img/custom/royalcrestplotsblueprint.png' };

    hero.innerHTML = `
      <div class="slide">
        ${renderMedia(media, title, 'hero')}
        <div class="caption">
          <div class="caption-badges">
            <span class="badge">${esc(p.plotType || 'Plotted Township')}</span>
            <span class="badge badge-soft">${esc(p.status || 'Under Construction')}</span>
          </div>
          <h2>${esc(title)}</h2>
          <p>📍 ${esc(p.location)} &nbsp;·&nbsp; ${esc(priceFrom(p))} &nbsp;·&nbsp; ${esc(p.landParcel || '')}</p>
          <div class="caption-cta">
            <button class="btn-primary" type="button" data-hero-details="${esc(p.id)}">Explore Master Blueprint</button>
            <button class="btn-outline" type="button" data-hero-visit="${esc(p.id)}">Book Guided Visit</button>
          </div>
        </div>
        ${source.length > 1 ? `
          <div class="controls">
            <button class="prev" aria-label="Previous slide">‹</button>
            <button class="next" aria-label="Next slide">›</button>
          </div>
        ` : ''}
      </div>
    `;
    hydrateImages(hero);
    hero.querySelector('[data-hero-details]')?.addEventListener('click', () => showDetails(p.id));
    hero.querySelector('[data-hero-visit]')?.addEventListener('click', () => selectListingForEnquiry(p, { type: 'Site visit' }));
    hero.querySelector('.prev')?.addEventListener('click', (evt) => { evt.stopPropagation(); changeHero(-1); });
    hero.querySelector('.next')?.addEventListener('click', (evt) => { evt.stopPropagation(); changeHero(1); });
  }

  function changeHero(delta) {
    const source = state.heroSource;
    if (!source.length) return;
    state.heroIndex = (state.heroIndex + delta + source.length) % source.length;
    renderHero(source);
    startHeroAuto();
  }

  function startHeroAuto() {
    stopHeroAuto();
    if (state.heroSource.length < 2) return;
    state.heroTimer = setInterval(() => {
      state.heroIndex = (state.heroIndex + 1) % state.heroSource.length;
      renderHero(state.heroSource);
    }, HERO_INTERVAL_MS);
  }

  // ---------- details modal ----------

  const findListing = (id) => state.data.find(x => String(x.id) === String(id));

  function factRow(label, value) {
    return value ? `<div class="fact"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>` : '';
  }

  function closeDetails() {
    const modal = byId('details-modal');
    if (!modal) return;
    modal.style.display = 'none';
    document.body.classList.remove('modal-open');
    modal.querySelectorAll('video').forEach(v => v.pause());
  }

  function showDetails(id) {
    const p = findListing(id);
    const modal = byId('details-modal');
    const body = byId('details-body');
    if (!p || !modal || !body) return;
    track('view_listing', { listing_id: p.id, listing_title: listingTitle(p) });

    const title = listingTitle(p);
    const media = getMediaList(p);
    const options = p.plotOptions || [];
    const typeLabel = p.plotType || 'Plot';

    body.innerHTML = `
      <div class="badges">
        <span class="badge">${esc(typeLabel)}</span>
        <span class="badge badge-status">${esc(p.status || 'Under Construction')}</span>
        <span class="badge badge-rera">✓ MahaRERA Approved</span>
        ${availabilityBadge(p)}
      </div>
      <h3 class="detail-title">${esc(title)}</h3>
      <div class="sub">📍 ${esc(p.location)} &nbsp;·&nbsp; Project Ref ${esc(p.id)}</div>

      <div class="detail-hero" id="detailHero">${renderMedia(media[0], title, 'detail')}</div>
      ${media.length > 1 ? `
        <div class="detail-thumbs">
          ${media.map((m, i) => `
            <button type="button" class="thumb-btn${i === 0 ? ' active' : ''}" data-media="${i}" aria-label="Show media ${i + 1}">
              ${m.type === 'video' ? '<span class="thumb-video">▶ Video</span>' : buildImageTag(m.src, '')}
            </button>
          `).join('')}
        </div>
      ` : ''}

      <div class="fact-grid">
        ${factRow('Plot Type', p.plotType)}
        ${factRow('Location', p.location)}
        ${factRow('Township Size', p.landParcel)}
        ${factRow('Demarcated Plots', p.totalPlots)}
        ${factRow('Current Status', p.status)}
        ${factRow('Possession Target', p.possession)}
        ${factRow('Approvals & Sanctions', p.approvals)}
      </div>

      ${options.length ? `
        <h4>Demarcated Plot Inventory &amp; Pricing</h4>
        <div class="table-wrap">
          <table class="plot-table">
            <thead><tr><th>Plot Category</th><th>Carpet / Area</th><th>Price</th><th>Action</th></tr></thead>
            <tbody>${options.map((o, i) => `
              <tr>
                <td><strong>${esc(o.name || `Plot ${i + 1}`)}</strong></td>
                <td>${esc(o.size != null ? formatSqft(o.size) : (o.sizeLabel || 'Ask agent'))}</td>
                <td class="price-cell">${esc(optionPrice(o))}</td>
                <td><button type="button" class="btn-outline-sm" data-option="${i}">Enquire</button></td>
              </tr>
            `).join('')}</tbody>
          </table>
        </div>
      ` : ''}

      ${p.description ? `<p class="detail-desc">${esc(p.description)}</p>` : ''}

      ${p.amenities && p.amenities.length ? `
        <h4>Township Amenities &amp; Infrastructure</h4>
        <ul class="chips">${p.amenities.map(a => `<li>✓ ${esc(a)}</li>`).join('')}</ul>
      ` : ''}

      ${p.connectivity && p.connectivity.length ? `
        <h4>Regional Connectivity &amp; Travel Times</h4>
        <ul class="connect-list">${p.connectivity.map(c => `<li><span>${esc(c.place)}</span><strong>${esc(c.distance)}</strong></li>`).join('')}</ul>
      ` : ''}

      <div class="blueprint-download-box">
        <div>
          <strong>Sanctioned Master Layout &amp; Blueprint Available</strong>
          <p class="small muted">Clear demarcated plots, 40-ft internal roads, clubhouse zone &amp; commercial frontage.</p>
        </div>
        <a class="btn-primary" href="assets/docs/royalcrestblueprint.pdf" target="_blank" rel="noopener">Download Master Plan (PDF)</a>
      </div>

      <div class="sticky-actions">
        <button class="btn-primary" type="button" data-enquire="visit">Book Free VIP Site Visit (AC Cab)</button>
        <button class="btn-outline" type="button" data-enquire="price">Get Cost Sheet &amp; Price Breakup</button>
        <a class="cta whatsapp" target="_blank" rel="noopener" href="${esc(whatsappLink(`Hi, I am interested in ${title} (${p.location}). Please share details.`))}">WhatsApp</a>
      </div>
    `;

    hydrateImages(body);

    body.querySelectorAll('[data-media]').forEach(btn => btn.addEventListener('click', () => {
      const item = media[Number(btn.getAttribute('data-media'))];
      const hero = byId('detailHero');
      if (!hero || !item) return;
      hero.innerHTML = renderMedia(item, title, 'detail');
      hydrateImages(hero);
      body.querySelectorAll('[data-media]').forEach(b => b.classList.toggle('active', b === btn));
    }));

    body.querySelectorAll('[data-option]').forEach(btn => btn.addEventListener('click', () => {
      const option = options[Number(btn.getAttribute('data-option'))];
      closeDetails();
      selectListingForEnquiry(p, { type: 'Price & cost sheet', option: option && option.name });
    }));

    body.querySelector('[data-enquire="visit"]')?.addEventListener('click', () => {
      closeDetails();
      selectListingForEnquiry(p, { type: 'Site visit' });
    });

    body.querySelector('[data-enquire="price"]')?.addEventListener('click', () => {
      closeDetails();
      selectListingForEnquiry(p, { type: 'Price & cost sheet' });
    });

    modal.style.display = 'block';
    modal.scrollTop = 0;
    document.body.classList.add('modal-open');
  }

  function initModal() {
    const modal = byId('details-modal');
    if (!modal || modal.dataset.bound === 'true') return;
    modal.dataset.bound = 'true';
    byId('details-close')?.addEventListener('click', closeDetails);
    modal.addEventListener('click', (evt) => { if (evt.target === modal) closeDetails(); });
    document.addEventListener('keydown', (evt) => { if (evt.key === 'Escape') closeDetails(); });
  }

  // ---------- enquiry form ----------

  function populateEnquiryListings() {
    const select = byId('enquiryListing');
    if (!select) return;
    const current = select.value;
    select.innerHTML = '<option value="">Help me choose a township</option>' +
      state.plots.map(p => `<option value="${esc(p.id)}">${esc(p.plotType || 'Plot')} · ${esc(listingTitle(p))} — ${esc(p.location)}</option>`).join('');
    if (findListing(current)) select.value = current;
    syncPlotOptions();
  }

  function syncPlotOptions(preferred) {
    const listing = findListing(byId('enquiryListing')?.value);
    const wrap = byId('plotOptionWrap');
    const select = byId('enquiryOption');
    const titleField = byId('enquiryPropertyTitle');
    if (titleField) titleField.value = listing ? `${listingTitle(listing)} (${listing.location})` : '';
    if (!select || !wrap) return;
    const options = listing ? listing.plotOptions || [] : [];
    wrap.hidden = options.length === 0;
    select.innerHTML = '<option value="">Any / recommend best option</option>' + options.map(o => {
      const label = [o.name, o.size != null ? formatSqft(o.size) : '', optionPrice(o)].filter(Boolean).join(' · ');
      return `<option value="${esc(label)}">${esc(label)}</option>`;
    }).join('');
    if (preferred) {
      const match = Array.from(select.options).find(opt => opt.value.startsWith(preferred));
      if (match) select.value = match.value;
    }
  }

  function syncVisitFields() {
    const type = byId('enquiryType')?.value || '';
    const visit = byId('visitFields');
    if (visit) visit.hidden = type !== 'Site visit';
  }

  function selectListingForEnquiry(p, opts) {
    const form = byId('leadForm');
    if (!form) return;
    const listingSelect = byId('enquiryListing');
    if (listingSelect) listingSelect.value = p ? safe(p.id) : '';
    syncPlotOptions(opts && opts.option);
    const typeSelect = byId('enquiryType');
    if (typeSelect && opts && opts.type) typeSelect.value = opts.type;
    syncVisitFields();
    track('start_enquiry', { listing_id: p ? p.id : '', enquiry_type: opts && opts.type });

    byId('contact')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => form.querySelector('[name="name"]')?.focus({ preventScroll: true }), 450);
  }

  function setFormStatus(message, kind) {
    const el = byId('formStatus');
    if (!el) return;
    el.textContent = message;
    el.className = `form-status ${kind || ''}`;
    el.hidden = !message;
  }

  window.__INIT_LEAD_FORM__ = function () {
    const form = byId('leadForm');
    if (!form || form.dataset.bound === 'true') return;
    form.dataset.bound = 'true';

    const dateInput = byId('visitDate');
    if (dateInput) {
      const today = new Date();
      today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
      dateInput.min = today.toISOString().slice(0, 10);
    }
    byId('enquiryType')?.addEventListener('change', syncVisitFields);
    byId('enquiryListing')?.addEventListener('change', () => syncPlotOptions());
    syncVisitFields();

    form.addEventListener('submit', async (evt) => {
      evt.preventDefault();
      const endpoint = safe(window.LEADS_ENDPOINT).trim();
      if (!safe(form.elements.name?.value).trim()) {
        setFormStatus('Please enter your full name.', 'error');
        form.elements.name?.focus();
        return;
      }
      const phoneDigits = safe(form.elements.phone?.value).replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
      if (!/^[6-9]\d{9}$/.test(phoneDigits)) {
        setFormStatus('Please enter a valid 10-digit Indian mobile number.', 'error');
        form.elements.phone?.focus();
        return;
      }

      const submitButton = form.querySelector('button[type="submit"]');
      const originalText = submitButton ? submitButton.textContent : '';
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'Submitting Booking…';
      }

      const payload = Object.fromEntries(new FormData(form).entries());
      payload.phone = `+91${phoneDigits}`;
      payload.source = window.location.href;

      try {
        if (endpoint) {
          await fetch(endpoint, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
          });
        }
        track('generate_lead', { enquiry_type: payload.enquiryType, listing_id: payload.propertyId });
        const isVisit = payload.enquiryType === 'Site visit';
        form.reset();
        syncPlotOptions();
        syncVisitFields();
        setFormStatus(isVisit
          ? '✓ Site Visit Request Received! Our relationship manager will call you within 15 minutes to confirm your complimentary AC Cab pickup.'
          : '✓ Thank you! The master layout plan, pricing sheet, and legal approvals have been sent to your phone.', 'success');
      } catch (_err) {
        setFormStatus('Enquiry recorded. For instant priority assistance, please WhatsApp or call us directly.', 'success');
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = originalText;
        }
      }
    });
  };

  // ---------- page chrome ----------

  function initChrome() {
    if (document.body.dataset.chrome === 'true') return;
    document.body.dataset.chrome = 'true';

    const toggle = byId('menuToggle');
    const menu = byId('mobileMenu');
    if (toggle && menu) {
      toggle.addEventListener('click', () => {
        const open = menu.classList.toggle('open');
        toggle.setAttribute('aria-expanded', String(open));
      });
      menu.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
        menu.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      }));
    }

    const reraNo = safe(window.AGENT_RERA).trim();
    const reraEl = byId('agentRera');
    if (reraEl && reraNo) {
      reraEl.querySelector('[data-rera]').textContent = reraNo;
      reraEl.hidden = false;
    }

    document.querySelectorAll('[data-call]').forEach(a => { a.href = `tel:${safe(window.AGENT_PHONE || '+919833987246')}`; });
    document.querySelectorAll('[data-wa]').forEach(a => { a.href = whatsappLink(a.getAttribute('data-wa')); });
    document.addEventListener('click', (evt) => {
      const link = evt.target.closest && evt.target.closest('a[href^="tel:"], a[href*="wa.me"]');
      if (link) track(link.href.startsWith('tel:') ? 'call_click' : 'whatsapp_click', { location: link.dataset.where || '' });
    });

    document.querySelectorAll('[data-book-visit]').forEach(btn => btn.addEventListener('click', (evt) => {
      evt.preventDefault();
      selectListingForEnquiry(null, { type: 'Site visit' });
    }));
  }

  // ---------- boot ----------

  function renderPlots() {
    state.filtered = applyFilters(state.plots);
    state.heroIndex = 0;
    renderGrid(state.filtered, {
      gridId: 'grid',
      countId: 'resultCount',
      clearId: 'clearFilters',
      total: state.plots.length,
      noun: 'plots'
    });
    renderHero(state.filtered);
    startHeroAuto();
  }

  window.__INIT_PAGE__ = function () {
    initChrome();
    initModal();
    window.__INIT_LEAD_FORM__();
  };

  window.__RENDER_APP__ = function () {
    console.log('[app] __RENDER_APP__ triggered');
    state.data = Array.isArray(window.__PROPS__) ? window.__PROPS__ : [];
    state.plots = state.data.filter(p => !isFlat(p));
    state.flats = state.data.filter(isFlat);
    window.__INIT_PAGE__();
    populateFilterOptions();
    applyUrlFilters();
    readFilters();
    initFilters();
    populateEnquiryListings();
    renderPlots();
  };
})();

document.addEventListener('DOMContentLoaded', () => {
  if (typeof window.__INIT_PAGE__ === 'function') window.__INIT_PAGE__();
});

if (Array.isArray(window.__PROPS__)) {
  setTimeout(() => { if (typeof window.__RENDER_APP__ === 'function') window.__RENDER_APP__(); }, 0);
}
