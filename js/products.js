// ==========================================================================
// Products: post a listing, browse/filter listings, load one listing
// ==========================================================================

import { auth, db, storage, whenAuthReady } from "./firebase-config.js";
import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  doc,
  query,
  where,
  orderBy,
  serverTimestamp,
  deleteDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  ref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { openConversationWith } from "./messages.js";
import { initReviewSection, getSellerRatingsBulk, renderStars } from "./reviews.js";
import { CATEGORIES } from "./categories.js";
export { CATEGORIES };

function moneyGHS(amount) {
  return "GH₵ " + Number(amount).toLocaleString("en-GH", { minimumFractionDigits: 0 });
}

// Given a product's stored original price + discountPercent, work out the
// offer price. The original price is never overwritten — we always keep
// both numbers and calculate the sale price on the fly when displaying it.
function getPricing(p) {
  const discount = Number(p.discountPercent) || 0;
  const original = Number(p.price) || 0;
  const hasDiscount = discount > 0;
  const salePrice = hasDiscount ? original - (original * discount / 100) : original;
  return { hasDiscount, discount, original, salePrice };
}

function waLink(phone, productTitle) {
  const digits = phone.replace(/[^\d]/g, "");
  const text = encodeURIComponent(`Hi, I saw your listing "${productTitle}" on the marketplace. Is it still available?`);
  return `https://wa.me/${digits}?text=${text}`;
}

// ---- Post a product form (post-product.html) ----
const postForm = document.getElementById("post-form");
if (postForm) {
  // Require login before allowing a post
  whenAuthReady((user) => {
    if (!user) {
      window.location.href = "login.html?next=post-product.html";
    }
  });

  const categorySelect = document.getElementById("category");
  CATEGORIES.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    categorySelect.appendChild(opt);
  });

  const discountCheckbox = document.getElementById("on-discount");
  const discountField = document.getElementById("discount-field");
  const discountInput = document.getElementById("discount");
  discountCheckbox.addEventListener("change", () => {
    discountField.style.display = discountCheckbox.checked ? "" : "none";
    if (!discountCheckbox.checked) discountInput.value = "";
  });

  const imageInput = document.getElementById("images");
  const preview = document.getElementById("preview-strip");
  imageInput.addEventListener("change", () => {
    preview.innerHTML = "";
    [...imageInput.files].slice(0, 5).forEach((file) => {
      const img = document.createElement("img");
      img.src = URL.createObjectURL(file);
      preview.appendChild(img);
    });
  });

  postForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = document.getElementById("form-msg");
    const submitBtn = postForm.querySelector("button[type=submit]");
    const user = auth.currentUser;
    if (!user) return;

    submitBtn.disabled = true;
    submitBtn.textContent = "Posting...";

    try {
      const title = document.getElementById("title").value.trim();
      const description = document.getElementById("description").value.trim();
      const price = parseFloat(document.getElementById("price").value);
      const condition = document.getElementById("condition").value;
      const category = categorySelect.value;
      const files = [...imageInput.files].slice(0, 5);
      const discountPercent = discountCheckbox.checked
        ? Math.min(90, Math.max(1, parseFloat(discountInput.value) || 0))
        : 0;

      const imageUrls = [];
      for (const file of files) {
        const path = `products/${user.uid}/${Date.now()}-${file.name}`;
        const storageRef = ref(storage, path);
        await uploadBytes(storageRef, file);
        imageUrls.push(await getDownloadURL(storageRef));
      }

      await addDoc(collection(db, "products"), {
        title,
        description,
        price,
        discountPercent,
        condition,
        category,
        imageUrls,
        status: "active",
        userId: user.uid,
        createdAt: serverTimestamp()
      });

      window.location.href = "index.html";
    } catch (err) {
      console.error(err);
      msg.textContent = "Couldn't post your item. Please try again.";
      msg.className = "form-msg show error";
      submitBtn.disabled = false;
      submitBtn.textContent = "Post item";
    }
  });
}

