// assets/js/firebase-init.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-database.js";

// TODO: replace with your Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyBw1OvbGUrwcJMUM7DI__maceCZMjMYf9I",
  authDomain: "ridercms-ced94.firebaseapp.com",
  databaseURL: "https://ridercms-ced94-default-rtdb.firebaseio.com",
  projectId: "ridercms-ced94",
  storageBucket: "ridercms-ced94.appspot.com",
  messagingSenderId: "194585815067",
  appId: "1:194585815067:web:297f2ecef3c7018ca670be"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);
