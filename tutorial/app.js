/* ==========================================================================
   nanochat interactive tutorial — behaviour
   Vanilla JS only. No build step, no network, no external dependencies.
   ========================================================================== */
(function () {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const fmt = (x, n = 2) => Number(x).toFixed(n);
  const fmtK = (x) => x >= 1000 ? (x / 1000).toFixed(1) + "k" : String(x);

  /* ----------------------------------------------------------------------
     deterministic pseudo-randomness (so reloads are not chaotic)
     ---------------------------------------------------------------------- */
  function hash32(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function randn(rng) {
    let u = 0, v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /* ----------------------------------------------------------------------
     colors
     ---------------------------------------------------------------------- */
  function heatColor(v, max = 1) {
    const a = clamp(0.07 + 0.82 * Math.min(1, Math.abs(v) / (max || 1)), 0.07, 0.9);
    return v >= 0 ? `rgba(255, 180, 84, ${a})` : `rgba(125, 211, 252, ${a})`;
  }
  function weightColor(w) {
    return `rgba(94, 234, 212, ${clamp(0.05 + 0.86 * w, 0.05, 0.93)})`;
  }
  function vectorGrid(el, vec, opts = {}) {
    if (!el) return;
    const max = opts.max || 1.4;
    el.style.gridTemplateColumns = `repeat(${vec.length}, minmax(0, 1fr))`;
    el.innerHTML = vec.map((v, i) =>
      `<div class="vector-cell" style="background:${heatColor(v, max)}" title="dim ${i}: ${fmt(v, 3)}">${fmt(v, 1)}</div>`
    ).join("");
  }

  /* ----------------------------------------------------------------------
     code drawer
     ---------------------------------------------------------------------- */
  let drawerOpen = false;
  let lastFocused = null;
  let currentSnippet = null;

  function highlightLine(line) {
    let out = "", i = 0;
    while (i < line.length) {
      const ch = line[i];
      if (ch === "#") {
        out += `<span class="cm">${esc(line.slice(i))}</span>`;
        break;
      }
      if (ch === '"' || ch === "'") {
        const q = ch;
        const triple = line.slice(i, i + 3) === q + q + q;
        let j = i + (triple ? 3 : 1);
        while (j < line.length) {
          if (line[j] === "\\") { j += 2; continue; }
          if (triple ? line.slice(j, j + 3) === q + q + q : line[j] === q) {
            j += triple ? 3 : 1;
            break;
          }
          j++;
        }
        out += `<span class="st">${esc(line.slice(i, j))}</span>`;
        i = j;
        continue;
      }
      out += esc(ch);
      i++;
    }
    return out;
  }

  function openDrawer(id) {
    const data = (window.NANOCHAT_SNIPPETS || {})[id];
    if (!data) return;
    currentSnippet = data;
    lastFocused = document.activeElement;
    $("#drawerTitle").textContent = data.title || id;
    $("#drawerMeta").textContent = `${data.path} · lines ${data.start}–${data.end}`;
    const lines = data.code.split("\n");
    $("#drawerCode").innerHTML = lines.map((line, i) =>
      `<div class="code-line"><span class="ln">${data.start + i}</span><span class="lc">${highlightLine(line) || " "}</span></div>`
    ).join("");
    $("#drawerLink").href = "../" + data.path;
    $("#drawerLink").textContent = "打开原始文件 ↗";
    $("#drawer").classList.add("open");
    $("#drawer").setAttribute("aria-hidden", "false");
    $("#scrim").classList.add("open");
    document.body.classList.add("no-scroll");
    drawerOpen = true;
    setTimeout(() => $("#drawerClose") && $("#drawerClose").focus(), 260);
  }

  function closeDrawer() {
    if (!drawerOpen) return;
    $("#drawer").classList.remove("open");
    $("#drawer").setAttribute("aria-hidden", "true");
    $("#scrim").classList.remove("open");
    document.body.classList.remove("no-scroll");
    drawerOpen = false;
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  function initDrawer() {
    $$("[data-snippet]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        openDrawer(btn.dataset.snippet);
      });
    });
    $("#drawerClose").addEventListener("click", closeDrawer);
    $("#scrim").addEventListener("click", closeDrawer);
    $("#drawerCopy").addEventListener("click", async () => {
      const code = currentSnippet ? currentSnippet.code : $("#drawerCode").innerText;
      try {
        await navigator.clipboard.writeText(code);
        $("#drawerCopy").textContent = "已复制";
      } catch (e) {
        const ta = document.createElement("textarea");
        ta.value = code;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand("copy"); $("#drawerCopy").textContent = "已复制"; }
        catch (e2) { $("#drawerCopy").textContent = "复制失败"; }
        ta.remove();
      }
      setTimeout(() => { $("#drawerCopy").textContent = "复制"; }, 1200);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeDrawer();
    });
  }

  /* ----------------------------------------------------------------------
     navigation / reading progress
     ---------------------------------------------------------------------- */
  function initNav() {
    const links = $$(".nav-link");
    const sections = links.map((a) => $(a.getAttribute("href"))).filter(Boolean);
    const onScroll = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      const p = max > 0 ? clamp((window.scrollY / max) * 100, 0, 100) : 0;
      $("#progressBar").style.width = p + "%";

      const y = window.scrollY + 150;
      let current = sections[0];
      for (const s of sections) if (s.offsetTop <= y) current = s;
      if (current) {
        links.forEach((a) => a.classList.toggle("active", a.getAttribute("href") === "#" + current.id));
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    onScroll();

    $("#menuBtn").addEventListener("click", () => $("#sidebar").classList.toggle("open"));
    links.forEach((a) => a.addEventListener("click", () => {
      if (window.innerWidth <= 900) $("#sidebar").classList.remove("open");
    }));
    $$("[data-goto]").forEach((el) => el.addEventListener("click", () => {
      const target = $(el.dataset.goto);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    }));
  }

  /* ======================================================================
     LAB 01 — tokenizer
     ====================================================================== */
  const DEMO_SPECIALS = {
    "<|bos|>": 32759,
    "<|user_start|>": 32760,
    "<|user_end|>": 32761,
    "<|assistant_start|>": 32762,
    "<|assistant_end|>": 32763,
    "<|python_start|>": 32764,
    "<|python_end|>": 32765,
    "<|output_start|>": 32766,
    "<|output_end|>": 32767,
  };
  const DEMO_WORDS = {
    why: 1524, is: 318, the: 262, sky: 6766, blue: 4178, because: 780,
    hello: 31373, world: 995, natalia: 21231, sold: 6458, clips: 30290,
    cat: 3797, sat: 3332, on: 319, mat: 2603, to: 284, a: 257,
    capital: 3139, of: 286, france: 4202, paris: 6342, what: 644,
    answer: 3347, is: 318, no: 645, yes: 7566, and: 290,
  };
  const DEMO_PUNCT = { ".": 13, ",": 11, "?": 30, "!": 0, ":": 25, ";": 26, "(": 7, ")": 8, "'": 6 };

  function demoTokenize(text) {
    const tokens = [{ text: "<|bos|>", id: DEMO_SPECIALS["<|bos|>"], cls: "bos" }];
    const re = /(<\|[^>]+\|>)|([A-Za-z]+(?:'[A-Za-z]+)?)|(\d+)|([^\s])/g;
    let m;
    while ((m = re.exec(text))) {
      if (m[1]) {
        const name = m[1];
        tokens.push({ text: name, id: DEMO_SPECIALS[name] ?? 32759 + hash32(name) % 9, cls: name.includes("user") ? "user" : name.includes("assistant") ? "assistant" : name.includes("python") ? "tool" : "output" });
      } else if (m[2]) {
        const w = m[2];
        const low = w.toLowerCase();
        if (DEMO_WORDS[low] != null) {
          tokens.push({ text: w, id: DEMO_WORDS[low], cls: "" });
        } else if (w.length <= 5) {
          tokens.push({ text: w, id: 1000 + hash32(low) % 29000, cls: "" });
        } else {
          for (let i = 0; i < w.length; i += 4) {
            const part = w.slice(i, i + 4);
            tokens.push({ text: part, id: 1000 + hash32(part.toLowerCase()) % 29000, cls: "" });
          }
        }
      } else if (m[3]) {
        tokens.push({ text: m[3], id: 1000 + hash32(m[3]) % 29000, cls: "" });
      } else if (m[4]) {
        tokens.push({ text: m[4], id: DEMO_PUNCT[m[4]] ?? 1000 + hash32(m[4]) % 29000, cls: "" });
      }
    }
    return tokens;
  }

  function renderTokenizer() {
    const input = $("#tokenInput");
    if (!input) return;
    const text = input.value || "";
    const tokens = demoTokenize(text);
    const out = $("#tokenOutput");
    out.innerHTML = "";
    tokens.forEach((t) => {
      const el = document.createElement("span");
      el.className = "token " + (t.cls || "");
      el.title = `token id ${t.id}`;
      const txt = document.createElement("span");
      txt.textContent = t.text;
      const id = document.createElement("span");
      id.className = "id";
      id.textContent = String(t.id);
      el.append(txt, id);
      out.appendChild(el);
    });
    const chars = Math.max(1, text.length);
    $("#tokenSummary").textContent = `${tokens.length} tokens（含 BOS） · ${chars} chars · 约 ${fmt(chars / tokens.length, 2)} chars/token。普通 token 的 id 是示意值；特殊 token 的 id 与仓库一致（32759–32767）。`;
  }

  function initTokenizer() {
    if (!$("#tokenInput")) return;
    $("#tokenizeBtn").addEventListener("click", renderTokenizer);
    $("#tokenInput").addEventListener("keydown", (e) => { if (e.key === "Enter") renderTokenizer(); });
    $$(".sample-text").forEach((b) => b.addEventListener("click", () => {
      $("#tokenInput").value = b.textContent;
      renderTokenizer();
    }));
    renderTokenizer();
  }

  /* ======================================================================
     LAB 02 — embeddings / RMSNorm / smear
     ====================================================================== */
  const DEMO_TOKENS = ["The", "cat", "sat", "on", "the", "mat"];
  const DEMO_IDS = [464, 3797, 3332, 319, 262, 2603];
  const D_MODEL = 8;

  function makeEmbeddings(seed, n = DEMO_TOKENS.length, d = D_MODEL) {
    const rng = mulberry32(seed);
    return Array.from({ length: n }, () => Array.from({ length: d }, () => randn(rng) * 0.75));
  }
  function rmsNorm(v) {
    const ms = v.reduce((s, x) => s + x * x, 0) / v.length;
    const r = 1 / Math.sqrt(ms + 1e-6);
    return v.map((x) => x * r);
  }
  function dot(a, b) {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;
  }

  const embedState = { seed: 7, selected: 1, embeddings: null, normed: null };

  function buildEmbeddings() {
    embedState.embeddings = makeEmbeddings(embedState.seed);
    embedState.normed = embedState.embeddings.map(rmsNorm);
  }

  function renderEmbedding() {
    if (!$("#embedTokens")) return;
    const btnWrap = $("#embedTokens");
    if (!btnWrap.dataset.built) {
      btnWrap.innerHTML = DEMO_TOKENS.map((t, i) => `<button data-i="${i}" class="${i === embedState.selected ? "active" : ""}">${esc(t)}</button>`).join("");
      btnWrap.dataset.built = "1";
      btnWrap.addEventListener("click", (e) => {
        const b = e.target.closest("button[data-i]");
        if (!b) return;
        embedState.selected = Number(b.dataset.i);
        $$("button", btnWrap).forEach((x) => x.classList.toggle("active", x === b));
        renderEmbedding();
      });
    }
    const i = embedState.selected;
    const raw = embedState.embeddings[i];
    const normed = embedState.normed[i];
    vectorGrid($("#embedBefore"), raw, { max: 1.5 });
    vectorGrid($("#embedAfter"), normed, { max: 1.5 });

    const smearOn = $("#smearToggle").checked;
    const prev = i > 0 ? embedState.normed[i - 1] : null;
    const gate = 0.34;
    const smeared = normed.map((v, j) => prev ? v + gate * prev[j] : v);
    vectorGrid($("#embedSmear"), smearOn ? smeared : normed, { max: 2.0 });
    $("#embedNote").textContent = `token "${DEMO_TOKENS[i]}" · 示意 id ${DEMO_IDS[i]} · ${smearOn ? (i === 0 ? "第一个 token 没有前文，smear 不生效" : "已混入前一个 token 的 normed embedding（gate≈0.34）") : "未启用 smear"}`;
  }

  function initEmbedding() {
    if (!$("#embedBefore")) return;
    buildEmbeddings();
    $("#smearToggle").addEventListener("change", renderEmbedding);
    renderEmbedding();
  }

  /* ======================================================================
     LAB 03 — attention
     ====================================================================== */
  const D_HEAD = 4;
  const N_HEADS = 2;
  const WINDOW = 3;

  function makeMatrix(rows, cols, rng, scale = 0.65) {
    return Array.from({ length: rows }, () => Array.from({ length: cols }, () => randn(rng) * scale));
  }
  function matVec(M, v) {
    return M.map((row) => dot(row, v));
  }
  function applyRope(v, pos) {
    // Matches gpt.py: split the head into halves, rotate (i, i+d), and use
    // the -theta / transpose convention: y1=x1*cos+x2*sin, y2=-x1*sin+x2*cos.
    const out = v.slice();
    const d = v.length / 2;
    for (let i = 0; i < d; i++) {
      const theta = pos * Math.pow(100000, -2 * i / v.length);
      const c = Math.cos(theta), s = Math.sin(theta);
      out[i] = v[i] * c + v[i + d] * s;
      out[i + d] = -v[i] * s + v[i + d] * c;
    }
    return out;
  }
  function softmaxMasked(scores, allowed) {
    let max = -Infinity;
    for (let j = 0; j < scores.length; j++) if (allowed[j]) max = Math.max(max, scores[j]);
    if (!isFinite(max)) return scores.map(() => 0);
    const exps = scores.map((s, j) => allowed[j] ? Math.exp(s - max) : 0);
    const z = exps.reduce((a, b) => a + b, 0) || 1;
    return exps.map((e) => e / z);
  }

  const attnState = {
    seed: 11,
    head: 0,
    query: 5,
    stage: 0,
    causal: true,
    window: false,
    qkNorm: true,
    timer: null,
    data: null,
  };

  function buildAttention() {
    const rng = mulberry32(attnState.seed);
    const E = makeEmbeddings(attnState.seed + 3, DEMO_TOKENS.length, D_MODEL);
    const Wq = [], Wk = [], Wv = [];
    for (let h = 0; h < N_HEADS; h++) {
      Wq.push(makeMatrix(D_HEAD, D_MODEL, rng));
      Wk.push(makeMatrix(D_HEAD, D_MODEL, rng));
      Wv.push(makeMatrix(D_HEAD, D_MODEL, rng));
    }
    const Wo = makeMatrix(D_MODEL, D_MODEL, rng, 0.5);
    const q = [], k = [], v = [];
    for (let h = 0; h < N_HEADS; h++) {
      q[h] = []; k[h] = []; v[h] = [];
      for (let i = 0; i < DEMO_TOKENS.length; i++) {
        let qi = matVec(Wq[h], E[i]);
        let ki = matVec(Wk[h], E[i]);
        qi = applyRope(qi, i);
        ki = applyRope(ki, i);
        if (attnState.qkNorm) { qi = rmsNorm(qi); ki = rmsNorm(ki); }
        qi = qi.map((x) => x * 1.2);
        ki = ki.map((x) => x * 1.2);
        q[h].push(qi);
        k[h].push(ki);
        v[h].push(matVec(Wv[h], E[i]));
      }
    }
    const scores = [], allowed = [], weights = [];
    for (let h = 0; h < N_HEADS; h++) {
      scores[h] = []; weights[h] = []; allowed[h] = [];
      for (let i = 0; i < DEMO_TOKENS.length; i++) {
        scores[h][i] = []; allowed[h][i] = [];
        for (let j = 0; j < DEMO_TOKENS.length; j++) {
          scores[h][i][j] = dot(q[h][i], k[h][j]) / Math.sqrt(D_HEAD);
          allowed[h][i][j] = (!attnState.causal || j <= i) && (!attnState.window || (j <= i && j >= i - WINDOW + 1));
        }
        weights[h][i] = softmaxMasked(scores[h][i], allowed[h][i]);
      }
    }
    const out = [];
    for (let i = 0; i < DEMO_TOKENS.length; i++) {
      const concat = [];
      for (let h = 0; h < N_HEADS; h++) {
        const y = Array(D_HEAD).fill(0);
        for (let j = 0; j < DEMO_TOKENS.length; j++) {
          const w = weights[h][i][j];
          for (let d = 0; d < D_HEAD; d++) y[d] += w * v[h][j][d];
        }
        concat.push(...y);
      }
      out.push(matVec(Wo, concat));
    }
    attnState.data = { E, q, k, v, scores, allowed, weights, out };
    return attnState.data;
  }

  function tokenChip(text, cls = "", id = null) {
    const el = document.createElement("span");
    el.className = "token " + cls;
    const t = document.createElement("span");
    t.textContent = text;
    el.appendChild(t);
    if (id != null) {
      const i = document.createElement("span");
      i.className = "id";
      i.textContent = id;
      el.appendChild(i);
    }
    return el;
  }

  function renderAttnTokens() {
    const wrap = $("#attnTokens");
    wrap.innerHTML = "";
    DEMO_TOKENS.forEach((t, i) => {
      const el = tokenChip(t, i === attnState.query ? "selected" : "", DEMO_IDS[i]);
      el.addEventListener("click", () => { attnState.query = i; renderAttention(); });
      wrap.appendChild(el);
    });
  }

  function renderAttnQueryButtons() {
    const wrap = $("#attnQuery");
    wrap.innerHTML = DEMO_TOKENS.map((t, i) =>
      `<button data-q="${i}" class="${i === attnState.query ? "active" : ""}">${esc(t)}</button>`
    ).join("");
  }

  function matrixCell(v, cls = "", title = "") {
    return `<div class="matrix-cell ${cls}" title="${esc(title)}">${Number.isFinite(v) ? fmt(v, 1) : "×"}</div>`;
  }

  function renderAttnMatrix(el, mat, opts) {
    if (!el) return;
    const cols = mat[0].length;
    el.style.gridTemplateColumns = `repeat(${cols}, 34px)`;
    const flat = mat.flat();
    const maxAbs = Math.max(0.5, ...flat.filter(Number.isFinite).map(Math.abs));
    el.innerHTML = mat.map((row, r) => row.map((v, c) => {
      const masked = opts.masked && opts.masked[r][c];
      const cls = (masked ? "zero" : "") + (r === (opts.selectedRow ?? -1) ? " diag" : "");
      const title = masked ? `row ${r}, col ${c}: masked` : `row ${r}, col ${c} = ${fmt(v, 3)}`;
      return `<div class="matrix-cell ${cls}" data-row="${r}" data-col="${c}" style="background:${masked ? "" : heatColor(v, maxAbs)}" title="${esc(title)}">${masked ? "×" : fmt(v, 1)}</div>`;
    }).join("")).join("");
  }

  function renderSoftmax() {
    const d = attnState.data;
    if (!d) return;
    const h = attnState.head;
    const i = attnState.query;
    const w = d.weights[h][i];
    const allowed = d.allowed[h][i];
    const maxW = Math.max(...w);
    const wrap = $("#softmaxBars");
    wrap.innerHTML = "";
    for (let j = 0; j < DEMO_TOKENS.length; j++) {
      const row = document.createElement("div");
      row.className = "softmax-row" + (w[j] === maxW && maxW > 0 ? " best" : "");
      row.innerHTML = `<span class="lbl">${esc(DEMO_TOKENS[j])}</span><div class="bar-track"><div class="bar-fill" style="width:${(w[j] * 100).toFixed(1)}%"></div></div><span class="val">${allowed[j] ? fmt(w[j], 3) : "mask"}</span>`;
      wrap.appendChild(row);
    }
    $("#softmaxLabel").textContent = `softmax · query="${DEMO_TOKENS[i]}" · head H${h + 1}`;
  }

  const ATTN_NARRATIVE = [
    "① 先把 6 个 token 排成序列。每个 token 有一个 id；在真实模型里，id 会去 embedding table 里取一个 1536 维向量。",
    "② 对每个 token 做三个线性投影：Q（我在找什么）、K（我是什么）、V（我能提供什么）。这里为了能看清热图，只用了 8 维、2 个 head。",
    "③ Q/K 先加 RoPE、做 QK norm，再各乘 1.2。V 还可以加上 value embedding（真实模型里部分层会这样做）。",
    "④ 每个 query 和所有 key 做点积，除以 √d_head。点积越大，表示这个 key 和 query 越匹配。行是 query，列是 key。",
    "⑤ causal mask 把“未来”的 key 置为 −∞；滑窗再把太远的 key 置为 −∞。被 mask 的格子不会进入 softmax。",
    "⑥ softmax 把一行的分数变成和为 1 的权重。越匹配的 key 权重越大；权重不是“注意力概率”的玄学，就是归一化后的分数。",
    "⑦ 用权重对 V 做加权求和，得到这个 query 的输出；多个 head 拼起来，再过 c_proj 和残差。真实代码里这一步被融合进 Flash Attention / SDPA 的 kernel。",
  ];

  function attnStageLabel(stage) {
    return ["tokens", "embedding → Q/K/V", "Q/K/V", "scores", "mask", "softmax", "output"][stage] || "";
  }

  function renderAttention() {
    if (!$("#attnTokens")) return;
    if (!attnState.data) buildAttention();
    renderAttnTokens();
    renderAttnQueryButtons();
    const d = attnState.data;
    const h = attnState.head;
    const q = d.q[h], k = d.k[h], v = d.v[h];
    renderAttnMatrix($("#qMatrix"), q, { selectedRow: attnState.query });
    renderAttnMatrix($("#kMatrix"), k, { selectedRow: attnState.query });
    renderAttnMatrix($("#vMatrix"), v, { selectedRow: attnState.query });
    renderAttnMatrix($("#scoreMatrix"), d.scores[h], {
      selectedRow: attnState.query,
      masked: d.allowed[h].map((row) => row.map((x) => !x)),
    });
    renderSoftmax();
    vectorGrid($("#attnOutput"), d.out[attnState.query], { max: 1.5 });

    $$("#attnHead button").forEach((b) => b.classList.toggle("active", Number(b.dataset.head) === h));
    $$("#attnSteps button").forEach((b) => {
      const s = Number(b.dataset.step);
      b.classList.toggle("active", s === attnState.stage);
      b.classList.toggle("done", s < attnState.stage);
    });
    $("#attnStageLabel").textContent = `当前：${attnStageLabel(attnState.stage)} · query = "${DEMO_TOKENS[attnState.query]}" · head H${h + 1}`;
    $("#attnNarrative").textContent = ATTN_NARRATIVE[attnState.stage];
    $("#attnWindowNote").textContent = attnState.window
      ? `causal: j ≤ i；window: 只看最近 ${WINDOW} 个 key（j ≥ i−${WINDOW - 1}）。当前 query 可见 ${d.allowed[h][attnState.query].filter(Boolean).length} 个 key。`
      : (attnState.causal ? "causal：每个 query 只能看自己和左边的 key。" : "未加 causal：所有 key 都可见（真实模型永远加 causal）。");
    $("#attnOutputNote").textContent = `每个 head 内部 y = Σ_j a_ij · v_j 是 4 维；面板显示的是 concat 两个 head 后再乘 W_o 的 8 维输出。真实代码随后做 c_proj + 残差。`;
    $("#attnShapes").textContent = `x [6, 8] → q/k/v [6, 4] per head\nheads=${N_HEADS} · head_dim=${D_HEAD}\nconcat → [6, 8] → c_proj [8, 8]`;
    const liveMap = { 1: "qkvPanel", 2: "qkvPanel", 3: "scorePanel", 4: "scorePanel", 5: "scorePanel", 6: "outputPanel" };
    ["qkvPanel", "scorePanel", "outputPanel"].forEach((id) => {
      const el = $("#" + id);
      el.classList.toggle("is-dim", attnState.stage === 0 || liveMap[attnState.stage] !== id);
      el.classList.toggle("is-live", liveMap[attnState.stage] === id);
    });
    const play = $("#attnPlay");
    play.textContent = attnState.timer ? "暂停" : "▶ 播放";
  }

  function stopAttnPlay() {
    if (attnState.timer) clearInterval(attnState.timer);
    attnState.timer = null;
    const play = $("#attnPlay");
    if (play) play.textContent = "▶ 播放";
  }

  function initAttention() {
    if (!$("#attnTokens")) return;
    buildAttention();
    renderAttention();
    $("#attnHead").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-head]");
      if (!b) return;
      attnState.head = Number(b.dataset.head);
      renderAttention();
    });
    $("#attnQuery").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-q]");
      if (!b) return;
      attnState.query = Number(b.dataset.q);
      renderAttention();
    });
    $("#attnSteps").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-step]");
      if (!b) return;
      attnState.stage = Number(b.dataset.step);
      renderAttention();
    });
    $("#scoreMatrix").addEventListener("click", (e) => {
      const cell = e.target.closest("[data-row]");
      if (!cell) return;
      attnState.query = Number(cell.dataset.row);
      renderAttention();
    });
    $("#attnCausal").addEventListener("change", (e) => { attnState.causal = e.target.checked; buildAttention(); renderAttention(); });
    $("#attnWindow").addEventListener("change", (e) => { attnState.window = e.target.checked; buildAttention(); renderAttention(); });
    $("#attnQKNorm").addEventListener("change", (e) => { attnState.qkNorm = e.target.checked; buildAttention(); renderAttention(); });
    $("#attnPlay").addEventListener("click", () => {
      if (attnState.timer) { stopAttnPlay(); return; }
      if (attnState.stage >= 6) attnState.stage = 0;
      attnState.timer = setInterval(() => {
        if (attnState.stage >= 6) { stopAttnPlay(); return; }
        attnState.stage++;
        renderAttention();
      }, 900);
      renderAttention();
    });
    $("#attnReset").addEventListener("click", () => {
      stopAttnPlay();
      attnState.seed = Math.floor(Math.random() * 1e9);
      attnState.query = 5;
      attnState.stage = 0;
      buildAttention();
      renderAttention();
    });
  }

  /* ======================================================================
     LAB 04 — layers / sliding windows
     ====================================================================== */
  const WINDOW_PATTERN = "SSSL";
  const LAYER_COUNT = 8;
  const LAYER_KEYS = 16;

  function layerWindow(layer) {
    const ch = WINDOW_PATTERN[layer % WINDOW_PATTERN.length];
    return (layer === LAYER_COUNT - 1 || ch === "L") ? LAYER_KEYS : Math.round(LAYER_KEYS / 4);
  }

  function initLayerLab() {
    const wrap = $("#layerGrid");
    if (!wrap) return;
    const slider = $("#layerSlider");
    const selected = Number(slider.value);
    wrap.innerHTML = "";
    for (let layer = 0; layer < LAYER_COUNT; layer++) {
      const win = layerWindow(layer);
      const row = document.createElement("div");
      row.className = "layer-row" + (layer === selected ? " selected" : "");
      row.dataset.layer = layer;
      const badge = document.createElement("span");
      badge.className = "layer-badge";
      badge.textContent = `L${layer} ${win === LAYER_KEYS ? "L" : "S"}`;
      const cells = document.createElement("div");
      cells.className = "layer-cells";
      for (let pos = 0; pos < LAYER_KEYS; pos++) {
        const c = document.createElement("span");
        c.className = "layer-cell" + (pos >= LAYER_KEYS - win ? " visible" : "");
        c.title = `position ${pos}${pos >= LAYER_KEYS - win ? " visible" : " outside window"}`;
        cells.appendChild(c);
      }
      row.append(badge, cells);
      wrap.appendChild(row);
    }
    const update = () => {
      const layer = Number(slider.value);
      const win = layerWindow(layer);
      $$(".layer-row", wrap).forEach((r) => r.classList.toggle("selected", Number(r.dataset.layer) === layer));
      $("#layerReadout").textContent = `layer ${layer} · ${win === LAYER_KEYS ? "L" : "S"} · window ${win === LAYER_KEYS ? LAYER_KEYS : win}`;
      $("#layerNote").textContent = layer === LAYER_COUNT - 1
        ? "最后一层强制 full context：它可以汇总前面层逐步传过来的远程信息。"
        : (win === LAYER_KEYS ? "这一层是 L：可以看完整 16 个 key（真实是 2048）。" : `这一层是 S：lab 只看最近 ${win} 个 key（含当前）；真实 left=512，约 513 个 key。`);
    };
    slider.addEventListener("input", update);
    update();
  }

  /* ======================================================================
     LAB 06b — best-fit packing
     ====================================================================== */
  const PACK_CAP = 24;
  const PACK_COLORS = ["#ffb454", "#5eead4", "#c084fc", "#7dd3fc", "#f472b6", "#86efac", "#fde68a"];
  const PACK_DOC_LENGTHS = [11, 9, 7, 5, 3];
  const packState = { docs: [], used: [], cells: [] };

  function packReset() {
    packState.docs = PACK_DOC_LENGTHS.map((len, i) => ({ len, color: PACK_COLORS[i % PACK_COLORS.length], id: i }));
    packState.used = new Set();
    packState.cells = Array(PACK_CAP).fill(null);
    renderPack();
  }

  function packNext() {
    if (packState.cells.some(Boolean)) packReset();
    let pos = 0;
    const row = Array(PACK_CAP).fill(null);
    let cropped = 0;
    let guard = 0;
    while (pos < PACK_CAP && guard++ < 100) {
      const candidates = packState.docs
        .map((d, i) => ({ d, i }))
        .filter(({ d, i }) => !packState.used.has(i) && d.len <= PACK_CAP - pos)
        .sort((a, b) => b.d.len - a.d.len);
      if (candidates.length) {
        const { d, i } = candidates[0];
        packState.used.add(i);
        for (let k = 0; k < d.len; k++) row[pos + k] = { doc: d, first: k === 0, crop: false };
        pos += d.len;
      } else {
        const remaining = PACK_CAP - pos;
        const avail = packState.docs.map((d, i) => ({ d, i })).filter(({ i }) => !packState.used.has(i)).sort((a, b) => a.d.len - b.d.len);
        if (!avail.length) break;
        const { d, i } = avail[0];
        packState.used.add(i);
        cropped += d.len - remaining;
        for (let k = 0; k < remaining; k++) row[pos + k] = { doc: d, first: k === 0, crop: k === remaining - 1 };
        pos += remaining;
      }
    }
    packState.cells = row;
    renderPack(cropped);
  }

  function renderPack(cropped = 0) {
    const row = $("#packRow");
    const docs = $("#packDocs");
    if (!row) return;
    row.innerHTML = "";
    packState.cells.forEach((cell, i) => {
      const el = document.createElement("div");
      el.className = "pack-cell" + (cell ? " filled" : "") + (cell && cell.first ? " bos" : "") + (cell && cell.crop ? " crop" : "");
      if (cell) {
        el.style.background = cell.doc.color + "55";
        el.style.boxShadow = cell.crop ? "inset 0 0 0 1px #fca5a5" : "";
        el.textContent = cell.first ? "B" : "·";
        el.title = `doc ${cell.doc.id + 1}${cell.first ? " · BOS" : ""}${cell.crop ? " · cropped here" : ""}`;
      } else {
        el.textContent = "";
      }
      row.appendChild(el);
    });
    docs.innerHTML = "";
    packState.docs.forEach((d, i) => {
      const el = document.createElement("span");
      el.className = "pack-doc" + (packState.used.has(i) ? " used" : "");
      el.style.borderColor = d.color + "66";
      el.textContent = `doc ${i + 1} · ${d.len} tok`;
      docs.appendChild(el);
    });
    const filled = packState.cells.filter(Boolean).length;
    const util = Math.round((filled / PACK_CAP) * 100);
    $("#packStats").textContent = `utilization ${util}% · ${filled}/${PACK_CAP} cells · ${cropped} token${cropped === 1 ? "" : "s"} discarded`;
  }

  function initPacking() {
    if (!$("#packRow")) return;
    packReset();
    $("#packNext").addEventListener("click", packNext);
    $("#packReset").addEventListener("click", packReset);
  }

  /* ======================================================================
     LAB 06 — training step + loss curve
     ====================================================================== */
  const TRAIN_STEPS = [
    "DataLoader 给出 x/y：x 是 token id，y 是右移一位的下一个 token。每行 2048 token，多个 micro-batch 拼成全局 batch。",
    "forward：embedding → 24 个 block → lm_head，得到每个位置 32768 个 logits。",
    "交叉熵：把目标 token 的 logit 做 softmax，取 −log p。所有有效位置取平均。",
    "backward：从 loss 反传到每个参数，得到梯度；grad accumulation 把多个 micro-batch 的梯度加起来。",
    "Muon 更新 2D 矩阵，AdamW 更新 embedding/lm_head/标量；LR 和 momentum 按 step 调度。",
    "下一个 step：重复。验证时用 bits-per-byte 和 CORE 判断模型是否真的变强。",
  ];
  const TRAIN_LOSS = [2.28, 1.76, 1.31, 1.04, 0.88, 0.79];
  const trainState = { idx: 0, timer: null, points: [] };

  function initTrainCurve() {
    const rng = mulberry32(42);
    for (let i = 0; i < 90; i++) {
      const p = i / 89;
      const base = 0.74 + 1.56 * Math.pow(1 - p, 2.2);
      trainState.points.push(base + (rng() - 0.5) * 0.035);
    }
  }

  function drawLoss() {
    const canvas = $("#lossCanvas");
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 520;
    const cssH = 150;
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = cssW, H = cssH, pad = { l: 30, r: 8, t: 8, b: 18 };
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(148,163,184,.16)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + (i / 4) * (H - pad.t - pad.b);
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
    }
    const pts = trainState.points;
    const min = 0.7, max = 2.4;
    const X = (i) => pad.l + (i / (pts.length - 1)) * (W - pad.l - pad.r);
    const Y = (v) => pad.t + (1 - (v - min) / (max - min)) * (H - pad.t - pad.b);
    ctx.beginPath();
    pts.forEach((v, i) => { if (i === 0) ctx.moveTo(X(i), Y(v)); else ctx.lineTo(X(i), Y(v)); });
    ctx.strokeStyle = "#5eead4";
    ctx.lineWidth = 1.6;
    ctx.stroke();
    const idx = Math.min(pts.length - 1, Math.round((trainState.idx / (TRAIN_STEPS.length - 1)) * (pts.length - 1)));
    ctx.lineTo(X(idx), Y(pts[idx]));
    ctx.fillStyle = "#ffb454";
    ctx.beginPath();
    ctx.arc(X(idx), Y(pts[idx]), 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(159,176,207,.78)";
    ctx.font = "10px ui-monospace, monospace";
    ctx.fillText("loss", 4, 12);
    ctx.fillText(fmt(pts[idx], 2), 4, H - 4);
  }

  function renderTrain() {
    if (!$("#trainPipeline")) return;
    $$("#trainPipeline .pipe-node").forEach((el) => el.classList.toggle("active", Number(el.dataset.trainStep) === trainState.idx));
    $("#trainStepLabel").textContent = `phase ${trainState.idx + 1}/${TRAIN_STEPS.length}`;
    $("#trainNarrative").textContent = TRAIN_STEPS[trainState.idx];
    $("#trainLossReadout").textContent = fmt(TRAIN_LOSS[trainState.idx], 2);
    drawLoss();
    $("#trainPlay").textContent = trainState.timer ? "暂停" : "▶ 播放";
  }

  function initTrain() {
    if (!$("#trainPipeline")) return;
    initTrainCurve();
    renderTrain();
    $("#trainPlay").addEventListener("click", () => {
      if (trainState.timer) {
        clearInterval(trainState.timer); trainState.timer = null; renderTrain(); return;
      }
      if (trainState.idx >= TRAIN_STEPS.length - 1) trainState.idx = 0;
      trainState.timer = setInterval(() => {
        if (trainState.idx >= TRAIN_STEPS.length - 1) {
          clearInterval(trainState.timer); trainState.timer = null; renderTrain(); return;
        }
        trainState.idx++;
        renderTrain();
      }, 1050);
      renderTrain();
    });
    $("#trainReset").addEventListener("click", () => {
      clearInterval(trainState.timer); trainState.timer = null; trainState.idx = 0; renderTrain();
    });
    $("#trainPipeline").addEventListener("click", (e) => {
      const node = e.target.closest("[data-train-step]");
      if (!node) return;
      trainState.idx = Number(node.dataset.trainStep);
      renderTrain();
    });
    window.addEventListener("resize", drawLoss);
  }

  /* ======================================================================
     LAB 07 — SFT tokens + mask
     ====================================================================== */
  const SFT_DATA = {
    simple: [
      { role: "user", text: "What is the capital of France?" },
      { role: "assistant", text: "Paris." },
    ],
    tool: [
      { role: "user", text: "Natalia sold 48 clips. She sold half as many on Tuesday. How many in total?" },
      { role: "assistant", parts: [
        { type: "text", text: "Monday: 48. Tuesday: 24. Total: " },
        { type: "python", text: "48 + 24" },
        { type: "python_output", text: "72" },
        { type: "text", text: " #### 72" },
      ] },
    ],
  };
  const sftState = { mode: "simple" };

  function words(text) {
    return text.match(/[A-Za-z0-9']+|[^\s]/g) || [];
  }

  function sftToken(text, kind, mask, special = false) {
    const el = document.createElement("span");
    el.className = "token " + kind + (special ? " special" : "");
    const t = document.createElement("span");
    t.textContent = text;
    el.appendChild(t);
    if (!special) {
      const m = document.createElement("span");
      m.className = "mini-label";
      m.textContent = mask ? "mask 1" : "mask 0";
      el.appendChild(m);
    }
    el.dataset.mask = String(mask);
    el.title = `${special ? "special token" : "token"} · loss mask ${mask}`;
    return el;
  }

  function pushWords(wrap, text, kind, mask) {
    words(text).forEach((w) => wrap.appendChild(sftToken(w, kind, mask)));
  }

  function renderSft() {
    const wrap = $("#sftTokens");
    if (!wrap) return;
    wrap.innerHTML = "";
    const msgs = SFT_DATA[sftState.mode];
    wrap.appendChild(sftToken("<|bos|>", "bos", 0, true));
    msgs.forEach((msg) => {
      if (msg.role === "user") {
        wrap.appendChild(sftToken("<|user_start|>", "user", 0, true));
        pushWords(wrap, msg.text, "user", 0);
        wrap.appendChild(sftToken("<|user_end|>", "user", 0, true));
      } else {
        wrap.appendChild(sftToken("<|assistant_start|>", "assistant", 0, true));
        if (msg.text) {
          pushWords(wrap, msg.text, "assistant", 1);
        } else {
          msg.parts.forEach((part) => {
            if (part.type === "text") {
              pushWords(wrap, part.text, "assistant", 1);
            } else if (part.type === "python") {
              wrap.appendChild(sftToken("<|python_start|>", "tool", 1, true));
              pushWords(wrap, part.text, "tool", 1);
              wrap.appendChild(sftToken("<|python_end|>", "tool", 1, true));
            } else if (part.type === "python_output") {
              wrap.appendChild(sftToken("<|output_start|>", "output", 0, true));
              pushWords(wrap, part.text, "output", 0);
              wrap.appendChild(sftToken("<|output_end|>", "output", 0, true));
            }
          });
        }
        wrap.appendChild(sftToken("<|assistant_end|>", "assistant", 1, true));
      }
    });
    const chips = $$(".token", wrap);
    const show = $("#sftMaskToggle").checked;
    let supervised = 0;
    chips.forEach((el) => {
      const mask = Number(el.dataset.mask);
      if (mask === 1) supervised++;
      el.classList.toggle("supervised", show && mask === 1);
      el.classList.toggle("masked", show && mask === 0);
    });
    $("#sftStats").textContent = `${chips.length} tokens · ${supervised} supervised (${Math.round(supervised / chips.length * 100)}%) · ${chips.length - supervised} masked`;
  }

  function initSft() {
    if (!$("#sftTokens")) return;
    $("#sftMode").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-mode]");
      if (!b) return;
      sftState.mode = b.dataset.mode;
      $$("#sftMode button").forEach((x) => x.classList.toggle("active", x === b));
      renderSft();
    });
    $("#sftMaskToggle").addEventListener("change", renderSft);
    renderSft();
  }

  /* ======================================================================
     LAB 08 — RL rollouts
     ====================================================================== */
  const rlState = { seed: 5, rewards: [], advantages: [] };

  function sampleRl() {
    const rng = mulberry32(rlState.seed);
    const wrongAnswers = ["70", "68", "74", "66"];
    rlState.rewards = [];
    rlState.answers = [];
    for (let i = 0; i < 16; i++) {
      const correct = rng() < 0.42;
      const answer = correct ? "72" : wrongAnswers[(i + 1) % wrongAnswers.length];
      rlState.answers.push(answer);
      rlState.rewards.push(correct ? 1 : 0);
    }
    const mean = rlState.rewards.reduce((a, b) => a + b, 0) / 16;
    rlState.mean = mean;
    rlState.advantages = rlState.rewards.map((r) => r - mean);
  }

  function renderRl() {
    const grid = $("#rlRollouts");
    if (!grid) return;
    grid.innerHTML = "";
    rlState.rewards.forEach((r, i) => {
      const el = document.createElement("div");
      el.className = "rollout " + (r ? "correct" : "wrong");
      el.innerHTML = `<div class="rid">rollout ${i + 1}</div><div class="ans">answer: ${rlState.answers[i]}</div><div class="rw">reward ${r}</div>`;
      grid.appendChild(el);
    });
    $("#rlMean").textContent = `mean reward = ${fmt(rlState.mean, 3)}`;
    const maxAbs = Math.max(0.001, ...rlState.advantages.map(Math.abs));
    const bars = $("#rlAdvBars");
    bars.innerHTML = "";
    rlState.advantages.forEach((adv, i) => {
      const row = document.createElement("div");
      row.className = "adv-row";
      const width = Math.abs(adv) / maxAbs * 50;
      const left = adv >= 0 ? 50 : 50 - width;
      row.innerHTML = `<span class="al">r${i + 1}</span><div class="adv-track"><span class="adv-zero"></span><span class="adv-fill" style="left:${left}%;width:${width}%;background:${adv >= 0 ? "var(--teal)" : "var(--red)"}"></span></div><span class="av">${fmt(adv, 2)}</span>`;
      bars.appendChild(row);
    });
  }

  function initRl() {
    if (!$("#rlRollouts")) return;
    sampleRl();
    renderRl();
    $("#rlSample").addEventListener("click", () => {
      rlState.seed = Math.floor(Math.random() * 1e9);
      sampleRl();
      renderRl();
    });
  }

  /* ======================================================================
     LAB 09 — KV cache / decode
     ====================================================================== */
  const INFER_PROMPT = ["The", "cat", "sat", "on", "the", "mat"];
  const INFER_TOKENS = INFER_PROMPT.concat(["new", "new", "new", "new"]);
  const INFER_TOTAL = INFER_TOKENS.length;
  const INFER_WINDOW = 4;
  const inferState = { step: 0, timer: null };

  function inferCurrent() {
    if (inferState.step === 0) return { q: 5, end: 5 };
    return { q: 5 + inferState.step, end: 5 + inferState.step };
  }

  function renderInfer() {
    const grid = $("#kvGrid");
    if (!grid) return;
    const { q, end } = inferCurrent();
    const start = $("#inferWindow").checked ? Math.max(0, q - INFER_WINDOW + 1) : 0;
    grid.style.setProperty("--steps", INFER_TOTAL);
    grid.innerHTML = "";
    const corner = document.createElement("div");
    corner.className = "kv-label";
    corner.textContent = "position";
    grid.appendChild(corner);
    for (let p = 0; p < INFER_TOTAL; p++) {
      const h = document.createElement("div");
      h.className = "kv-head";
      h.textContent = String(p);
      grid.appendChild(h);
    }
    const rows = ["cache", "read", "query"];
    rows.forEach((rowName) => {
      const label = document.createElement("div");
      label.className = "kv-label";
      label.textContent = rowName;
      grid.appendChild(label);
      for (let p = 0; p < INFER_TOTAL; p++) {
        const cell = document.createElement("div");
        cell.className = "kv-cell";
        const written = p <= end;
        const inRead = p >= start && p <= q;
        if (rowName === "cache") {
          cell.classList.toggle("written", written);
          cell.textContent = written ? (p < INFER_PROMPT.length ? INFER_PROMPT[p] : "new") : "·";
        } else if (rowName === "read") {
          cell.classList.toggle("read", inRead && written);
          cell.classList.toggle("faded", !inRead || !written);
          cell.textContent = inRead && written ? "K/V" : "·";
        } else {
          cell.classList.toggle("read", p === q);
          cell.textContent = p === q ? "Q" : "·";
        }
        grid.appendChild(cell);
      }
    });
    const phase = inferState.step === 0 ? "prefill" : `decode ${inferState.step}/4`;
    $("#inferStep").textContent = phase;
    $("#inferNarrative").innerHTML = inferState.step === 0
      ? `prefill：6 个 prompt token 一次性并行计算，K/V 写入位置 0–5。TTFT 就是这一段 + 首次采样。`
      : `decode ${inferState.step}：只把新 token 的 Q/K/V 送进模型；Q 读取位置 ${start}–${q} 的 K/V，采样下一个 token。`;
    const kvStore = 24 * 2 * 12 * 128 * 2; // bytes/token across all layers
    const perKeyBytes = 2 * 12 * 128 * 2;  // K+V for one token, one layer
    const ctx = q + 1;
    // d24 uses SSSL tiled over 24 layers: 18 short (512) + 6 long (2048).
    const sslKeys = 18 * Math.min(ctx, 512) + 6 * Math.min(ctx, 2048);
    const labKeys = 24 * Math.min(ctx, 4);
    const readKeys = $("#inferWindow").checked ? labKeys : sslKeys;
    const read = perKeyBytes * readKeys;
    const at2048 = perKeyBytes * (18 * 512 + 6 * 2048);
    const at2048Full = perKeyBytes * (24 * 2048);
    $("#inferReadout").innerHTML = `d24 · bf16：store ${fmt(kvStore / 1024, 0)} KB/token<br>当前 context ${ctx} · read ${fmt(read / 1024, 0)} KB/row/step${$("#inferWindow").checked ? "（lab：每层只读 4 个 key）" : "（SSSL）"}<br>在 2048 context：SSSL ${fmt(at2048 / 1048576, 0)} MB vs full ${fmt(at2048Full / 1048576, 0)} MB per row/step`;
    $("#prefillBar").style.width = "82%";
    $("#decodeBar").style.width = inferState.step === 0 ? "18%" : `${30 + inferState.step * 4}%`;
    $("#inferPlay").textContent = inferState.timer ? "暂停" : "▶ 播放";
  }

  function initInfer() {
    if (!$("#kvGrid")) return;
    renderInfer();
    $("#inferWindow").addEventListener("change", renderInfer);
    $("#inferPlay").addEventListener("click", () => {
      if (inferState.timer) {
        clearInterval(inferState.timer); inferState.timer = null; renderInfer(); return;
      }
      if (inferState.step >= 4) inferState.step = 0;
      inferState.timer = setInterval(() => {
        if (inferState.step >= 4) {
          clearInterval(inferState.timer); inferState.timer = null; renderInfer(); return;
        }
        inferState.step++;
        renderInfer();
      }, 1000);
      renderInfer();
    });
    $("#inferReset").addEventListener("click", () => {
      clearInterval(inferState.timer); inferState.timer = null; inferState.step = 0; renderInfer();
    });
  }

  /* ======================================================================
     block diagram hover info
     ====================================================================== */
  const BLOCK_INFO = {
    norm: "pre-norm RMSNorm：先把输入归一化，再进 attention；残差主干保持恒等路径。",
    attn: "CausalSelfAttention：Q/K/V 投影、RoPE、QK norm、causal + sliding-window attention。",
    resid1: "x = x + attn(norm(x))：attention 只学“增量”，残差负责把原信息带过去。",
    x0: "每层残差先做 resid_lambdas[i]·x + x0_lambdas[i]·x0；x0 是最初的 embedding，帮助浅层信息直达。",
    ve: "某些层有 value_embeds：把 token 的另一个 embedding 用 gate 加到 V 上（ResFormer 风格）。",
    attn2: "Attention 的 mask 由 causal + window_pattern 决定；最后一层永远是 full context。",
    norm2: "MLP 前再做一次 RMSNorm。",
    mlp: "MLP: Linear(4×) → ReLU² → Linear；没有 bias，没有 dropout。",
    resid2: "x = x + mlp(norm(x))：第二个残差。",
    backout: "在最终 logits 前减掉中间层残差，去掉低层特征，缓解表示冗余。",
    finalnorm: "最终 RMSNorm，然后 lm_head。",
    lmhead: "lm_head 把 d_model 投到 32768 维 logits；vocab padding 到 64 的倍数，forward 后裁掉。",
    softcap: "logits = 15·tanh(logits/15)，平滑地限制在 [-15, 15]，防止训练发散。",
    loss: "cross_entropy(logits, next_token)：所有有效位置取平均。",
  };

  function initBlock() {
    if (!$("#blockInfo")) return;
    const items = $$("[data-block]");
    const set = (key) => {
      items.forEach((el) => el.classList.toggle("active", el.dataset.block === key));
      $("#blockInfo").textContent = BLOCK_INFO[key] || "";
    };
    items.forEach((el) => {
      el.addEventListener("mouseenter", () => set(el.dataset.block));
      el.addEventListener("click", () => set(el.dataset.block));
    });
    set("attn");
  }

  /* ======================================================================
     boot
     ====================================================================== */
  function boot() {
    initDrawer();
    initNav();
    initTokenizer();
    initEmbedding();
    initAttention();
    initLayerLab();
    initPacking();
    packNext();
    initTrain();
    initSft();
    initRl();
    initInfer();
    initBlock();
    window.addEventListener("resize", () => {
      drawLoss();
      renderInfer();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
