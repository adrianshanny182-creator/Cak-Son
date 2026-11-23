const ADMIN_UID = "VBoyYBO04neNZ40E1htQgKBQtHo2";
const ADMIN_WA = "085646359936";
const CATEGORIES = ["Semua", "Sayur", "Ikan", "Buah", "Daging", "Bumbu"];
const CART_STORAGE_KEY = "cakson_cart_v1";

const DEFAULT_SETTINGS = {
  slots: ["04.00 - 09.00 WIB", "10.00 - 14.00 WIB", "15.00 - 18.00 WIB"],
  shippingCost: 5000,
  storeName: "Cak. Son"
};

const state = {
  products: [],
  activeCategory: "Semua",
  cart: loadCart(),
  settings: { ...DEFAULT_SETTINGS },
  orders: [],
  currentUser: null,
  isAdmin: false
};

function formatRupiah(amount) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(Number(amount) || 0);
}

function normalizeWaNumber(phone) {
  const digits = String(phone || ADMIN_WA).replace(/\D/g, "");
  if (digits.startsWith("0")) return "62" + digits.slice(1);
  if (!digits.startsWith("62")) return "62" + digits;
  return digits;
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function loadCart() {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveCart() {
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(state.cart));
  renderCart();
}

function addToCart(productId) {
  const prod = state.products.find((p) => p.id === productId);
  if (!prod || prod.isAvailable === false) return;
  const existing = state.cart.find((item) => item.id === productId);
  if (existing) {
    existing.qty += 1;
  } else {
    state.cart.push({
      id: prod.id,
      name: prod.name,
      price: Number(prod.price) || 0,
      unit: prod.unit || "porsi",
      qty: 1
    });
  }
  saveCart();
}

function updateCartQty(productId, delta) {
  const idx = state.cart.findIndex((item) => item.id === productId);
  if (idx === -1) return;
  state.cart[idx].qty += delta;
  if (state.cart[idx].qty <= 0) {
    state.cart.splice(idx, 1);
  }
  saveCart();
}

function getCartTotals() {
  const subtotal = state.cart.reduce(
    (sum, item) => sum + (Number(item.price) || 0) * (Number(item.qty) || 0),
    0
  );
  const shipping = state.cart.length > 0 ? Number(state.settings.shippingCost) || 0 : 0;
  return { subtotal, shipping, total: subtotal + shipping };
}

function listenPublicStoreData() {
  db.collection("products").onSnapshot(
    (snap) => {
      state.products = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      renderProducts();
    },
    (err) => {
      const el = document.getElementById("productList");
      if (el) el.innerHTML = `<p><small>Gagal memuat katalog: ${escapeHtml(err.message)}</small></p>`;
    }
  );

  db.collection("settings")
    .doc("storeConfig")
    .onSnapshot(
      (doc) => {
        if (doc.exists) {
          state.settings = { ...DEFAULT_SETTINGS, ...doc.data() };
        }
        renderDeliverySlots();
        renderCart();
        fillSettingsForm();
      },
      (err) => console.warn("Gagal memuat pengaturan:", err.message)
    );
}

function renderCategories() {
  const bar = document.getElementById("categoryBar");
  if (!bar) return;
  bar.innerHTML = CATEGORIES.map((cat) => {
    const activeClass = state.activeCategory === cat ? "active" : "";
    return `<button type="button" class="cat-btn ${activeClass}" data-cat="${escapeHtml(cat)}">${escapeHtml(cat)}</button>`;
  }).join("");

  bar.querySelectorAll(".cat-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.activeCategory = btn.getAttribute("data-cat") || "Semua";
      renderCategories();
      renderProducts();
    });
  });
}

