// ==========================================================================
// Homepage-only behavior: build the sidebar category list
// (search form + drawer categories are handled in auth.js, since those
// appear on every page, not just the homepage)
// ==========================================================================

import { CATEGORIES } from "./categories.js";

const categoryBar = document.getElementById("category-bar-list");
if (categoryBar) {
  const params = new URLSearchParams(window.location.search);
  const active = params.get("category");

  const allLink = document.createElement("a");
  allLink.href = "index.html";
  allLink.innerHTML = `<span class="dot"></span> All categories`;
  allLink.dataset.categoryLink = "";
  if (!active) allLink.classList.add("active");
  categoryBar.appendChild(allLink);

  CATEGORIES.forEach((cat) => {
    const a = document.createElement("a");
    a.href = `index.html?category=${encodeURIComponent(cat)}`;
    a.innerHTML = `<span class="dot"></span> ${cat}`;
    a.dataset.categoryLink = cat;
    if (active === cat) a.classList.add("active");
    categoryBar.appendChild(a);
  });
}

