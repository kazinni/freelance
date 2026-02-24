// Firebase Configuration
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
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const database = firebase.database();
const storage = firebase.storage();

// Export for use in other files
window.firebaseApp = {
    auth,
    database,
    storage
};