// ---- Listing grid (index.html) ----
const grid = document.getElementById("product-grid");
if (grid) {
  loadListings();

  const params = new URLSearchParams(window.location.search);
  const activeCategory = params.get("category");
  document.querySelectorAll("[data-category-link]").forEach((link) => {
    if (link.dataset.categoryLink === activeCategory) link.classList.add("active");
  });

  const searchForm = document.getElementById("search-form");
  if (searchForm) {
    const q = params.get("q");
    if (q) document.getElementById("search-input").value = q;
  }
}

async function loadListings() {
  grid.innerHTML = `<p class="mono">Loading listings…</p>`;
  const params = new URLSearchParams(window.location.search);
  const category = params.get("category");
  const searchTerm = (params.get("q") || "").toLowerCase();

  renderBreadcrumb(category, params.get("q"));

  try {
    let q = query(
      collection(db, "products"),
      where("status", "==", "active"),
      orderBy("createdAt", "desc")
    );
    if (category) {
      q = query(
        collection(db, "products"),
        where("status", "==", "active"),
        where("category", "==", category),
        orderBy("createdAt", "desc")
      );
    }

    const snap = await getDocs(q);
    let items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    if (searchTerm) {
      items = items.filter((p) => p.title.toLowerCase().includes(searchTerm));
    }

    if (items.length === 0) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column: 1/-1;">
          <h3>No listings here yet</h3>
          <p>Be the first to post something in this category.</p>
        </div>`;
      return;
    }

    const ratings = await getSellerRatingsBulk(items.map((p) => p.userId));
    grid.innerHTML = items.map((p) => renderCard(p, ratings.get(p.userId))).join("");
  } catch (err) {
    console.error(err);
    grid.innerHTML = `<p class="mono">Couldn't load listings right now.</p>`;
  }
}

function renderBreadcrumb(category, searchTerm) {
  const el = document.getElementById("breadcrumb");
  if (!el) return;
  if (searchTerm) {
    el.innerHTML = `<a href="index.html">Home</a> <span>›</span> <span>Search: "${escapeHtml(searchTerm)}"</span>`;
  } else if (category) {
    el.innerHTML = `<a href="index.html">Home</a> <span>›</span> <span>${escapeHtml(category)}</span>`;
  } else {
    el.innerHTML = `<span>Home</span>`;
  }
}