function renderProducts() {
  const list = document.getElementById("productList");
  if (!list) return;

  const filtered = state.products.filter((p) => {
    return state.activeCategory === "Semua" || p.category === state.activeCategory;
  });

  if (!filtered.length) {
    list.innerHTML = `<p><small>Belum ada produk pada kategori ${escapeHtml(state.activeCategory)}.</small></p>`;
    return;
  }

  list.innerHTML = filtered
    .map((p) => {
      const tersedia = p.isAvailable !== false;
      return `
        <div class="product-item">
          <div>
            <strong>${escapeHtml(p.name)}</strong> <small>(${escapeHtml(p.category || "-")})</small><br />
            <span>${formatRupiah(p.price)} / ${escapeHtml(p.unit || "porsi")}</span><br />
            <small>${tersedia ? "Tersedia" : "Habis"}</small>
          </div>
          <div>
            <button type="button" class="btn btn-sm add-cart-btn" data-id="${escapeHtml(p.id)}" ${tersedia ? "" : "disabled"}>
              ${tersedia ? "+ Keranjang" : "Habis"}
            </button>
            ${
              state.isAdmin
                ? `<button type="button" class="btn btn-sm btn-outline edit-prod-btn" data-id="${escapeHtml(p.id)}">Edit</button>
                   <button type="button" class="btn btn-sm btn-danger del-prod-btn" data-id="${escapeHtml(p.id)}">Hapus</button>`
                : ""
            }
          </div>
        </div>
      `;
    })
    .join("");

  list.querySelectorAll(".add-cart-btn").forEach((btn) => {
    btn.addEventListener("click", () => addToCart(btn.getAttribute("data-id")));
  });

  list.querySelectorAll(".edit-prod-btn").forEach((btn) => {
    btn.addEventListener("click", () => startEditProduct(btn.getAttribute("data-id")));
  });

  list.querySelectorAll(".del-prod-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Hapus produk ini?")) return;
      try {
        await deleteProductAdmin(btn.getAttribute("data-id"));
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

function renderDeliverySlots() {
  const select = document.getElementById("deliverySlot");
  if (!select) return;
  const slots = Array.isArray(state.settings.slots) && state.settings.slots.length
    ? state.settings.slots
    : DEFAULT_SETTINGS.slots;
  const currentVal = select.value;
  select.innerHTML = slots
    .map((slot) => `<option value="${escapeHtml(slot)}">${escapeHtml(slot)}</option>`)
    .join("");
  if (currentVal && slots.includes(currentVal)) {
    select.value = currentVal;
  }
}

function renderCart() {
  const list = document.getElementById("cartList");
  const summary = document.getElementById("cartSummary");
  if (!list || !summary) return;

  if (!state.cart.length) {
    list.innerHTML = `<p><small>Keranjang masih kosong.</small></p>`;
    summary.innerHTML = `<p><small>Ongkir pengaturan toko: ${formatRupiah(state.settings.shippingCost)}</small></p>`;
    return;
  }

  list.innerHTML = state.cart
    .map(
      (item) => `
      <div class="cart-row">
        <div>
          <strong>${escapeHtml(item.name)}</strong><br />
          <small>${formatRupiah(item.price)} x ${item.qty} ${escapeHtml(item.unit)}</small>
        </div>
        <div>
          <button type="button" class="btn btn-sm btn-outline qty-dec" data-id="${escapeHtml(item.id)}">-</button>
          <span style="margin:0 6px;">${item.qty}</span>
          <button type="button" class="btn btn-sm btn-outline qty-inc" data-id="${escapeHtml(item.id)}">+</button>
        </div>
      </div>
    `
    )
    .join("");

  list.querySelectorAll(".qty-dec").forEach((btn) => {
    btn.addEventListener("click", () => updateCartQty(btn.getAttribute("data-id"), -1));
  });
  list.querySelectorAll(".qty-inc").forEach((btn) => {
    btn.addEventListener("click", () => updateCartQty(btn.getAttribute("data-id"), 1));
  });

  const { subtotal, shipping, total } = getCartTotals();
  summary.innerHTML = `
    <p>
      Subtotal: <strong>${formatRupiah(subtotal)}</strong><br />
      Ongkir: <strong>${formatRupiah(shipping)}</strong><br />
      Total Belanja: <strong>${formatRupiah(total)}</strong>
    </p>
  `;
}

async function submitOrder({ nama, waPelanggan, alamat, slotWib, catatan }) {
  if (!state.cart.length) throw new Error("Keranjang masih kosong.");
  if (!nama || !waPelanggan || !alamat) {
    throw new Error("Nama, nomor WhatsApp, dan alamat wajib diisi.");
  }

  const { subtotal, shipping, total } = getCartTotals();
  const invoiceCode = "INV-" + Date.now().toString().slice(-6);

  const orderPayload = {
    invoiceCode,
    nama: nama.trim(),
    waPelanggan: waPelanggan.trim(),
    alamat: alamat.trim(),
    slotWib: slotWib || state.settings.slots[0] || "",
    catatan: (catatan || "").trim(),
    items: state.cart.map((i) => ({
      id: i.id,
      name: i.name,
      price: i.price,
      unit: i.unit,
      qty: i.qty
    })),
    subtotal,
    ongkir: shipping,
    totalBelanja: total,
    status: "Menunggu Konfirmasi",
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  const docRef = await db.collection("orders").add(orderPayload);
  const savedOrder = { id: docRef.id, ...orderPayload };

  renderInvoice(savedOrder);
  openWhatsAppOrder(savedOrder);

  state.cart = [];
  saveCart();
  return savedOrder;
}

function renderInvoice(order) {
  const sec = document.getElementById("invoiceSection");
  const box = document.getElementById("invoiceBox");
  if (!sec || !box || !order) return;

  sec.classList.remove("hidden");
  box.innerHTML = `
    <p>
      No. Invoice: <strong>${escapeHtml(order.invoiceCode)}</strong><br />
      Status: <strong>${escapeHtml(order.status)}</strong><br />
      Penerima: ${escapeHtml(order.nama)} (${escapeHtml(order.waPelanggan)})<br />
      Alamat: ${escapeHtml(order.alamat)}<br />
      Jadwal Kirim: ${escapeHtml(order.slotWib)}
    </p>
    <ul>
      ${order.items
        .map(
          (item) =>
            `<li>${escapeHtml(item.name)} (${item.qty} ${escapeHtml(item.unit)}) - ${formatRupiah(item.price * item.qty)}</li>`
        )
        .join("")}
    </ul>
    <p>
      Subtotal: ${formatRupiah(order.subtotal)}<br />
      Ongkir: ${formatRupiah(order.ongkir)}<br />
      <strong>Total Bayar: ${formatRupiah(order.totalBelanja)}</strong>
    </p>
  `;
}

function openWhatsAppOrder(order) {
  const lines = [
    `*PESANAN BARU - ${state.settings.storeName || "Cak. Son"}*`,
    `No. Invoice: *${order.invoiceCode}*`,
    `Nama: ${order.nama}`,
    `WA: ${order.waPelanggan}`,
    `Alamat: ${order.alamat}`,
    `Jadwal Kirim: ${order.slotWib}`,
    ``,
    `*Rincian Belanja:*`,
    ...order.items.map(
      (item) => `- ${item.name} (${item.qty} ${item.unit}) = ${formatRupiah(item.price * item.qty)}`
    ),
    ``,
    `Subtotal: ${formatRupiah(order.subtotal)}`,
    `Ongkir: ${formatRupiah(order.ongkir)}`,
    `*Total Bayar: ${formatRupiah(order.totalBelanja)}*`
  ];
  if (order.catatan) lines.push(`Catatan: ${order.catatan}`);

  const url = `https://wa.me/${normalizeWaNumber(ADMIN_WA)}?text=${encodeURIComponent(lines.join("\n"))}`;
  window.open(url, "_blank", "noopener");
}

async function trackOrderByInvoice(invoiceCode) {
  const code = String(invoiceCode || "").trim().toUpperCase();
  const resBox = document.getElementById("trackResult");
  if (!resBox) return;

  if (!code) {
    resBox.innerHTML = `<p><small>Masukkan nomor invoice terlebih dahulu.</small></p>`;
    return;
  }

  try {
    const snap = await db.collection("orders").where("invoiceCode", "==", code).limit(1).get();
    if (snap.empty) {
      resBox.innerHTML = `<p><small>Invoice <strong>${escapeHtml(code)}</strong> tidak ditemukan.</small></p>`;
      return;
    }
    const data = snap.docs[0].data();
    resBox.innerHTML = `
      <p>
        Invoice: <strong>${escapeHtml(data.invoiceCode)}</strong><br />
        Status: <strong>${escapeHtml(data.status || "Menunggu Konfirmasi")}</strong><br />
        Jadwal Kirim: ${escapeHtml(data.slotWib || "-")}<br />
        Total: <strong>${formatRupiah(data.totalBelanja)}</strong>
      </p>
    `;
  } catch (err) {
    resBox.innerHTML = `<p><small>Gagal mengecek status: ${escapeHtml(err.message)}</small></p>`;
  }
}

auth.onAuthStateChanged((user) => {
  state.currentUser = user || null;
  state.isAdmin = Boolean(user && user.uid === ADMIN_UID);
  renderAdminPanelVisibility();
  renderProducts();

  if (state.isAdmin) {
    fillSettingsForm();
    listenAdminOrders();
  } else {
    state.orders = [];
  }
});

function renderAdminPanelVisibility() {
  const loginBox = document.getElementById("adminLoginBox");
  const dashBox = document.getElementById("adminDashboardBox");
  const statusText = document.getElementById("adminStatusText");
  if (!loginBox || !dashBox) return;

  if (state.isAdmin) {
    loginBox.classList.add("hidden");
    dashBox.classList.remove("hidden");
    if (statusText && state.currentUser) {
      statusText.textContent = `Admin: ${state.currentUser.email || ADMIN_UID}`;
    }
  } else {
    loginBox.classList.remove("hidden");
    dashBox.classList.add("hidden");
  }
}

async function adminLogin(email, password) {
  const cred = await auth.signInWithEmailAndPassword(email.trim(), password);
  if (cred.user.uid !== ADMIN_UID) {
    await auth.signOut();
    throw new Error("Akun ini bukan admin yang terdaftar.");
  }
}

async function adminLogout() {
  await auth.signOut();
}

function startEditProduct(productId) {
  const prod = state.products.find((p) => p.id === productId);
  if (!prod) return;
  document.getElementById("adminSection")?.classList.remove("hidden");
  document.getElementById("prodId").value = prod.id;
  document.getElementById("prodName").value = prod.name || "";
  document.getElementById("prodCategory").value = prod.category || "Sayur";
  document.getElementById("prodPrice").value = prod.price || 0;
  document.getElementById("prodUnit").value = prod.unit || "ikat";
  document.getElementById("prodAvailable").checked = prod.isAvailable !== false;
}

function resetProductForm() {
  document.getElementById("prodId").value = "";
  document.getElementById("productForm")?.reset();
  document.getElementById("prodAvailable").checked = true;
}

async function saveProductAdmin({ id, name, category, price, unit, isAvailable }) {
  if (!state.isAdmin) throw new Error("Akses ditolak: hanya admin.");
  const payload = {
    name: name.trim(),
    category,
    price: Number(price) || 0,
    unit: (unit || "porsi").trim(),
    isAvailable: Boolean(isAvailable),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  if (id) {
    await db.collection("products").doc(id).update(payload);
  } else {
    await db.collection("products").add(payload);
  }
}

async function deleteProductAdmin(id) {
  if (!state.isAdmin) throw new Error("Akses ditolak: hanya admin.");
  await db.collection("products").doc(id).delete();
}

function fillSettingsForm() {
  const shipInput = document.getElementById("settingShipping");
  const slotsInput = document.getElementById("settingSlots");
  if (shipInput) shipInput.value = Number(state.settings.shippingCost) || 0;
  if (slotsInput) {
    const slots = Array.isArray(state.settings.slots) ? state.settings.slots : DEFAULT_SETTINGS.slots;
    slotsInput.value = slots.join(", ");
  }
}

async function saveStoreSettingsAdmin({ shippingCost, slotsText }) {
  if (!state.isAdmin) throw new Error("Akses ditolak: hanya admin.");
  const slots = String(slotsText || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  await db.collection("settings").doc("storeConfig").set(
    {
      shippingCost: Number(shippingCost) || 0,
      slots: slots.length ? slots : DEFAULT_SETTINGS.slots
    },
    { merge: true }
  );
}

function listenAdminOrders() {
  db.collection("orders")
    .orderBy("createdAt", "desc")
    .onSnapshot((snap) => {
      state.orders = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      renderAdminOrders();
    });
}

function renderAdminOrders() {
  const box = document.getElementById("adminOrdersList");
  if (!box) return;

  if (!state.orders.length) {
    box.innerHTML = `<p><small>Belum ada pesanan masuk.</small></p>`;
    return;
  }

  const statuses = ["Menunggu Konfirmasi", "Diproses", "Dikirim", "Selesai", "Dibatalkan"];

  box.innerHTML = state.orders
    .map((ord) => {
      const optionsHtml = statuses
        .map((st) => `<option value="${st}" ${ord.status === st ? "selected" : ""}>${st}</option>`)
        .join("");

      return `
        <div class="order-row">
          <div>
            <strong>${escapeHtml(ord.invoiceCode || ord.id)}</strong> - ${escapeHtml(ord.nama || "-")}<br />
            <small>${escapeHtml(ord.waPelanggan || "-")} | ${escapeHtml(ord.slotWib || "-")}</small><br />
            <small>${escapeHtml(ord.alamat || "-")}</small><br />
            <strong>${formatRupiah(ord.totalBelanja)}</strong>
          </div>
          <div>
            <select class="order-status-select" data-id="${escapeHtml(ord.id)}">
              ${optionsHtml}
            </select>
          </div>
        </div>
      `;
    })
    .join("");

  box.querySelectorAll(".order-status-select").forEach((sel) => {
    sel.addEventListener("change", async () => {
      try {
        await updateOrderStatusAdmin(sel.getAttribute("data-id"), sel.value);
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

async function updateOrderStatusAdmin(orderId, status) {
  if (!state.isAdmin) throw new Error("Akses ditolak: hanya admin.");
  await db.collection("orders").doc(orderId).update({ status });
}

document.addEventListener("DOMContentLoaded", () => {
  renderCategories();
  renderCart();
  renderDeliverySlots();
  renderAdminPanelVisibility();
  listenPublicStoreData();

  document.getElementById("toggleAdminBtn")?.addEventListener("click", () => {
    document.getElementById("adminSection")?.classList.toggle("hidden");
  });

  document.getElementById("checkoutForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await submitOrder({
        nama: document.getElementById("custName")?.value,
        waPelanggan: document.getElementById("custWa")?.value,
        alamat: document.getElementById("custAddress")?.value,
        slotWib: document.getElementById("deliverySlot")?.value,
        catatan: document.getElementById("custNote")?.value
      });
      e.target.reset();
      renderDeliverySlots();
    } catch (err) {
      alert(err.message);
    }
  });

  document.getElementById("trackBtn")?.addEventListener("click", () => {
    trackOrderByInvoice(document.getElementById("trackInvoiceInput")?.value);
  });

  document.getElementById("adminLoginForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await adminLogin(
        document.getElementById("adminEmail")?.value,
        document.getElementById("adminPassword")?.value
      );
      e.target.reset();
    } catch (err) {
      alert(err.message);
    }
  });

  document.getElementById("adminLogoutBtn")?.addEventListener("click", async () => {
    await adminLogout();
  });

  document.getElementById("productForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await saveProductAdmin({
        id: document.getElementById("prodId")?.value,
        name: document.getElementById("prodName")?.value,
        category: document.getElementById("prodCategory")?.value,
        price: document.getElementById("prodPrice")?.value,
        unit: document.getElementById("prodUnit")?.value,
        isAvailable: document.getElementById("prodAvailable")?.checked
      });
      resetProductForm();
    } catch (err) {
      alert(err.message);
    }
  });

  document.getElementById("resetProductFormBtn")?.addEventListener("click", resetProductForm);

  document.getElementById("settingsForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await saveStoreSettingsAdmin({
        shippingCost: document.getElementById("settingShipping")?.value,
        slotsText: document.getElementById("settingSlots")?.value
      });
      alert("Pengaturan ongkir & slot WIB tersimpan.");
    } catch (err) {
      alert(err.message);
    }
  });
});
