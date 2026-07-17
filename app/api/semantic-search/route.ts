import cakes from "../../../public/data/cakes.json";

type Cake = (typeof cakes)[number] & { reason?: string };

const stop = new Set(["的", "了", "和", "要", "想", "一个", "适合", "一款", "以内", "左右"]);
function tokens(value: string) {
  const clean = String(value || "").toLowerCase().replace(/[^\u4e00-\u9fa5a-z0-9]+/g, "");
  const out = new Set<string>();
  for (let i = 0; i < clean.length - 1; i++) out.add(clean.slice(i, i + 2));
  for (const word of String(value || "").toLowerCase().match(/[a-z0-9]+/g) || []) if (word.length > 1) out.add(word);
  return out;
}

function score(query: Set<string>, cake: Cake) {
  const text = cake.searchText || [cake.desc, cake.suit].join(" ");
  const hay = tokens(text); let result = 0;
  for (const token of query) if (!stop.has(token)) result += hay.has(token) ? 1 : (text.includes(token) ? .55 : 0);
  return result;
}

export async function GET() {
  const categoryCounts = new Map<string, number>();
  const sizes = new Set<string>();
  for (const cake of cakes as Cake[]) {
    categoryCounts.set(cake.category, (categoryCounts.get(cake.category) || 0) + 1);
    if (cake.sizeBucket) sizes.add(cake.sizeBucket);
  }
  const categories = [...categoryCounts]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));
  return Response.json(
    { total: cakes.length, sizes: [...sizes].sort(), categories },
    { headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" } },
  );
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const query = String(body.query || "").trim().slice(0, 300);
  const min = Number(body.priceMin); const max = Number(body.priceMax);
  const sizes = Array.isArray(body.sizes) ? body.sizes : [];
  const occasion = String(body.occasion || ""); const target = String(body.target || "");
  const category = String(body.category || "");
  let pool = (cakes as Cake[]).filter((cake) => {
    if (Number.isFinite(min) && body.priceMin !== undefined && cake.price < min) return false;
    if (Number.isFinite(max) && body.priceMax !== undefined && cake.price > max) return false;
    if (sizes.length && !sizes.includes(cake.sizeBucket)) return false;
    if (occasion && !cake.occasions.some((x) => x.includes(occasion))) return false;
    if (target && !cake.targets.some((x) => x.includes(target))) return false;
    if (category && cake.category !== category) return false;
    return true;
  });

  if (!query) {
    const results = pool.slice().sort((a, b) => a.price - b.price).slice(0, 60);
    return Response.json({ provider: "filter", total: pool.length, summary: `按筛选找到 ${pool.length} 款，展示 ${results.length} 款。`, results });
  }
  const queryTokens = tokens(query);
  const ranked = pool.map((cake) => ({ cake, score: score(queryTokens, cake) })).sort((a, b) => b.score - a.score);
  const matched = ranked.some((x) => x.score > 0) ? ranked.filter((x) => x.score > 0) : ranked;
  const results = matched.slice(0, 40).map(({ cake }) => cake);
  return Response.json({ provider: "smart", total: matched.length, summary: `根据完整标签匹配到 ${matched.length} 款，展示 ${results.length} 款。`, results });
}
