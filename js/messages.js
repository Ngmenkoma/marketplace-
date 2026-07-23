// ==========================================================================
// Messages: direct in-site chat between a buyer and a seller
// Conversation id is deterministic: the two user ids, sorted and joined.
// ==========================================================================

import { auth, db, whenAuthReady } from "./firebase-config.js";
import {
  doc,
  getDoc,
  setDoc,
  collection,
  addDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

function conversationId(uidA, uidB) {
  return [uidA, uidB].sort().join("_");
}

// Called from product-details.html's "Message seller" button.
// Creates the conversation doc if it doesn't exist yet, then redirects.
export async function openConversationWith(sellerId, sellerName, context = {}) {
  const user = auth.currentUser;
  if (!user) {
    window.location.href = `login.html?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    return;
  }
  if (user.uid === sellerId) return;

  const cId = conversationId(user.uid, sellerId);
  const ref = doc(db, "conversations", cId);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    await setDoc(ref, {
      participants: [user.uid, sellerId],
      participantNames: {
        [user.uid]: user.displayName || "Buyer",
        [sellerId]: sellerName || "Seller"
      },
      productTitle: context.productTitle || null,
      productId: context.productId || null,
      lastMessage: "",
      lastMessageAt: serverTimestamp()
    });
  }

  window.location.href = `messages.html?c=${cId}`;
}

// ---- Messages page (messages.html): inbox + open chat ----
const inboxList = document.getElementById("inbox-list");
const chatPanel = document.getElementById("chat-panel");

if (inboxList || chatPanel) {
  whenAuthReady((user) => {
    if (!user) {
      window.location.href = "login.html?next=messages.html";
      return;
    }
    if (inboxList) loadInbox(user.uid);

    const params = new URLSearchParams(window.location.search);
    const cId = params.get("c");
    if (chatPanel && cId) openChat(cId, user.uid);
    else if (chatPanel) {
      chatPanel.innerHTML = `<div class="empty-state"><h3>Select a conversation</h3><p>Pick someone from your inbox to see the chat here.</p></div>`;
    }
  });
}

async function loadInbox(uid) {
  inboxList.innerHTML = `<p class="mono">Loading conversations…</p>`;
  const q = query(collection(db, "conversations"), where("participants", "array-contains", uid), orderBy("lastMessageAt", "desc"));

  onSnapshot(q, (snap) => {
    if (snap.empty) {
      inboxList.innerHTML = `<div class="empty-state"><h3>No conversations yet</h3><p>Message a seller from a product page to start chatting.</p></div>`;
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const activeId = params.get("c");

    inboxList.innerHTML = snap.docs.map((d) => {
      const c = d.data();
      const otherUid = c.participants.find((p) => p !== uid);
      const otherName = c.participantNames?.[otherUid] || "User";
      const active = d.id === activeId ? "active" : "";
      return `
        <a class="inbox-item ${active}" href="messages.html?c=${d.id}">
          <strong>${escapeHtml(otherName)}</strong>
          ${c.productTitle ? `<span class="mono">${escapeHtml(c.productTitle)}</span>` : ""}
          <p>${escapeHtml(c.lastMessage || "No messages yet")}</p>
        </a>`;
    }).join("");
  });
}

async function openChat(cId, uid) {
  const ref = doc(db, "conversations", cId);
  const snap = await getDoc(ref);
  if (!snap.exists() || !snap.data().participants.includes(uid)) {
    chatPanel.innerHTML = `<div class="empty-state"><h3>Conversation not found</h3></div>`;
    return;
  }
  const c = snap.data();
  const otherUid = c.participants.find((p) => p !== uid);
  const otherName = c.participantNames?.[otherUid] || "User";

  chatPanel.innerHTML = `
    <div class="chat-head">
      <strong>${escapeHtml(otherName)}</strong>
      ${c.productTitle ? `<span class="mono">Re: ${escapeHtml(c.productTitle)}</span>` : ""}
    </div>
    <div class="chat-messages" id="chat-messages"><p class="mono">Loading messages…</p></div>
    <form class="chat-input" id="chat-form">
      <input type="text" id="chat-text" placeholder="Type a message…" autocomplete="off" required>
      <button type="submit" class="btn btn-primary" style="width:auto;">Send</button>
    </form>`;

  const messagesEl = document.getElementById("chat-messages");
  const q = query(collection(db, "conversations", cId, "messages"), orderBy("createdAt", "asc"));

  onSnapshot(q, (snap) => {
    if (snap.empty) {
      messagesEl.innerHTML = `<p class="mono">Say hello 👋</p>`;
      return;
    }
    messagesEl.innerHTML = snap.docs.map((d) => {
      const m = d.data();
      const mine = m.senderId === uid;
      return `<div class="bubble ${mine ? "mine" : ""}">${escapeHtml(m.text)}</div>`;
    }).join("");
    messagesEl.scrollTop = messagesEl.scrollHeight;
  });

  document.getElementById("chat-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("chat-text");
    const text = input.value.trim();
    if (!text) return;
    input.value = "";

    await addDoc(collection(db, "conversations", cId, "messages"), {
      senderId: uid,
      text,
      createdAt: serverTimestamp()
    });
    await setDoc(doc(db, "conversations", cId), {
      lastMessage: text,
      lastMessageAt: serverTimestamp()
    }, { merge: true });
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}
