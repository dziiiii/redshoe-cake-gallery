const $ = (s) => document.querySelector(s);
const state = { sizes: new Set(), favs: new Set(JSON.parse(localStorage.getItem("cakeFavs") || "[]")), showFavOnly: false, category: "", results: [] };
const esc = (s) => String(s || "").replace(/[&<>\"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));
const tags = (items, limit = 3) => (items || []).filter((x) => x && x !== "无").slice(0, limit).map((x) => `<span>${esc(x)}</span>`).join("");

function saveFavs() { localStorage.setItem("cakeFavs", JSON.stringify([...state.favs])); $("#favCount").textContent = state.favs.size; }
function toast(message) { const el = $("#toast"); el.textContent = message; el.hidden = false; clearTimeout(el._timer); el._timer = setTimeout(() => { el.hidden = true; }, 1600); }

function visibleResults() {
  let list = state.results.filter((c) => !state.category || c.category === state.category);
  if (state.showFavOnly) list = list.filter((c) => state.favs.has(c.id));
  const sort = $("#sortBy").value;
  if (sort === "priceAsc") list.sort((a, b) => a.price - b.price);
  if (sort === "priceDesc") list.sort((a, b) => b.price - a.price);
  return list;
}

function card(c) {
  const compactTags = [...(c.occasions || []), ...(c.themes || []), c.category];
  return `<article class="card" data-id="${c.id}" tabindex="0">
    <div class="card-media"><img loading="lazy" decoding="async" src="${c.thumb || c.img}" alt="${esc(c.category)} ${esc(c.size)}蛋糕"><button class="card-fav ${state.favs.has(c.id) ? "on" : ""}" data-fav="${c.id}" aria-label="收藏">${state.favs.has(c.id) ? "♥" : "♡"}</button></div>
    <div class="card-body"><div class="card-line"><strong><small>¥</small>${c.price}</strong><span>${esc(c.size)} · ${esc(c.serving)}</span></div><div class="card-tags">${tags(compactTags)}</div><p class="${c.reason ? "reason" : ""}">${esc(c.reason || c.desc)}</p></div>
  </article>`;
}

function render() {
  const list = visibleResults();
  $("#grid").innerHTML = list.slice(0, 60).map(card).join("");
  $("#empty").hidden = Boolean(list.length);
}

async function search() {
  $("#grid").innerHTML = '<div class="loading"><i></i><span>正在挑选合适的蛋糕…</span></div>';
  const body = { query: $("#q").value.trim(), priceMin: $("#priceMin").value ? Number($("#priceMin").value) : undefined, priceMax: $("#priceMax").value ? Number($("#priceMax").value) : undefined, sizes: [...state.sizes], occasion: $("#occasionFilter").value, target: $("#targetFilter").value, category: state.category };
  try {
    const data = await fetch("/api/semantic-search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
    state.results = data.results || [];
    $("#status").innerHTML = `<strong>为你找到 ${data.total ?? state.results.length} 款</strong>${body.query ? `<span class="ai-label">${data.provider === "kimi" ? "✦ AI 精排" : "本地匹配"}</span>` : ""}<small>${esc(data.summary || "")}</small>`;
    render();
  } catch { $("#status").textContent = "加载失败，请稍后重试"; $("#grid").innerHTML = ""; }
}

function openDetail(c) {
  $("#mImg").src = c.img; $("#mBarcode").textContent = c.barcode; $("#mPrice").textContent = c.price;
  $("#mSpec").innerHTML = `<span>${esc(c.size)} · ${esc(c.serving)}</span><span>¥${c.price} · 预算 ${esc(c.budget)}</span>`;
  $("#mTargets").innerHTML = tags(c.targets, 20) || "<span>通用</span>"; $("#mOccasions").innerHTML = tags(c.occasions, 20);
  $("#mThemes").innerHTML = tags(c.themes, 20); $("#mShape").textContent = c.shape || "未标注"; $("#mColors").innerHTML = tags(c.colors, 20);
  $("#mDecor").textContent = c.decor || "无"; $("#mExtra").textContent = `${c.flowers || "无"} / ${c.ip || "无"}`; $("#mDesc").textContent = c.desc;
  const fav = $("#mFav"); fav.classList.toggle("on", state.favs.has(c.id)); fav.textContent = state.favs.has(c.id) ? "♥ 已收藏" : "♡ 收藏"; fav.onclick = () => { toggleFav(c.id); openDetail(c); };
  $("#copyBarcode").onclick = () => navigator.clipboard.writeText(c.barcode).then(() => toast("已复制款式编号"));
  $("#modal").classList.add("open"); $("#modal").setAttribute("aria-hidden", "false"); document.body.classList.add("locked");
}
function closeDetail() { $("#modal").classList.remove("open"); $("#modal").setAttribute("aria-hidden", "true"); document.body.classList.remove("locked"); }
function toggleFav(id) { state.favs.has(id) ? state.favs.delete(id) : state.favs.add(id); saveFavs(); render(); }

function setupCatalog(meta) {
  $("#sizes").innerHTML = (meta.sizes || []).map((b) => `<button data-size="${esc(b)}">${esc(b)}</button>`).join("");
  $("#categoryList").innerHTML = `<button class="active" data-category=""><span>全部款式</span><b>${meta.total || 0}</b></button>` + (meta.categories || []).map(({ name, count }) => `<button data-category="${esc(name)}"><span>${esc(name)}</span><b>${count}</b></button>`).join("");
}

$("#searchBtn").onclick = search; $("#q").onkeydown = (e) => { if (e.key === "Enter") search(); };
$("#examples").onclick = (e) => { const b = e.target.closest("[data-q]"); if (b) { $("#q").value = b.dataset.q; search(); } };
$("#sizes").onclick = (e) => { const b = e.target.closest("[data-size]"); if (!b) return; state.sizes.has(b.dataset.size) ? state.sizes.delete(b.dataset.size) : state.sizes.add(b.dataset.size); b.classList.toggle("active"); search(); };
$("#categoryList").onclick = (e) => { const b = e.target.closest("[data-category]"); if (!b) return; state.category = b.dataset.category; document.querySelectorAll("[data-category]").forEach((x) => x.classList.toggle("active", x === b)); search(); };
$("#grid").onclick = (e) => { const fav = e.target.closest("[data-fav]"); if (fav) { e.stopPropagation(); toggleFav(fav.dataset.fav); return; } const el = e.target.closest("[data-id]"); const cake = state.results.find((c) => c.id === el?.dataset.id); if (cake) openDetail(cake); };
$("#grid").onkeydown = (e) => { if (e.key === "Enter") e.target.closest("[data-id]")?.click(); };
$("#favToggle").onclick = (e) => { state.showFavOnly = !state.showFavOnly; e.currentTarget.classList.toggle("active", state.showFavOnly); e.currentTarget.setAttribute("aria-pressed", state.showFavOnly); render(); };
$("#sortBy").onchange = render; ["priceMin", "priceMax", "occasionFilter", "targetFilter"].forEach((id) => $("#" + id).onchange = search);
$("#resetBtn").onclick = () => { state.sizes.clear(); state.category = ""; ["q", "priceMin", "priceMax", "occasionFilter", "targetFilter"].forEach((id) => $("#" + id).value = ""); document.querySelectorAll(".size-row button").forEach((b) => b.classList.remove("active")); document.querySelectorAll("[data-category]").forEach((b) => b.classList.toggle("active", !b.dataset.category)); search(); };
document.querySelectorAll("[data-close]").forEach((el) => el.onclick = closeDetail); document.onkeydown = (e) => { if (e.key === "Escape") closeDetail(); };

(async () => {
  saveFavs();
  try {
    const meta = await fetch("/api/semantic-search", { cache: "force-cache" }).then((r) => {
      if (!r.ok) throw new Error("meta");
      return r.json();
    });
    setupCatalog(meta);
    await search();
  } catch {
    $("#status").textContent = "网络较慢，请点击搜索重试";
    $("#grid").innerHTML = "";
  }
})();
