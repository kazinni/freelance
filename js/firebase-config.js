// Firebase Configuration - VERIFIED WORKING
const firebaseConfig = {
    apiKey: "AIzaSyB9KqU0_wo1K2qEaAvRjR_A9qnGTbTMUQs",
    authDomain: "flexkazi-16c76.firebaseapp.com",
    databaseURL: "https://flexkazi-16c76-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "flexkazi-16c76",
    storageBucket: "flexkazi-16c76.firebasestorage.app",
    messagingSenderId: "1033093605227",
    appId: "1:1033093605227:web:099a8e30a4c1e040580e2e"
};

// Global variables
let app = null;
let auth = null;
let database = null;
let storage = null;

// Initialize Firebase with comprehensive error handling
try {
    console.log('🔥 Initializing Firebase...');
    console.log('Config:', JSON.stringify(firebaseConfig));
    
    // Check if Firebase is already initialized
    if (!firebase.apps.length) {
        app = firebase.initializeApp(firebaseConfig);
        console.log('✅ Firebase app initialized');
    } else {
        app = firebase.app();
        console.log('✅ Using existing Firebase app');
    }
    
    // Initialize services
    auth = firebase.auth();
    database = firebase.database();
    storage = firebase.storage();
    
    console.log('✅ Firebase services initialized');
    console.log('📊 Database URL:', firebaseConfig.databaseURL);
    
    // Test database connection
    const connectedRef = database.ref('.info/connected');
    connectedRef.on('value', (snap) => {
        if (snap.val() === true) {
            console.log('✅ Connected to Firebase Realtime Database');
        } else {
            console.warn('⚠️ Not connected to Firebase Database');
        }
    });
    
} catch (error) {
    console.error('❌ Firebase initialization failed:', error);
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
}

// Export for use in other files
window.firebaseApp = {
    app,
    auth,
    database,
    storage
};
