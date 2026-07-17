const $ = (selector) => document.querySelector(selector);
const state = {
  sizes: new Set(), favs: new Set(JSON.parse(localStorage.getItem("cakeFavs") || "[]")),
  showFavOnly: false, category: "", results: [], currentCake: null,
  lastFocus: null, scrollY: 0, detailHistory: false,
  page: 0, total: 0, hasMore: false, loadingMore: false, searchToken: 0
};
const esc = (value) => String(value || "").replace(/[&<>\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
const tags = (items, limit = 3) => (items || []).filter((item) => item && item !== "无").slice(0, limit).map((item) => `<span>${esc(item)}</span>`).join("");
const ratioFor = (cake, index = 0) => ["4 / 5", "1 / 1", "3 / 4", "5 / 6"][(cake.id.length + index) % 4];

function saveFavs() {
  localStorage.setItem("cakeFavs", JSON.stringify([...state.favs]));
  $("#favCount").textContent = state.favs.size;
}

function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.hidden = false;
  clearTimeout(element._timer);
  element._timer = setTimeout(() => { element.hidden = true; }, 1700);
}

function visibleResults() {
  let list = [...state.results];
  if (state.showFavOnly) list = list.filter((cake) => state.favs.has(cake.id));
  const sort = $("#sortBy").value;
  if (sort === "priceAsc") list.sort((a, b) => a.price - b.price);
  if (sort === "priceDesc") list.sort((a, b) => b.price - a.price);
  return list;
}

function card(cake, index = 0, related = false) {
  const compactTags = [...(cake.occasions || []), ...(cake.themes || []), cake.category];
  const classes = related ? "related-card" : "card";
  return `<article class="${classes}" data-id="${cake.id}" tabindex="0" aria-label="${esc(cake.size)}蛋糕，价格${cake.price}元">
    <div class="card-media" style="aspect-ratio:${ratioFor(cake, index)}">
      <img loading="lazy" decoding="async" src="${cake.thumb || cake.img}" alt="${esc(cake.category)} ${esc(cake.size)}蛋糕">
      <button class="card-fav ${state.favs.has(cake.id) ? "on" : ""}" data-fav="${cake.id}" aria-label="${state.favs.has(cake.id) ? "取消收藏" : "收藏"}">${state.favs.has(cake.id) ? "♥" : "♡"}</button>
    </div>
    <div class="card-body"><div class="card-line"><strong><small>¥</small>${cake.price}</strong><span>${esc(cake.size)} · ${esc(cake.serving)}</span></div><div class="card-tags">${tags(compactTags, 2)}</div></div>
  </article>`;
}

function revealImage(img) {
  const reveal = () => {
    img.classList.add("is-loaded");
    img.closest(".detail-hero")?.classList.add("has-image");
  };
  if (img.complete && img.naturalWidth) reveal();
  else img.addEventListener("load", reveal, { once: true });
  img.addEventListener("error", () => img.closest(".card-media,.detail-hero")?.classList.add("image-error"), { once: true });
}

function bindImages(scope = document) {
  scope.querySelectorAll(".card-media img,.detail-hero img").forEach(revealImage);
}

function render() {
  const list = visibleResults();
  $("#grid").innerHTML = list.map((cake, index) => card(cake, index)).join("");
  $("#grid").setAttribute("aria-busy", "false");
  bindImages($("#grid"));
  $("#empty").hidden = Boolean(list.length);
  renderActiveFilters();
}

function appendResults(batch) {
  const start = state.results.length - batch.length;
  $("#grid").insertAdjacentHTML("beforeend", batch.map((cake, index) => card(cake, start + index)).join(""));
  bindImages($("#grid"));
}

function filterValues() {
  return {
    query: $("#q").value.trim(),
    priceMin: $("#priceMin").value ? Number($("#priceMin").value) : undefined,
    priceMax: $("#priceMax").value ? Number($("#priceMax").value) : undefined,
    sizes: [...state.sizes], occasion: $("#occasionFilter").value,
    target: $("#targetFilter").value, category: state.category,
    sort: $("#sortBy").value
  };
}

function renderActiveFilters() {
  const values = filterValues();
  const items = [];
  if (values.query) items.push(["query", values.query]);
  if (values.priceMin !== undefined) items.push(["priceMin", `¥${values.priceMin}以上`]);
  if (values.priceMax !== undefined) items.push(["priceMax", `¥${values.priceMax}以下`]);
  values.sizes.forEach((size) => items.push([`size:${size}`, size]));
  if (values.occasion) items.push(["occasion", values.occasion]);
  if (values.target) items.push(["target", values.target]);
  const active = $("#activeFilters");
  active.innerHTML = items.map(([key, label]) => `<button data-remove-filter="${esc(key)}">${esc(label)}</button>`).join("");
  active.hidden = !items.length;
  $("#filterCount").hidden = !items.length;
  $("#filterCount").textContent = items.length;
}

function updateLoadMore() {
  const wrap = $("#loadMore");
  wrap.hidden = !state.results.length;
  wrap.classList.toggle("loading-more", state.loadingMore);
  wrap.classList.toggle("done", !state.hasMore && !state.loadingMore);
  $("#loadMoreStatus").textContent = state.hasMore ? `已显示 ${state.results.length} / ${state.total} 款` : `已显示全部 ${state.results.length} 款`;
}

async function loadPage(reset = false) {
  if ((!reset && state.loadingMore) || (!reset && !state.hasMore)) return;
  if (reset) {
    state.page = 0; state.total = 0; state.hasMore = true; state.results = [];
    $("#grid").setAttribute("aria-busy", "true");
    $("#grid").innerHTML = '<div class="loading"><div><i></i><span>正在挑选合适的蛋糕…</span></div></div>';
    $("#empty").hidden = true;
    $("#loadMore").hidden = true;
  }
  state.loadingMore = true;
  updateLoadMore();
  const token = reset ? ++state.searchToken : state.searchToken;
  const body = { ...filterValues(), page: state.page, limit: 40 };
  try {
    const response = await fetch("/api/semantic-search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error("search");
    const data = await response.json();
    if (token !== state.searchToken) return;
    const batch = data.results || [];
    state.total = data.total ?? batch.length;
    state.hasMore = Boolean(data.hasMore);
    state.page += 1;
    if (reset) state.results = batch; else state.results.push(...batch);
    if (!batch.length) state.hasMore = false;
    const count = state.total;
    $("#status").innerHTML = `<strong>找到 ${count} 款蛋糕</strong>${body.query ? `<span class="ai-label">${data.provider === "kimi" ? "✦ AI 精排" : "智能匹配"}</span>` : ""}<small>${esc(data.summary || "")}</small>`;
    if (reset) render(); else appendResults(state.showFavOnly ? batch.filter((cake) => state.favs.has(cake.id)) : batch);
  } catch {
    if (reset) {
      $("#status").innerHTML = "<strong>网络有点慢</strong><small>请稍后重试</small>";
      $("#grid").innerHTML = "";
      $("#grid").setAttribute("aria-busy", "false");
    } else toast("更多款式加载失败，请点击重试");
  } finally {
    if (token === state.searchToken) { state.loadingMore = false; updateLoadMore(); }
  }
}

function search() { return loadPage(true); }

function relatedCakes(cake) {
  const themes = new Set(cake.themes || []);
  return state.results.filter((item) => item.id !== cake.id).map((item) => ({
    item,
    score: (item.category === cake.category ? 5 : 0) + (item.occasions || []).filter((x) => (cake.occasions || []).includes(x)).length * 2 + (item.themes || []).filter((x) => themes.has(x)).length
  })).sort((a, b) => b.score - a.score).slice(0, 6).map(({ item }) => item);
}

function openDetail(cake, pushHistory = true) {
  if (!cake) return;
  state.currentCake = cake;
  state.lastFocus = document.activeElement;
  state.scrollY = window.scrollY;
  const image = $("#mImg");
  image.classList.remove("is-loaded");
  image.closest(".detail-hero").classList.remove("has-image", "image-error");
  image.src = cake.img;
  revealImage(image);
  $("#mBarcode").textContent = cake.barcode;
  $("#mPrice").textContent = cake.price;
  $("#mServing").textContent = `${cake.size} · ${cake.serving}`;
  $("#mHighlights").innerHTML = tags([...(cake.occasions || []), ...(cake.targets || []), ...(cake.themes || [])], 6);
  $("#mDesc").textContent = cake.desc;
  $("#mSpec").innerHTML = `<span>${esc(cake.size)} · ${esc(cake.serving)}</span><span>¥${cake.price} · 预算 ${esc(cake.budget)}</span>`;
  $("#mTargets").innerHTML = tags(cake.targets, 20) || "<span>通用</span>";
  $("#mOccasions").innerHTML = tags(cake.occasions, 20);
  $("#mThemes").innerHTML = tags(cake.themes, 20);
  $("#mShape").textContent = cake.shape || "未标注";
  $("#mColors").innerHTML = tags(cake.colors, 20);
  $("#mDecor").textContent = cake.decor || "无";
  $("#mExtra").textContent = `${cake.flowers || "无"} / ${cake.ip || "无"}`;
  $(".detail-more").open = false;
  $("#relatedGrid").innerHTML = relatedCakes(cake).map((item, index) => card(item, index, true)).join("");
  bindImages($("#relatedGrid"));
  refreshFavUI();
  $("#modal").classList.add("open");
  $("#modal").setAttribute("aria-hidden", "false");
  document.body.classList.add("locked");
  $(".detail-scroll").scrollTop = 0;
  $(".detail-back").focus();
  if (pushHistory && !state.detailHistory) {
    history.pushState({ cake: cake.id }, "", `#cake-${cake.id}`);
    state.detailHistory = true;
  } else if (!pushHistory && state.detailHistory) {
    history.replaceState({ cake: cake.id }, "", `#cake-${cake.id}`);
  }
}

function closeDetail(fromHistory = false) {
  if (!$("#modal").classList.contains("open")) return;
  $("#modal").classList.remove("open");
  $("#modal").setAttribute("aria-hidden", "true");
  document.body.classList.remove("locked");
  state.currentCake = null;
  window.scrollTo(0, state.scrollY);
  state.lastFocus?.focus?.();
  if (!fromHistory && state.detailHistory) history.back();
  state.detailHistory = false;
}

function toggleFav(id) {
  const saved = state.favs.has(id);
  saved ? state.favs.delete(id) : state.favs.add(id);
  saveFavs();
  refreshFavUI();
  toast(saved ? "已取消收藏" : "已收藏");
  if (state.showFavOnly && !state.currentCake) render();
}

function refreshFavUI() {
  document.querySelectorAll("[data-fav]").forEach((button) => {
    const on = state.favs.has(button.dataset.fav);
    button.classList.toggle("on", on);
    button.textContent = on ? "♥" : "♡";
    button.setAttribute("aria-label", on ? "取消收藏" : "收藏");
  });
  if (state.currentCake) {
    const on = state.favs.has(state.currentCake.id);
    $("#mFav").classList.toggle("on", on);
    $("#mFav").textContent = on ? "♥ 已收藏" : "♡ 收藏";
  }
}

function openFilters() {
  state.lastFocus = document.activeElement;
  $("#filterSheet").classList.add("open");
  $("#filterSheet").setAttribute("aria-hidden", "false");
  document.body.classList.add("locked");
  $("#priceMin").focus();
}

function closeFilters() {
  $("#filterSheet").classList.remove("open");
  $("#filterSheet").setAttribute("aria-hidden", "true");
  document.body.classList.remove("locked");
  state.lastFocus?.focus?.();
}

function resetFilters(runSearch = true) {
  state.sizes.clear(); state.category = "";
  ["q", "priceMin", "priceMax", "occasionFilter", "targetFilter"].forEach((id) => { $("#" + id).value = ""; });
  document.querySelectorAll("[data-size]").forEach((button) => button.classList.remove("active"));
  document.querySelectorAll("[data-category]").forEach((button) => button.classList.toggle("active", !button.dataset.category));
  if (runSearch) search();
}

function removeFilter(key) {
  if (key === "query") $("#q").value = "";
  if (key === "priceMin") $("#priceMin").value = "";
  if (key === "priceMax") $("#priceMax").value = "";
  if (key === "occasion") $("#occasionFilter").value = "";
  if (key === "target") $("#targetFilter").value = "";
  if (key.startsWith("size:")) {
    const size = key.slice(5); state.sizes.delete(size);
    document.querySelector(`[data-size="${CSS.escape(size)}"]`)?.classList.remove("active");
  }
  search();
}

function setupCatalog(meta) {
  $("#sizes").innerHTML = (meta.sizes || []).map((size) => `<button type="button" data-size="${esc(size)}">${esc(size)}</button>`).join("");
  const featured = ["", "仙女款", "女孩款", "男孩款", "毕业六一款", "祝寿款", "入宅开业款", "纪念日婚庆款"];
  const counts = new Map((meta.categories || []).map((item) => [item.name, item.count]));
  $("#categoryList").innerHTML = featured.filter((name) => !name || counts.has(name)).map((name) => `<button type="button" class="${name ? "" : "active"}" data-category="${esc(name)}">${name || "全部"}<b>${name ? counts.get(name) : meta.total || 0}</b></button>`).join("");
}

function trapFocus(container, event) {
  if (event.key !== "Tab") return;
  const focusable = [...container.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),summary,[tabindex]:not([tabindex="-1"])')].filter((element) => element.offsetParent !== null);
  if (!focusable.length) return;
  const first = focusable[0], last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

$("#searchForm").addEventListener("submit", (event) => { event.preventDefault(); search(); });
$("#examples").onclick = (event) => { const button = event.target.closest("[data-q]"); if (button) { $("#q").value = button.dataset.q; search(); } };
$("#sizes").onclick = (event) => { const button = event.target.closest("[data-size]"); if (!button) return; state.sizes.has(button.dataset.size) ? state.sizes.delete(button.dataset.size) : state.sizes.add(button.dataset.size); button.classList.toggle("active"); };
$("#categoryList").onclick = (event) => { const button = event.target.closest("[data-category]"); if (!button) return; state.category = button.dataset.category; document.querySelectorAll("[data-category]").forEach((item) => item.classList.toggle("active", item === button)); search(); };
$("#grid").onclick = (event) => { const fav = event.target.closest("[data-fav]"); if (fav) { event.stopPropagation(); toggleFav(fav.dataset.fav); return; } const item = event.target.closest("[data-id]"); openDetail(state.results.find((cake) => cake.id === item?.dataset.id)); };
$("#grid").onkeydown = (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.target.closest("[data-id]")?.click(); } };
$("#relatedGrid").onclick = (event) => { const fav = event.target.closest("[data-fav]"); if (fav) { event.stopPropagation(); toggleFav(fav.dataset.fav); return; } const item = event.target.closest("[data-id]"); openDetail(state.results.find((cake) => cake.id === item?.dataset.id), false); };
$("#favToggle").onclick = (event) => { state.showFavOnly = !state.showFavOnly; event.currentTarget.classList.toggle("active", state.showFavOnly); event.currentTarget.setAttribute("aria-pressed", state.showFavOnly); $("#status").innerHTML = `<strong>${state.showFavOnly ? "我的收藏" : `找到 ${state.results.length} 款蛋糕`}</strong>`; render(); };
$("#sortBy").onchange = search;
$("#filterOpen").onclick = openFilters;
document.querySelectorAll("[data-filter-close]").forEach((element) => { element.onclick = closeFilters; });
$("#applyFilters").onclick = () => { closeFilters(); search(); };
$("#resetBtn").onclick = () => resetFilters(false);
$("#emptyReset").onclick = () => resetFilters(true);
$("#loadMoreBtn").onclick = () => loadPage(false);
$("#activeFilters").onclick = (event) => { const button = event.target.closest("[data-remove-filter]"); if (button) removeFilter(button.dataset.removeFilter); };
$("#mFav").onclick = () => state.currentCake && toggleFav(state.currentCake.id);
$("#copyBarcode").onclick = () => state.currentCake && navigator.clipboard.writeText(state.currentCake.barcode).then(() => toast("款式编号已复制"));
$("#shareBtn").onclick = async () => { if (!state.currentCake) return; const data = { title: "红鞋烘焙蛋糕款式", text: `${state.currentCake.barcode} · ${state.currentCake.size} · ¥${state.currentCake.price}`, url: location.href }; if (navigator.share) await navigator.share(data).catch(() => {}); else navigator.clipboard.writeText(location.href).then(() => toast("链接已复制")); };
document.querySelectorAll("[data-close]").forEach((element) => { element.onclick = () => closeDetail(); });
window.addEventListener("popstate", () => { if ($("#modal").classList.contains("open")) closeDetail(true); });
document.addEventListener("keydown", (event) => {
  const filterOpen = $("#filterSheet").classList.contains("open");
  const detailOpen = $("#modal").classList.contains("open");
  if (filterOpen) trapFocus($("#filterSheet"), event);
  else if (detailOpen) trapFocus($("#modal"), event);
  if (event.key === "Escape") { if (filterOpen) closeFilters(); else closeDetail(); }
});

const loadObserver = new IntersectionObserver((entries) => {
  if (entries.some((entry) => entry.isIntersecting)) loadPage(false);
}, { rootMargin: "700px 0px" });
loadObserver.observe($("#loadMore"));

(async () => {
  saveFavs();
  try {
    const response = await fetch("/api/semantic-search", { cache: "force-cache" });
    if (!response.ok) throw new Error("meta");
    setupCatalog(await response.json());
    await search();
  } catch {
    $("#status").innerHTML = "<strong>网络有点慢</strong><small>请点击搜索重试</small>";
    $("#grid").innerHTML = "";
  }
})();
