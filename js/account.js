// ==========================================================================
// Account page: view/edit profile info (name, phone, WhatsApp, location)
// ==========================================================================

import { auth, db, whenAuthReady } from "./firebase-config.js";
import { updateProfile } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const form = document.getElementById("account-form");
if (form) {
  whenAuthReady(async (user) => {
    if (!user) {
      window.location.href = "login.html?next=account.html";
      return;
    }

    document.getElementById("email-display").value = user.email || "";

    try {
      const snap = await getDoc(doc(db, "users", user.uid));
      const data = snap.exists() ? snap.data() : {};
      document.getElementById("name").value = data.name || user.displayName || "";
      document.getElementById("phone").value = data.phone || "";
      document.getElementById("whatsapp").value = data.whatsapp || "";
      document.getElementById("location").value = data.location || "";
    } catch (err) {
      console.error(err);
    }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) return;

    const msg = document.getElementById("form-msg");
    const submitBtn = form.querySelector("button[type=submit]");
    submitBtn.disabled = true;
    submitBtn.textContent = "Saving...";

    try {
      const name = document.getElementById("name").value.trim();
      const phone = document.getElementById("phone").value.trim();
      const whatsapp = document.getElementById("whatsapp").value.trim() || phone;
      const location = document.getElementById("location").value.trim();

      await updateDoc(doc(db, "users", user.uid), { name, phone, whatsapp, location });
      if (name !== user.displayName) {
        await updateProfile(user, { displayName: name });
      }

      msg.textContent = "Saved! Your listings will now show these updated details.";
      msg.className = "form-msg show success";
    } catch (err) {
      console.error(err);
      msg.textContent = "Couldn't save your changes. Please try again.";
      msg.className = "form-msg show error";
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Save changes";
    }
  });
}