function renderCard(p, rating) {
  const img = p.imageUrls && p.imageUrls[0]
    ? `<img src="${p.imageUrls[0]}" alt="${escapeHtml(p.title)}">`
    : `No photo`;

  const { hasDiscount, discount, original, salePrice } = getPricing(p);
  const badge = hasDiscount ? `<span class="discount-badge">-${discount}%</span>` : "";
  const priceBlock = hasDiscount
    ? `<span class="price">${moneyGHS(salePrice)}</span><span class="old-price">${moneyGHS(original)}</span>`
    : `<span class="price">${moneyGHS(original)}</span>`;

  const ratingRow = rating && rating.count > 0
    ? `<div class="card-rating">${renderStars(rating.average, "0.72rem")} <span class="mono">(${rating.count})</span></div>`
    : `<div class="card-rating mono">No seller reviews yet</div>`;

  return `
    <div class="card">
      <a href="product-details.html?id=${p.id}" class="card-media">
        <div class="thumb">${badge}${img}</div>
      </a>
      <div class="card-body">
        <span class="cat">${escapeHtml(p.category || "")}</span>
        <a href="product-details.html?id=${p.id}"><h3>${escapeHtml(p.title)}</h3></a>
        ${priceBlock}
        ${ratingRow}
        <span class="direct-tag">💬 Message seller directly</span>
        <a class="btn btn-primary card-cta" href="product-details.html?id=${p.id}">View item</a>
      </div>
    </div>`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

// ---- Product details page ----
const pdContainer = document.getElementById("product-detail");
if (pdContainer) {
  loadProductDetail();
}

async function loadProductDetail() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  if (!id) {
    pdContainer.innerHTML = `<p class="mono">No item specified.</p>`;
    return;
  }

  try {
    const snap = await getDoc(doc(db, "products", id));
    if (!snap.exists()) {
      pdContainer.innerHTML = `<p class="mono">This listing doesn't exist or was removed.</p>`;
      return;
    }
    const p = { id: snap.id, ...snap.data() };
    const sellerSnap = await getDoc(doc(db, "users", p.userId));
    const seller = sellerSnap.exists() ? sellerSnap.data() : { name: "Seller", phone: "", whatsapp: "", location: "" };

    const images = p.imageUrls && p.imageUrls.length ? p.imageUrls : [];
    const { hasDiscount, discount, original, salePrice } = getPricing(p);
    const badge = hasDiscount ? `<span class="discount-badge">-${discount}%</span>` : "";
    const mainImg = images[0]
      ? `<img src="${images[0]}" alt="${escapeHtml(p.title)}" id="pd-main-img">`
      : `No photo available`;
    const thumbs = images.length > 1
      ? `<div class="pd-thumbs">${images.map((u, i) => `<img src="${u}" data-full="${u}" alt="photo ${i + 1}">`).join("")}</div>`
      : "";
    const priceRow = hasDiscount
      ? `<div class="price-row"><span class="price">${moneyGHS(salePrice)}</span><span class="old-price">${moneyGHS(original)}</span></div>`
      : `<div class="price-row"><span class="price">${moneyGHS(original)}</span></div>`;

    document.title = `${p.title} — Marketplace`;
    const crumb = document.getElementById("breadcrumb");
    if (crumb) {
      crumb.innerHTML = `<a href="index.html">Home</a> <span>›</span> <a href="index.html?category=${encodeURIComponent(p.category || "")}">${escapeHtml(p.category || "")}</a> <span>›</span> <span>${escapeHtml(p.title.length > 40 ? p.title.slice(0, 40) + "…" : p.title)}</span>`;
    }

    pdContainer.innerHTML = `
      <div class="pd-gallery">
        <div class="main-image">${badge}${mainImg}</div>
        ${thumbs}
      </div>
      <div class="pd-info">
        <span class="cat">${escapeHtml(p.category || "")} · ${escapeHtml(p.condition || "")}</span>
        <h1>${escapeHtml(p.title)}</h1>
        ${priceRow}
        <p class="desc">${escapeHtml(p.description || "No description provided.")}</p>

        <div class="seller-card">
          <span class="eyebrow">Posted by</span>
          <h4>${escapeHtml(seller.name || "Seller")}</h4>
          <div class="loc">${escapeHtml(seller.location || "Location not specified")}</div>
          <div class="seller-actions">
            <button type="button" class="btn btn-primary" id="message-seller-btn">Message seller</button>
            ${seller.whatsapp
              ? `<a class="btn btn-whatsapp" target="_blank" rel="noopener" href="${waLink(seller.whatsapp, p.title)}">Chat on WhatsApp</a>`
              : ""}
            ${seller.phone
              ? `<a class="btn btn-primary" href="tel:${seller.phone}">Call ${escapeHtml(seller.phone)}</a>`
              : ""}
          </div>
        </div>

        <div class="reviews-block">
          <h4>Seller reviews</h4>
          <div id="review-section"></div>
        </div>
      </div>`;

    const mainImgEl = document.getElementById("pd-main-img");
    pdContainer.querySelectorAll(".pd-thumbs img").forEach((thumb) => {
      thumb.addEventListener("click", () => {
        if (mainImgEl) mainImgEl.src = thumb.dataset.full;
      });
    });

    document.getElementById("message-seller-btn").addEventListener("click", () => {
      openConversationWith(p.userId, seller.name, { productId: p.id, productTitle: p.title });
    });
    whenAuthReady((user) => {
      if (user && user.uid === p.userId) {
        const btn = document.getElementById("message-seller-btn");
        if (btn) btn.style.display = "none";
      }
    });

    initReviewSection(p.userId);

    // Owner-only controls: mark sold/available, delete
    whenAuthReady((user) => {
      if (!user || user.uid !== p.userId) return;
      const panel = document.createElement("div");
      panel.className = "seller-card";
      panel.style.marginTop = "16px";
      panel.innerHTML = `
        <span class="eyebrow">Manage this listing</span>
        <p class="hint" style="margin:0 0 12px;">Only you can see these controls.</p>
        <div class="seller-actions">
          <button type="button" class="btn btn-primary" id="toggle-sold-btn">
            ${p.status === "sold" ? "Mark as available again" : "Mark as sold"}
          </button>
          <button type="button" class="btn" id="delete-listing-btn" style="background:#fdecea; color:#c0392b;">
            Delete this listing
          </button>
        </div>`;
      pdContainer.querySelector(".pd-info").appendChild(panel);

      document.getElementById("toggle-sold-btn").addEventListener("click", async () => {
        const newStatus = p.status === "sold" ? "active" : "sold";
        await updateDoc(doc(db, "products", p.id), { status: newStatus });
        window.location.reload();
      });

      document.getElementById("delete-listing-btn").addEventListener("click", async () => {
        const sure = confirm("Delete this listing permanently? This can't be undone.");
        if (!sure) return;
        await deleteDoc(doc(db, "products", p.id));
        window.location.href = "my-listings.html";
      });
    });
  } catch (err) {
    console.error(err);
    pdContainer.innerHTML = `<p class="mono">Couldn't load this listing right now.</p>`;
  }
}

