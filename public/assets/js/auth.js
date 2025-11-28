// assets/js/auth.js
import { auth } from "./firebase-init.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";

// Guard: require login for all pages except login.html
if (!location.pathname.endsWith("/login.html") && !location.pathname.endsWith("login.html")) {
  onAuthStateChanged(auth, (user) => {
    if (!user) location.href = "login.html";
  });
}

// Logout button (if present)
document.getElementById("logoutBtn")?.addEventListener("click", async () => {
  await signOut(auth);
  location.href = "login.html";
});
