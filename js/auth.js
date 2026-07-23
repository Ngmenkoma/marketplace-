// ==========================================================================
// Auth: register, login, logout
// Every user account doubles as a "seller profile" — phone/WhatsApp/location
// are stored on the users/{uid} doc so any listing can show contact info.
// ==========================================================================

import { auth, db, whenAuthReady } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { CATEGORIES } from "./categories.js";

function showMessage(el, text, type) {
  if (!el) return;
  el.textContent = text;
  el.className = `form-msg show ${type}`;
}

// ---- Register ----
const registerForm = document.getElementById("register-form");
if (registerForm) {
  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = document.getElementById("form-msg");
    const name = document.getElementById("name").value.trim();
    const email = document.getElementById("email").value.trim();
    const phone = document.getElementById("phone").value.trim();
    const whatsapp = document.getElementById("whatsapp").value.trim() || phone;
    const location = document.getElementById("location").value.trim();
    const password = document.getElementById("password").value;

    const submitBtn = registerForm.querySelector("button[type=submit]");
    submitBtn.disabled = true;
    submitBtn.textContent = "Creating account...";

    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: name });

      await setDoc(doc(db, "users", cred.user.uid), {
        name,
        email,
        phone,
        whatsapp,
        location,
        createdAt: serverTimestamp()
      });

      window.location.href = "index.html";
    } catch (err) {
      showMessage(msg, friendlyAuthError(err), "error");
      submitBtn.disabled = false;
      submitBtn.textContent = "Create account";
    }
  });
}

// ---- Login ----
const loginForm = document.getElementById("login-form");
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = document.getElementById("form-msg");
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    const submitBtn = loginForm.querySelector("button[type=submit]");
    submitBtn.disabled = true;
    submitBtn.textContent = "Logging in...";

    try {
      await signInWithEmailAndPassword(auth, email, password);
      const params = new URLSearchParams(window.location.search);
      window.location.href = params.get("next") || "index.html";
    } catch (err) {
      showMessage(msg, friendlyAuthError(err), "error");
      submitBtn.disabled = false;
      submitBtn.textContent = "Log in";
    }
  });
}

// ---- Logout (any element with data-logout) ----
document.querySelectorAll("[data-logout]").forEach((btn) => {
  btn.addEventListener("click", async (e) => {
    e.preventDefault();
    await signOut(auth);
    window.location.href = "index.html";
  });
});

// ---- Reflect login state in the header (nav links) ----
whenAuthReady((user) => {
  const guestLinks = document.querySelectorAll("[data-guest-only]");
  const userLinks = document.querySelectorAll("[data-user-only]");
  const userNameEls = document.querySelectorAll("[data-user-name]");

  guestLinks.forEach((el) => (el.style.display = user ? "none" : ""));
  userLinks.forEach((el) => (el.style.display = user ? "" : "none"));
  userNameEls.forEach((el) => {
    if (user) el.textContent = user.displayName || user.email;
  });

  if (user) loadAvatarProfile(user);
});

async function loadAvatarProfile(user) {
  const avatarInitial = document.getElementById("avatar-initial");
  const dropdownName = document.getElementById("dropdown-name");
  const dropdownPhone = document.getElementById("dropdown-phone");
  if (!avatarInitial && !dropdownName) return;

  const name = user.displayName || user.email || "?";
  if (avatarInitial) avatarInitial.textContent = name.trim().charAt(0).toUpperCase();
  if (dropdownName) dropdownName.textContent = name;

  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    if (snap.exists() && dropdownPhone) {
      dropdownPhone.textContent = snap.data().phone || "";
    }
  } catch (err) {
    console.error("Couldn't load profile for account menu:", err);
  }
}

// ---- Avatar dropdown open/close ----
const avatarBtn = document.getElementById("avatar-btn");
const accountDropdown = document.getElementById("account-dropdown");
if (avatarBtn && accountDropdown) {
  avatarBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    accountDropdown.classList.toggle("open");
  });
  document.addEventListener("click", (e) => {
    if (!accountDropdown.contains(e.target) && e.target !== avatarBtn) {
      accountDropdown.classList.remove("open");
    }
  });
  accountDropdown.querySelectorAll("a, button").forEach((el) => {
    el.addEventListener("click", () => accountDropdown.classList.remove("open"));
  });
}

