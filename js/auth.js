import { auth, database } from './firebase-config.js';
import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword,
    sendPasswordResetEmail,
    signOut,
    onAuthStateChanged 
} from 'firebase/auth';
import { ref, set, get, child } from 'firebase/database';

// DOM Elements
document.addEventListener('DOMContentLoaded', () => {
    // Check if user is already logged in
    onAuthStateChanged(auth, (user) => {
        if (user) {
            // User is signed in, redirect to dashboard if on login page
            if (window.location.pathname.includes('index.html') || window.location.pathname === '/') {
                window.location.href = 'dashboard.html';
            }
        } else {
            // User is signed out, redirect to login if on protected page
            if (!window.location.pathname.includes('index.html') && window.location.pathname !== '/') {
                window.location.href = 'index.html';
            }
        }
    });

    // Initialize login page elements if on login page
    if (document.getElementById('loginForm')) {
        initializeLoginPage();
    }
});

function initializeLoginPage() {
    // Tab switching
    const tabBtns = document.querySelectorAll('.tab-btn');
    const forms = document.querySelectorAll('.auth-form');
    
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            forms.forEach(form => form.classList.remove('active'));
            if (tab === 'login') {
                document.getElementById('loginForm').classList.add('active');
            } else {
                document.getElementById('signupForm').classList.add('active');
            }
        });
    });

    // Login form submission
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;
        
        try {
            showNotification('Logging in...', 'info');
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            
            // Check if user profile exists in database
            const userRef = ref(database, `users/${userCredential.user.uid}`);
            const snapshot = await get(userRef);
            
            if (snapshot.exists()) {
                showNotification('Login successful!', 'success');
                window.location.href = 'dashboard.html';
            } else {
                // Create basic user profile if it doesn't exist
                await createUserProfile(userCredential.user);
                showNotification('Login successful!', 'success');
                window.location.href = 'dashboard.html';
            }
        } catch (error) {
            showNotification(error.message, 'error');
        }
    });

    // Signup form submission
    document.getElementById('signupForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const name = document.getElementById('signupName').value;
        const email = document.getElementById('signupEmail').value;
        const phone = document.getElementById('signupPhone').value;
        const city = document.getElementById('signupCity').value;
        const password = document.getElementById('signupPassword').value;
        const confirmPassword = document.getElementById('signupConfirmPassword').value;
        
        if (password !== confirmPassword) {
            showNotification('Passwords do not match!', 'error');
            return;
        }
        
        try {
            showNotification('Creating account...', 'info');
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            
            // Create user profile in database
            await createUserProfile(userCredential.user, {
                full_name: name,
                email_address: email,
                phone_number: phone,
                city_location: city,
                joined_timestamp: Date.now()
            });
            
            showNotification('Account created successfully!', 'success');
            window.location.href = 'dashboard.html';
        } catch (error) {
            showNotification(error.message, 'error');
        }
    });

    // Forgot password
    document.getElementById('forgotPassword').addEventListener('click', async (e) => {
        e.preventDefault();
        
        const email = prompt('Please enter your email address:');
        if (email) {
            try {
                await sendPasswordResetEmail(auth, email);
                showNotification('Password reset email sent!', 'success');
            } catch (error) {
                showNotification(error.message, 'error');
            }
        }
    });

    // Social login buttons (placeholder)
    document.querySelectorAll('.social-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            showNotification('Social login coming soon!', 'info');
        });
    });
}

async function createUserProfile(user, additionalData = {}) {
    const userRef = ref(database, `users/${user.uid}`);
    
    const userData = {
        personal: {
            full_name: additionalData.full_name || '',
            email_address: additionalData.email_address || user.email,
            phone_number: additionalData.phone_number || '',
            city_location: additionalData.city_location || '',
            joined_timestamp: additionalData.joined_timestamp || Date.now()
        },
        professional: {
            main_category: '',
            skill_set: '',
            experience_level: '',
            rate_per_hour: 0,
            hours_per_week: ''
        },
        files: {
            cv_file_url: '',
            id_file_url: '',
            certificates_urls: '',
            verification_status: false
        },
        settings: {
            preferred_project_type: 'project_based',
            work_mode: 'remote'
        },
        account_state: 'pending_verification',
        system_data: {
            signup_source: 'web_app',
            visitor_ip: '',
            browser_info: navigator.userAgent
        }
    };
    
    await set(userRef, userData);
    
    // Update site statistics
    const statsRef = ref(database, 'site_statistics');
    const statsSnapshot = await get(statsRef);
    
    if (statsSnapshot.exists()) {
        const stats = statsSnapshot.val();
        await set(statsRef, {
            ...stats,
            total_members: (stats.total_members || 0) + 1,
            awaiting_review: (stats.awaiting_review || 0) + 1,
            last_update_time: Date.now()
        });
    } else {
        await set(statsRef, {
            total_members: 1,
            awaiting_review: 1,
            approved_members: 0,
            last_update_time: Date.now()
        });
    }
}

// Logout function
export async function logout() {
    try {
        await signOut(auth);
        window.location.href = 'index.html';
    } catch (error) {
        showNotification(error.message, 'error');
    }
}

// Notification function
function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    if (notification) {
        notification.textContent = message;
        notification.className = `notification ${type}`;
        notification.classList.add('show');
        
        setTimeout(() => {
            notification.classList.remove('show');
        }, 3000);
    } else {
        alert(message);
    }
}

// Add logout button handler
document.addEventListener('DOMContentLoaded', () => {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            logout();
        });
    }
});
