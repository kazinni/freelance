// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyB9KqU0_wo1K2qEaAvRjR_A9qnGTbTMUQs",
  authDomain: "flexkazi-16c76.firebaseapp.com",
  databaseURL: "https://flexkazi-16c76-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "flexkazi-16c76",
  storageBucket: "flexkazi-16c76.firebasestorage.app",
  messagingSenderId: "1033093605227",
  appId: "1:1033093605227:web:099a8e30a4c1e040580e2e"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = getDatabase(app);

export { app, auth, database };