// ---- Bottom nav: highlight the current section ----
const bnItems = document.querySelectorAll(".bottom-nav .bn-item");
if (bnItems.length) {
  const page = window.location.pathname.split("/").pop() || "index.html";
  const pageToTab = {
    "index.html": "home",
    "post-product.html": "post",
    "messages.html": "messages",
    "my-listings.html": "my-listings",
    "account.html": "account",
    "login.html": "account",
    "register.html": "account",
    "reset-password.html": "account",
    "contact.html": "contact"
  };
  const currentTab = pageToTab[page];
  if (currentTab) {
    bnItems.forEach((item) => {
      if (item.dataset.bn === currentTab) item.classList.add("active");
    });
  }
}

// ---- Mobile/tablet hamburger drawer ----
const menuToggle = document.getElementById("menu-toggle");
const drawer = document.getElementById("drawer");
const drawerOverlay = document.getElementById("drawer-overlay");
const drawerClose = document.getElementById("drawer-close");
const drawerCategories = document.getElementById("drawer-categories");

function openDrawer() {
  if (!drawer) return;
  drawer.classList.add("open");
  drawerOverlay.classList.add("open");
  menuToggle.setAttribute("aria-expanded", "true");
  document.body.style.overflow = "hidden";
}

function closeDrawer() {
  if (!drawer) return;
  drawer.classList.remove("open");
  drawerOverlay.classList.remove("open");
  menuToggle.setAttribute("aria-expanded", "false");
  document.body.style.overflow = "";
}

if (menuToggle && drawer) {
  menuToggle.addEventListener("click", openDrawer);
  drawerClose.addEventListener("click", closeDrawer);
  drawerOverlay.addEventListener("click", closeDrawer);
  drawer.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeDrawer));
}

if (drawerCategories) {
  drawerCategories.innerHTML = CATEGORIES.map((cat) => `
    <a href="index.html?category=${encodeURIComponent(cat)}">
      <span class="drawer-cat-dot"></span> ${cat}
    </a>`).join("");
}

// ---- Search bar (present on every page's header) ----
document.querySelectorAll(".search-form").forEach((form) => {
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const input = form.querySelector("input[type=text]");
    const term = input ? input.value.trim() : "";
    const url = new URL("index.html", window.location.href);
    if (term) url.searchParams.set("q", term);
    window.location.href = url.toString();
  });
});

// ---- Bottom nav "Search" tab: focus the search bar instead of navigating,
// if one is already visible on the current page ----
const bnSearchLink = document.getElementById("bn-search-link");
if (bnSearchLink) {
  bnSearchLink.addEventListener("click", (e) => {
    const input = document.getElementById("search-input");
    if (input) {
      e.preventDefault();
      input.scrollIntoView({ behavior: "smooth", block: "center" });
      input.focus();
    }
    // otherwise let it navigate to index.html?focus=search normally
  });
}

// If we've just arrived via that link, focus the search bar once loaded
if (new URLSearchParams(window.location.search).get("focus") === "search") {
  const input = document.getElementById("search-input");
  if (input) input.focus();
}

// ---- Forgot password ----
const resetForm = document.getElementById("reset-form");
if (resetForm) {
  resetForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = document.getElementById("form-msg");
    const email = document.getElementById("email").value.trim();
    const submitBtn = resetForm.querySelector("button[type=submit]");
    submitBtn.disabled = true;
    submitBtn.textContent = "Sending...";

    try {
      await sendPasswordResetEmail(auth, email);
      showMessage(msg, "Check your email for a link to reset your password. It can take a minute to arrive — check spam too.", "success");
      resetForm.reset();
    } catch (err) {
      // Don't reveal whether the email exists — same message either way
      showMessage(msg, "If that email is registered, a reset link has been sent.", "success");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Send reset link";
    }
  });
}

// ---- Password strength meter (register page) ----
const passwordInput = document.getElementById("password");
const strengthEl = document.getElementById("password-strength");
if (passwordInput && strengthEl) {
  passwordInput.addEventListener("input", () => {
    const val = passwordInput.value;
    if (!val) {
      strengthEl.innerHTML = "";
      return;
    }
    const { label, level } = passwordStrength(val);
    strengthEl.innerHTML = `
      <div class="strength-bar"><span class="strength-fill strength-${level}"></span></div>
      <span class="strength-label strength-text-${level}">${label}</span>`;
  });
}

function passwordStrength(pw) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;

  if (score <= 1) return { label: "Weak", level: "weak" };
  if (score <= 3) return { label: "Okay", level: "okay" };
  return { label: "Strong", level: "strong" };
}

function friendlyAuthError(err) {
  const code = err.code || "";
  if (code.includes("email-already-in-use")) return "That email is already registered. Try logging in instead.";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) return "Incorrect email or password.";
  if (code.includes("weak-password")) return "Password should be at least 8 characters.";
  if (code.includes("invalid-email")) return "That email address doesn't look right.";
  return "Something went wrong. Please try again.";
}
