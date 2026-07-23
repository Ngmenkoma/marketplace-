// ==========================================================================
// Reviews: buyers rate/review a seller (not a specific product)
// ==========================================================================

import { auth, db, whenAuthReady } from "./firebase-config.js";
import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export function renderStars(rating, size = "1rem") {
  const rounded = Math.round(rating * 2) / 2; // nearest half star
  let html = `<span class="stars" style="font-size:${size};">`;
  for (let i = 1; i <= 5; i++) {
    if (rounded >= i) html += `★`;
    else if (rounded >= i - 0.5) html += `⯨`;
    else html += `<span class="star-empty">★</span>`;
  }
  html += `</span>`;
  return html;
}

export async function getSellerRating(sellerId) {
  const q = query(collection(db, "reviews"), where("sellerId", "==", sellerId), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  const reviews = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const count = reviews.length;
  const average = count ? reviews.reduce((sum, r) => sum + r.rating, 0) / count : 0;
  return { reviews, average, count };
}

// Look up ratings for many sellers at once (used on the listing grid).
// Firestore's "in" operator caps at 10 values per query, so we chunk.
export async function getSellerRatingsBulk(sellerIds) {
  const unique = [...new Set(sellerIds)].filter(Boolean);
  const result = new Map();
  if (unique.length === 0) return result;

  const chunks = [];
  for (let i = 0; i < unique.length; i += 10) chunks.push(unique.slice(i, i + 10));

  for (const chunk of chunks) {
    const q = query(collection(db, "reviews"), where("sellerId", "in", chunk));
    const snap = await getDocs(q);
    snap.docs.forEach((d) => {
      const r = d.data();
      const entry = result.get(r.sellerId) || { total: 0, count: 0 };
      entry.total += r.rating;
      entry.count += 1;
      result.set(r.sellerId, entry);
    });
  }

  const averaged = new Map();
  unique.forEach((uid) => {
    const entry = result.get(uid);
    averaged.set(uid, entry ? { average: entry.total / entry.count, count: entry.count } : { average: 0, count: 0 });
  });
  return averaged;
}

export async function submitReview(sellerId, rating, comment) {
  const user = auth.currentUser;
  if (!user) throw new Error("Must be logged in to leave a review.");
  if (user.uid === sellerId) throw new Error("You can't review yourself.");

  await addDoc(collection(db, "reviews"), {
    sellerId,
    reviewerId: user.uid,
    reviewerName: user.displayName || "A buyer",
    rating,
    comment,
    createdAt: serverTimestamp()
  });
}

// ---- Wire up a review section if the page has one (used on product-details.html) ----
export function initReviewSection(sellerId) {
  const container = document.getElementById("review-section");
  if (!container) return;

  loadAndRenderReviews();

  async function loadAndRenderReviews() {
    const { reviews, average, count } = await getSellerRating(sellerId);

    const summary = count
      ? `${renderStars(average, "1.1rem")} <strong>${average.toFixed(1)}</strong> <span class="mono">(${count} review${count === 1 ? "" : "s"})</span>`
      : `<span class="mono">No reviews yet — be the first to review this seller.</span>`;

    const list = reviews.slice(0, 10).map((r) => `
      <div class="review-item">
        <div class="review-head">
          <strong>${escapeHtml(r.reviewerName)}</strong>
          ${renderStars(r.rating, "0.85rem")}
        </div>
        ${r.comment ? `<p>${escapeHtml(r.comment)}</p>` : ""}
      </div>`).join("");

    container.innerHTML = `
      <div class="review-summary">${summary}</div>
      <div class="review-list">${list}</div>
      <div id="review-form-slot"></div>
    `;

    whenAuthReady((user) => {
      const slot = document.getElementById("review-form-slot");
      if (!slot) return;
      if (!user) {
        slot.innerHTML = `<p class="hint"><a href="login.html">Log in</a> to leave a review for this seller.</p>`;
        return;
      }
      if (user.uid === sellerId) {
        slot.innerHTML = "";
        return;
      }
      slot.innerHTML = `
        <form id="review-form" class="review-form">
          <label>Your rating</label>
          <div class="star-input" id="star-input">
            ${[1, 2, 3, 4, 5].map((n) => `<span data-star="${n}">★</span>`).join("")}
          </div>
          <textarea id="review-comment" rows="3" placeholder="Optional: share how the deal went"></textarea>
          <button type="submit" class="btn btn-primary" style="width:auto; padding:9px 18px;">Submit review</button>
          <span class="form-msg" id="review-msg"></span>
        </form>`;

      let chosenRating = 0;
      const starInput = document.getElementById("star-input");
      starInput.querySelectorAll("span").forEach((star) => {
        star.addEventListener("click", () => {
          chosenRating = parseInt(star.dataset.star, 10);
          starInput.querySelectorAll("span").forEach((s) => {
            s.classList.toggle("chosen", parseInt(s.dataset.star, 10) <= chosenRating);
          });
        });
      });

      document.getElementById("review-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const msg = document.getElementById("review-msg");
        if (!chosenRating) {
          msg.textContent = "Please choose a star rating.";
          msg.className = "form-msg show error";
          return;
        }
        try {
          const comment = document.getElementById("review-comment").value.trim();
          await submitReview(sellerId, chosenRating, comment);
          await loadAndRenderReviews();
        } catch (err) {
          msg.textContent = err.message || "Couldn't submit your review.";
          msg.className = "form-msg show error";
        }
      });
    });
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}