// ---- My Listings page (my-listings.html) ----
const myGrid = document.getElementById("my-listings-grid");
if (myGrid) {
  whenAuthReady((user) => {
    if (!user) {
      window.location.href = "login.html?next=my-listings.html";
      return;
    }
    loadMyListings(user.uid);
  });
}

async function loadMyListings(uid) {
  myGrid.innerHTML = `<p class="mono">Loading your listings…</p>`;
  try {
    const q = query(collection(db, "products"), where("userId", "==", uid), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    if (items.length === 0) {
      myGrid.innerHTML = `
        <div class="empty-state" style="grid-column: 1/-1;">
          <h3>You haven't posted anything yet</h3>
          <p>Items you post will show up here so you can manage them.</p>
          <a class="btn btn-primary" style="width:auto; display:inline-flex; margin-top:12px;" href="post-product.html">+ Post an item</a>
        </div>`;
      return;
    }

    myGrid.innerHTML = items.map(renderManageCard).join("");

    myGrid.querySelectorAll("[data-toggle-sold]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.toggleSold;
        const newStatus = btn.dataset.currentStatus === "sold" ? "active" : "sold";
        btn.disabled = true;
        await updateDoc(doc(db, "products", id), { status: newStatus });
        loadMyListings(uid);
      });
    });

    myGrid.querySelectorAll("[data-delete]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const sure = confirm("Delete this listing permanently? This can't be undone.");
        if (!sure) return;
        btn.disabled = true;
        await deleteDoc(doc(db, "products", btn.dataset.delete));
        loadMyListings(uid);
      });
    });
  } catch (err) {
    console.error(err);
    myGrid.innerHTML = `<p class="mono">Couldn't load your listings right now.</p>`;
  }
}

function renderManageCard(p) {
  const img = p.imageUrls && p.imageUrls[0]
    ? `<img src="${p.imageUrls[0]}" alt="${escapeHtml(p.title)}">`
    : `No photo`;
  const { hasDiscount, discount, original, salePrice } = getPricing(p);
  const badge = hasDiscount ? `<span class="discount-badge">-${discount}%</span>` : "";
  const soldBadge = p.status === "sold"
    ? `<span class="discount-badge" style="left:8px; right:auto; background:#eee; color:#555;">SOLD</span>`
    : "";
  const priceBlock = hasDiscount
    ? `<span class="price">${moneyGHS(salePrice)}</span><span class="old-price">${moneyGHS(original)}</span>`
    : `<span class="price">${moneyGHS(original)}</span>`;

  return `
    <div class="card">
      <a href="product-details.html?id=${p.id}">
        <div class="thumb">${badge}${soldBadge}${img}</div>
      </a>
      <div class="card-body">
        <span class="cat">${escapeHtml(p.category || "")}</span>
        <h3><a href="product-details.html?id=${p.id}">${escapeHtml(p.title)}</a></h3>
        ${priceBlock}
        <div class="seller-actions" style="margin-top:8px;">
          <button type="button" class="btn btn-primary" style="padding:9px 12px; font-size:0.85rem;"
            data-toggle-sold="${p.id}" data-current-status="${p.status}">
            ${p.status === "sold" ? "Mark available" : "Mark as sold"}
          </button>
          <button type="button" class="btn" style="padding:9px 12px; font-size:0.85rem; background:#fdecea; color:#c0392b;"
            data-delete="${p.id}">
            Delete
          </button>
        </div>
      </div>
    </div>`;
}
