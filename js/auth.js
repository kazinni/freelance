import { auth, database } from './firebase-config.js';
import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword,
    sendPasswordResetEmail 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { ref, set, get } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// Wait for DOM to load
document.addEventListener('DOMContentLoaded', function() {
    console.log("Auth.js loaded - DOM ready");
    
    // Check if we're on login page
    if (document.getElementById('loginForm')) {
        console.log("Login page detected");
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

    // LOGIN FORM SUBMISSION
    const loginForm = document.getElementById('loginForm');
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        console.log("Login form submitted");
        
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;
        
        try {
            showNotification('Logging in...', 'info');
            
            // Attempt to sign in
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            console.log("Login successful:", userCredential.user.uid);
            
            // Check if user profile exists
            const userRef = ref(database, `users/${userCredential.user.uid}`);
            const snapshot = await get(userRef);
            
            if (!snapshot.exists()) {
                console.log("User profile doesn't exist, creating one...");
                // Create user profile if it doesn't exist
                await createUserProfile(userCredential.user, {
                    full_name: userCredential.user.email.split('@')[0], // Default name from email
                    email_address: userCredential.user.email,
                    phone_number: '',
                    city_location: ''
                });
            }
            
            showNotification('Login successful! Redirecting...', 'success');
            
            // Redirect to dashboard
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 1500);
            
        } catch (error) {
            console.error("Login error:", error);
            
            // Handle specific error codes
            let errorMessage = "Login failed. ";
            switch(error.code) {
                case 'auth/user-not-found':
                    errorMessage += "User not found. Please sign up first.";
                    break;
                case 'auth/wrong-password':
                    errorMessage += "Incorrect password.";
                    break;
                case 'auth/invalid-email':
                    errorMessage += "Invalid email address.";
                    break;
                case 'auth/too-many-requests':
                    errorMessage += "Too many failed attempts. Try again later.";
                    break;
                default:
                    errorMessage += error.message;
            }
            
            showNotification(errorMessage, 'error');
        }
    });

    // SIGNUP FORM SUBMISSION
    const signupForm = document.getElementById('signupForm');
    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        console.log("Signup form submitted");
        
        const name = document.getElementById('signupName').value;
        const email = document.getElementById('signupEmail').value;
        const phone = document.getElementById('signupPhone').value;
        const city = document.getElementById('signupCity').value;
        const password = document.getElementById('signupPassword').value;
        const confirmPassword = document.getElementById('signupConfirmPassword').value;
        
        // Validate passwords match
        if (password !== confirmPassword) {
            showNotification('Passwords do not match!', 'error');
            return;
        }
        
        // Validate password strength
        if (password.length < 6) {
            showNotification('Password must be at least 6 characters!', 'error');
            return;
        }
        
        try {
            showNotification('Creating account...', 'info');
            
            // Create user in Firebase Auth
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            console.log("User created in Auth:", userCredential.user.uid);
            
            // Create user profile in Realtime Database
            await createUserProfile(userCredential.user, {
                full_name: name,
                email_address: email,
                phone_number: phone,
                city_location: city
            });
            
            console.log("User profile created successfully");
            showNotification('Account created successfully! Redirecting...', 'success');
            
            // Redirect to dashboard
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 1500);
            
        } catch (error) {
            console.error("Signup error:", error);
            
            // Handle specific error codes
            let errorMessage = "Signup failed. ";
            switch(error.code) {
                case 'auth/email-already-in-use':
                    errorMessage += "Email already in use. Please login instead.";
                    break;
                case 'auth/invalid-email':
                    errorMessage += "Invalid email address.";
                    break;
                case 'auth/weak-password':
                    errorMessage += "Password is too weak. Use at least 6 characters.";
                    break;
                default:
                    errorMessage += error.message;
            }
            
            showNotification(errorMessage, 'error');
        }
    });

    // Forgot password
    const forgotPassword = document.getElementById('forgotPassword');
    if (forgotPassword) {
        forgotPassword.addEventListener('click', async (e) => {
            e.preventDefault();
            
            const email = prompt('Please enter your email address to reset password:');
            if (email) {
                try {
                    await sendPasswordResetEmail(auth, email);
                    showNotification('Password reset email sent! Check your inbox.', 'success');
                } catch (error) {
                    console.error("Password reset error:", error);
                    showNotification('Error sending reset email: ' + error.message, 'error');
                }
            }
        });
    }
}

// Function to create user profile in database
async function createUserProfile(user, additionalData) {
    const userRef = ref(database, `users/${user.uid}`);
    
    // Complete user profile matching your JSON structure
    const userData = {
        personal: {
            full_name: additionalData.full_name || '',
            email_address: additionalData.email_address || user.email,
            phone_number: additionalData.phone_number || '',
            city_location: additionalData.city_location || '',
            joined_timestamp: Date.now()
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
    
    // Also initialize user_tasks node
    const userTasksRef = ref(database, `user_tasks/${user.uid}`);
    const userTasksData = {
        assigned_tasks: {},
        completed_tasks: {},
        stats: {
            tasks_in_progress: 0,
            tasks_available: 0,
            tasks_completed: 0,
            total_earned: 0,
            average_rating: 0
        }
    };
    
    await set(userTasksRef, userTasksData);
    
    // Update site statistics
    try {
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
    } catch (error) {
        console.error("Error updating site statistics:", error);
        // Non-critical error, don't throw
    }
    
    return userData;
}

// Notification function
function showNotification(message, type = 'info') {
    console.log(`Notification (${type}): ${message}`);
    
    let notification = document.getElementById('notification');
    if (!notification) {
        notification = document.createElement('div');
        notification.id = 'notification';
        document.body.appendChild(notification);
    }
    
    notification.textContent = message;
    notification.className = `notification ${type}`;
    notification.style.display = 'block';
    notification.style.opacity = '1';
    
    // Style the notification
    notification.style.position = 'fixed';
    notification.style.top = '20px';
    notification.style.right = '20px';
    notification.style.padding = '15px 25px';
    notification.style.borderRadius = '8px';
    notification.style.zIndex = '9999';
    notification.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    notification.style.transition = 'all 0.3s ease';
    
    // Set colors based on type
    if (type === 'success') {
        notification.style.backgroundColor = '#4caf50';
        notification.style.color = 'white';
    } else if (type === 'error') {
        notification.style.backgroundColor = '#f44336';
        notification.style.color = 'white';
    } else {
        notification.style.backgroundColor = '#2196f3';
        notification.style.color = 'white';
    }
    
    // Auto hide after 3 seconds
    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => {
            notification.style.display = 'none';
        }, 300);
    }, 3000);
}
