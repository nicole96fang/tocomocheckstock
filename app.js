const STORAGE_KEY = "tocomo_check_stock_v1";

const defaultState = {
  products: [],
  movements: [],
  counts: {}
};

let state = loadState();
let currentScreen = "homeScreen";

const $ = (id) => document.getElementById(id);

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(defaultState);
    const parsed = JSON.parse(raw);
    return {
      products: Array.isArray(parsed.products) ? parsed.products : [],
      movements: Array.isArray(parsed.movements) ? parsed.movements : [],
      counts: parsed.counts && typeof parsed.counts === "object" ? parsed.counts : {}
    };
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  renderAll();
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function todayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function displayDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-MY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);
}

function displayDateTime(iso) {
  return new Intl.DateTimeFormat("en-MY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(iso));
}

function getProductStock(productId) {
  return state.movements.reduce((sum, m) => {
    if (m.productId !== productId) return sum;
    return sum + (m.type === "in" ? m.qty : -m.qty);
  }, 0);
}

function getProductByName(name) {
  return state.products.find(p => p.name.trim().toLowerCase() === name.trim().toLowerCase());
}

function getTodayCount() {
  return state.counts[todayKey()] || {};
}

function getTodayDifferenceCount() {
  const count = getTodayCount();
  return Object.values(count).filter(x => x.checked && Number(x.actual) !== Number(x.system)).length;
}

function navigate(screenId) {
  currentScreen = screenId;
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  $(screenId).classList.add("active");

  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.screen === screenId);
  });

  renderAll();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 1800);
}

function renderHome() {
  $("today").textContent = displayDate();

  $("productCount").textContent = state.products.length;
  $("stockCount").textContent = state.products.reduce((sum, p) => sum + getProductStock(p.id), 0);
  $("differenceCount").textContent = getTodayDifferenceCount();
}

function renderIssueProducts() {
  const select = $("issueProduct");
  const previous = select.value;

  if (!state.products.length) {
    select.innerHTML = `<option value="">还没有商品，请先到「进货」新增</option>`;
    $("issueAvailable").textContent = "0";
    return;
  }

  select.innerHTML = state.products.map(p => {
    const stock = getProductStock(p.id);
    return `<option value="${p.id}">${escapeHtml(p.name)}（库存 ${stock}）</option>`;
  }).join("");

  if (state.products.some(p => p.id === previous)) select.value = previous;
  updateIssueAvailable();
}

function updateIssueAvailable() {
  const id = $("issueProduct").value;
  $("issueAvailable").textContent = id ? getProductStock(id) : "0";
}

function renderHistory(type) {
  const target = type === "in" ? $("receiveHistory") : $("issueHistory");
  const items = state.movements
    .filter(m => m.type === type)
    .sort((a, b) => new Date(b.time) - new Date(a.time))
    .slice(0, 12);

  if (!items.length) {
    target.innerHTML = `<div class="empty">暂时没有记录</div>`;
    return;
  }

  target.innerHTML = items.map(m => `
    <div class="history-item">
      <div class="history-main">
        <div class="history-name">${escapeHtml(m.productName)}</div>
        <div class="history-meta">${displayDateTime(m.time)}${m.code ? ` · ${escapeHtml(m.code)}` : ""}</div>
      </div>
      <div class="history-qty ${m.type === "in" ? "plus" : "minus"}">
        ${m.type === "in" ? "+" : "-"}${m.qty}
      </div>
    </div>
  `).join("");
}

function renderCount() {
  const search = $("countSearch").value.trim().toLowerCase();
  const today = getTodayCount();

  const visibleProducts = state.products.filter(p =>
    p.name.toLowerCase().includes(search)
  );

  const checked = state.products.filter(p => today[p.id]?.checked).length;
  const diff = getTodayDifferenceCount();

  $("countDone").textContent = checked;
  $("countTotal").textContent = state.products.length;
  $("countDiff").textContent = diff;

  if (!visibleProducts.length) {
    $("countList").innerHTML = `<div class="empty">${state.products.length ? "找不到这个商品" : "还没有商品，请先到「进货」新增商品"}</div>`;
    return;
  }

  $("countList").innerHTML = visibleProducts.map(p => {
    const system = getProductStock(p.id);
    const item = today[p.id] || { actual: system, checked: false };
    const actual = Number(item.actual);
    const difference = actual - system;
    const hasDiff = item.checked && difference !== 0;

    return `
      <div class="count-item ${hasDiff ? "has-diff" : ""}" data-product-id="${p.id}">
        <div class="count-item-top">
          <div>
            <div class="count-name">${escapeHtml(p.name)}</div>
            <div class="count-system">系统库存：${system}</div>
          </div>
          ${item.checked ? `<span class="done-badge">✓ 已点</span>` : ""}
        </div>

        <div class="count-controls">
          <button type="button" data-count-action="minus">−</button>
          <input type="number" min="0" step="1" value="${actual}" data-count-input />
          <button type="button" data-count-action="plus">＋</button>
        </div>

        <div class="count-result">
          <span>实际：${actual}</span>
          <span class="diff ${difference === 0 ? "zero" : "bad"}">
            ${difference === 0 ? "✓ 一致" : `差异 ${difference > 0 ? "+" : ""}${difference}`}
          </span>
        </div>
      </div>
    `;
  }).join("");
}

