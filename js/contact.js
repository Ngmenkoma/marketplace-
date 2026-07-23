// ==========================================================================
// Contact form: saves messages to a "contactMessages" collection in
// Firestore. Doesn't require the sender to be logged in.
// ==========================================================================

import { db, auth } from "./firebase-config.js";
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const form = document.getElementById("contact-form");
if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = document.getElementById("form-msg");
    const submitBtn = form.querySelector("button[type=submit]");
    submitBtn.disabled = true;
    submitBtn.textContent = "Sending...";

    try {
      const name = document.getElementById("name").value.trim();
      const email = document.getElementById("email").value.trim();
      const message = document.getElementById("message").value.trim();

      await addDoc(collection(db, "contactMessages"), {
        name,
        email,
        message,
        userId: auth.currentUser ? auth.currentUser.uid : null,
        createdAt: serverTimestamp()
      });

      msg.textContent = "Thanks — your message has been sent. We'll get back to you soon.";
      msg.className = "form-msg show success";
      form.reset();
    } catch (err) {
      console.error(err);
      msg.textContent = "Couldn't send your message. Please try again, or reach us on WhatsApp above.";
      msg.className = "form-msg show error";
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Send message";
    }
  });
}
