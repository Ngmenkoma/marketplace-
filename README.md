# Marketplace — Setup Guide

A multi-vendor marketplace where anyone can log in, post an item, and buyers
contact sellers directly via WhatsApp/phone. No cart, no payment — just
listings + direct contact, like Jiji/Tonaton.

## 1. Create a Firebase project

1. Go to https://console.firebase.google.com → **Add project**
2. Once created, click the **web icon (`</>`)** to register a web app
3. Copy the `firebaseConfig` object it gives you

## 2. Fill in your config

Open `js/firebase-config.js` and replace the placeholder values with your
real config:

```js
const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};
```

## 3. Enable Firebase services

In the Firebase Console:

- **Authentication** → Sign-in method → enable **Email/Password**
- **Firestore Database** → Create database → start in **production mode**
- **Storage** → Get started (for product photos)

## 4. Set Firestore security rules

Go to Firestore → Rules and use something like this to start:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
    match /products/{productId} {
      allow read: if true;
      allow create: if request.auth != null && request.auth.uid == request.resource.data.userId;
      allow update, delete: if request.auth != null && request.auth.uid == resource.data.userId;
    }
    match /reviews/{reviewId} {
      allow read: if true;
      allow create: if request.auth != null && request.auth.uid == request.resource.data.reviewerId;
      allow update, delete: if false;
    }
    match /conversations/{conversationId} {
      allow read, update: if request.auth != null && request.auth.uid in resource.data.participants;
      allow create: if request.auth != null && request.auth.uid in request.resource.data.participants;

      match /messages/{messageId} {
        allow read: if request.auth != null &&
          request.auth.uid in get(/databases/$(database)/documents/conversations/$(conversationId)).data.participants;
        allow create: if request.auth != null && request.auth.uid == request.resource.data.senderId;
      }
    }
    match /contactMessages/{messageId} {
      allow create: if true;
      allow read, update, delete: if false;
    }
  }
}
```

## 5. Set Storage security rules

Go to Storage → Rules:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /products/{userId}/{fileName} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## 6. Run it locally

Because this uses ES modules (`type="module"`), you can't just double-click
the HTML files — open them through a local server, e.g. in VS Code install
the **Live Server** extension, right-click `index.html` → "Open with Live
Server".

## 7. Deploy

Push to GitHub and deploy on Vercel like your other projects (drag-and-drop
also works, since it's a static site — no backend build step needed).

## What's included

- `index.html` — homepage, category sidebar, search, listing grid
- `login.html` / `register.html` — auth pages (registration also collects
  phone/WhatsApp/location, which become the seller's contact info)
- `post-product.html` — logged-in users post an item with photos and an
  optional discount percentage (offer price is calculated automatically)
- `product-details.html` — full listing + seller's WhatsApp/call button,
  a "Message seller" button for in-site chat, and a reviews section;
  if you're the owner, you'll also see "Mark as sold" / "Delete" controls
- `my-listings.html` — manage everything you've posted: mark items sold,
  reactivate them, or delete them for good
- `messages.html` — your inbox + real-time chat with buyers/sellers
- `js/firebase-config.js` — your Firebase keys go here
- `js/categories.js` — the shared category list (used by the post form, homepage sidebar, and hamburger drawer)
- `js/auth.js` — register/login/logout, header login-state, the hamburger drawer, and the search bar (present on every page)
- `js/products.js` — post/browse/filter/view/manage listings
- `js/reviews.js` — submit and display seller reviews (star ratings), including a bulk lookup used on the listing grid
- `js/messages.js` — start a conversation, real-time inbox + chat
- `js/main.js` — homepage-only: builds the sidebar category list

### Matching Jumia's mobile styling

The header, hamburger menu, search bar, and product cards were restyled to
closely match Jumia Ghana's mobile site:

- Below ~860px, the header collapses to a hamburger icon + compact
  account/messages icon buttons (replacing the full text nav, which only
  shows on desktop).
- The hamburger opens a **left slide-in drawer** (not a dropdown) with an
  account section up top and a scrollable category list below — same
  structure as Jumia's menu.
- The search bar is a full pill shape; below 680px the button collapses to
  a magnifying-glass icon only.
- Listing cards show a discount badge, seller star rating (averaged in
  bulk across the grid to avoid one query per card), and a full-width
  orange "View item" button at the bottom.
- A breadcrumb ("Home › Category") appears on the homepage when filtered
  and on the product details page.

Two things intentionally don't have a literal Jumia equivalent, since your
site works differently: there's no "Pay on Delivery" badge (no payment
system exists) and no cart (contact is direct, off-platform). Product
cards show a "💬 Message seller directly" tag in the same visual spot
instead.

### Removing a listing

- **Mark as sold** keeps the listing in your account (under My Listings)
  but hides it from the public homepage/search — good for "sold but I want
  a record of it."
- **Delete** removes it from Firestore permanently. Note: this does not
  currently delete the associated photos from Firebase Storage (they're
  just orphaned, harmless, low-cost) — a nice future improvement would be
  a Cloud Function that cleans those up on delete.

## Firestore data shape

```
users/{uid}        → name, email, phone, whatsapp, location, createdAt
products/{id}      → title, description, price, discountPercent, condition,
                      category, imageUrls[], status, userId, createdAt
reviews/{id}       → sellerId, reviewerId, reviewerName, rating (1-5),
                      comment, createdAt
conversations/{id} → participants[uid1,uid2], participantNames{},
                      productId, productTitle, lastMessage, lastMessageAt
  /messages/{id}   → senderId, text, createdAt
```

Conversation IDs are deterministic — the two participants' uids, sorted
and joined with `_`. This means two people only ever get one conversation
thread with each other, no matter which listing started it.

## Reviews & messaging notes

- Reviews are tied to the **seller**, not a specific product — one seller
  rating shows on every listing they post.
- Someone can't review themselves, and needs to be logged in to leave a
  review or send a message.
- Chat updates in real time using Firestore's `onSnapshot` — no page
  refresh needed while a conversation is open.