function renderCountHistory() {
  const target = $("countHistory");
  const entries = Object.entries(state.counts)
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 10);

  if (!entries.length) {
    target.innerHTML = `<div class="empty">还没有完成过点货</div>`;
    return;
  }

  target.innerHTML = entries.map(([date, data]) => {
    const checkedItems = Object.values(data).filter(x => x.checked);
    const diffs = checkedItems.filter(x => Number(x.actual) !== Number(x.system)).length;
    return `
      <div class="history-item">
        <div class="history-main">
          <div class="history-name">${date}</div>
          <div class="history-meta">${checkedItems.length} 项已点</div>
        </div>
        <div class="history-qty ${diffs ? "minus" : "plus"}">
          ${diffs ? `${diffs} 项差异` : "✓ 完成"}
        </div>
      </div>
    `;
  }).join("");
}

function renderAll() {
  renderHome();
  renderIssueProducts();
  renderHistory("in");
  renderHistory("out");
  renderCount();
  renderCountHistory();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

document.addEventListener("click", (e) => {
  const screenBtn = e.target.closest("[data-screen]");
  if (screenBtn) {
    navigate(screenBtn.dataset.screen);
    return;
  }

  const countButton = e.target.closest("[data-count-action]");
  if (countButton) {
    const item = countButton.closest(".count-item");
    const id = item.dataset.productId;
    const input = item.querySelector("[data-count-input]");
    const value = Math.max(0, Number(input.value || 0) + (countButton.dataset.countAction === "plus" ? 1 : -1));
    input.value = value;
    saveCountItem(id, value);
  }
});

$("issueProduct").addEventListener("change", updateIssueAvailable);
$("countSearch").addEventListener("input", renderCount);

$("countList").addEventListener("change", (e) => {
  if (!e.target.matches("[data-count-input]")) return;
  const item = e.target.closest(".count-item");
  saveCountItem(item.dataset.productId, Math.max(0, Number(e.target.value || 0)));
});

function saveCountItem(productId, actual) {
  const date = todayKey();
  if (!state.counts[date]) state.counts[date] = {};

  const system = getProductStock(productId);
  state.counts[date][productId] = {
    actual: Number(actual),
    system,
    checked: true,
    time: new Date().toISOString()
  };

  saveState();
}

$("receiveForm").addEventListener("submit", (e) => {
  e.preventDefault();

  const name = $("receiveProduct").value.trim();
  const code = $("receiveCode").value.trim();
  const qty = Number($("receiveQty").value);

  if (!name || !Number.isInteger(qty) || qty < 1) {
    toast("请填写正确资料");
    return;
  }

  let product = getProductByName(name);

  if (!product) {
    product = {
      id: uid(),
      name,
      createdAt: new Date().toISOString()
    };
    state.products.push(product);
  }

  state.movements.push({
    id: uid(),
    productId: product.id,
    productName: product.name,
    type: "in",
    qty,
    code,
    time: new Date().toISOString()
  });

  saveState();

  $("receiveForm").reset();
  $("receiveQty").value = 1;
  toast(`已进货 +${qty} · ${name}`);
});

$("issueForm").addEventListener("submit", (e) => {
  e.preventDefault();

  const productId = $("issueProduct").value;
  const product = state.products.find(p => p.id === productId);
  const code = $("issueCode").value.trim();
  const qty = Number($("issueQty").value);

  if (!product || !Number.isInteger(qty) || qty < 1) {
    toast("请选择商品并填写数量");
    return;
  }

  const stock = getProductStock(productId);

  if (qty > stock) {
    toast(`库存不足，目前只有 ${stock}`);
    return;
  }

  state.movements.push({
    id: uid(),
    productId: product.id,
    productName: product.name,
    type: "out",
    qty,
    code,
    time: new Date().toISOString()
  });

  saveState();

  $("issueForm").reset();
  $("issueQty").value = 1;
  toast(`已出货 -${qty} · ${product.name}`);
});

$("finishCountBtn").addEventListener("click", () => {
  if (!state.products.length) {
    toast("还没有商品可以点货");
    return;
  }

  const date = todayKey();
  const today = state.counts[date] || {};
  const unchecked = state.products.filter(p => !today[p.id]?.checked);

  if (unchecked.length) {
    toast(`还有 ${unchecked.length} 项还没有点`);
    return;
  }

  const diffs = state.products.filter(p => {
    const x = today[p.id];
    return x && Number(x.actual) !== Number(x.system);
  });

  if (diffs.length) {
    const names = diffs.slice(0, 2).map(p => p.name).join("、");
    const more = diffs.length > 2 ? ` 等 ${diffs.length} 项` : "";
    toast(`点货完成，但有差异：${names}${more}`);
  } else {
    toast("今日点货完成 ✓ 全部一致");
  }

  saveState();
});

renderAll();
