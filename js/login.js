// Initialize auth state observer
firebase.auth().onAuthStateChanged((user) => {
    if (user) {
        // User is signed in, redirect to profile
        window.location.href = 'profile.html';
    }
});

// Show message function
function showMessage(elementId, type, text) {
    const messageEl = document.getElementById(elementId);
    messageEl.className = `message ${type} show`;
    messageEl.innerHTML = `<i class="fas ${type === 'error' ? 'fa-exclamation-circle' : type === 'success' ? 'fa-check-circle' : 'fa-info-circle'}"></i> ${text}`;
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
        messageEl.classList.remove('show');
    }, 5000);
}

// Toggle between forms
function showSignIn() {
    document.getElementById('loginForm').classList.add('active');
    document.getElementById('signupForm').classList.remove('active');
    document.getElementById('resetForm').classList.remove('active');
}

function showSignUp() {
    document.getElementById('signupForm').classList.add('active');
    document.getElementById('loginForm').classList.remove('active');
    document.getElementById('resetForm').classList.remove('active');
}

function showResetPassword() {
    document.getElementById('resetForm').classList.add('active');
    document.getElementById('loginForm').classList.remove('active');
    document.getElementById('signupForm').classList.remove('active');
}

// Validate email format
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// Validate phone number (basic validation)
function isValidPhone(phone) {
    const phoneRegex = /^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/;
    return phoneRegex.test(phone);
}

// Handle Sign In
async function handleSignIn(event) {
    event.preventDefault();
    
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const signInBtn = document.getElementById('signInBtn');
    
    try {
        // Validate inputs
        if (!email || !password) {
            throw new Error('Please enter both email and password');
        }
        
        if (!isValidEmail(email)) {
            throw new Error('Please enter a valid email address');
        }
        
        // Show loading state
        signInBtn.disabled = true;
        signInBtn.innerHTML = '<span class="spinner"></span> Signing In...';
        
        // Attempt sign in
        const userCredential = await firebase.auth().signInWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        // Check if user exists in database
        const userSnapshot = await firebase.database().ref(`users/${user.uid}`).once('value');
        
        if (!userSnapshot.exists()) {
            // Create user profile if it doesn't exist
            await firebase.database().ref(`users/${user.uid}`).set({
                personal: {
                    full_name: user.displayName || 'Freelancer',
                    email_address: user.email,
                    joined_timestamp: Date.now()
                },
                account_state: 'active',
                system_data: {
                    signup_source: 'email',
                    last_login: Date.now()
                }
            });
        } else {
            // Update last login
            await firebase.database().ref(`users/${user.uid}/system_data/last_login`).set(Date.now());
        }
        
        // Redirect will happen automatically via onAuthStateChanged
        showMessage('loginMessage', 'success', 'Sign in successful! Redirecting...');
        
    } catch (error) {
        console.error('Sign in error:', error);
        
        let errorMessage = 'Failed to sign in';
        switch (error.code) {
            case 'auth/user-not-found':
                errorMessage = 'No account found with this email';
                break;
            case 'auth/wrong-password':
                errorMessage = 'Incorrect password';
                break;
            case 'auth/invalid-email':
                errorMessage = 'Invalid email address';
                break;
            case 'auth/user-disabled':
                errorMessage = 'This account has been disabled';
                break;
            case 'auth/too-many-requests':
                errorMessage = 'Too many failed attempts. Please try again later';
                break;
            default:
                errorMessage = error.message;
        }
        
        showMessage('loginMessage', 'error', errorMessage);
        
        // Reset button
        signInBtn.disabled = false;
        signInBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Sign In';
    }
}

// Handle Sign Up
async function handleSignUp(event) {
    event.preventDefault();
    
    const fullName = document.getElementById('fullName').value.trim();
    const email = document.getElementById('signupEmail').value.trim();
    const phone = document.getElementById('phoneNumber').value.trim();
    const location = document.getElementById('location').value;
    const category = document.getElementById('category').value;
    const skills = document.getElementById('skills').value.trim();
    const experience = document.getElementById('experience').value;
    const rate = document.getElementById('rate').value;
    const password = document.getElementById('signupPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const terms = document.getElementById('terms').checked;
    
    const signUpBtn = document.getElementById('signUpBtn');
    
    try {
        // Validate all fields
        const requiredFields = [
            { value: fullName, name: 'Full name' },
            { value: email, name: 'Email' },
            { value: phone, name: 'Phone number' },
            { value: location, name: 'Location' },
            { value: category, name: 'Category' },
            { value: skills, name: 'Skills' },
            { value: experience, name: 'Experience' },
            { value: rate, name: 'Hourly rate' },
            { value: password, name: 'Password' },
            { value: confirmPassword, name: 'Confirm password' }
        ];
        
        for (let field of requiredFields) {
            if (!field.value) {
                throw new Error(`Please enter your ${field.name}`);
            }
        }
        
        if (!terms) {
            throw new Error('Please accept the Terms of Service');
        }
        
        // Validate formats
        if (!isValidEmail(email)) {
            throw new Error('Please enter a valid email address');
        }
        
        if (!isValidPhone(phone)) {
            throw new Error('Please enter a valid phone number');
        }
        
        if (password.length < 6) {
            throw new Error('Password must be at least 6 characters');
        }
        
        if (password !== confirmPassword) {
            throw new Error('Passwords do not match');
        }
        
        if (rate <= 0) {
            throw new Error('Please enter a valid hourly rate');
        }
        
        // Show loading state
        signUpBtn.disabled = true;
        signUpBtn.innerHTML = '<span class="spinner"></span> Creating Account...';
        
        // Create user in Firebase Auth
        const userCredential = await firebase.auth().createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        // Update profile with display name
        await user.updateProfile({
            displayName: fullName
        });
        
        // Prepare user data for database - matching the structure from the backend
        const userData = {
            personal: {
                full_name: fullName,
                email_address: email,
                phone_number: phone,
                city_location: location,
                joined_timestamp: Date.now()
            },
            professional: {
                main_category: category,
                skill_set: skills,
                experience_level: experience,
                rate_per_hour: parseInt(rate),
                hours_per_week: "20_to_30" // Default value
            },
            settings: {
                preferred_project_type: "project_based", // Default
                work_mode: "remote" // Default
            },
            account_state: "pending_verification",
            system_data: {
                signup_source: "web_form",
                last_login: Date.now(),
                browser_info: navigator.userAgent.replace(/[^a-zA-Z0-9]/g, '_')
            }
        };
        
        // Save user data to Realtime Database
        await firebase.database().ref(`users/${user.uid}`).set(userData);
        
        // Update work categories
        await firebase.database().ref(`work_categories/${category}/freelancer_list/${user.uid}`).set(true);
        
        // Increment member count
        await firebase.database().ref(`work_categories/${category}/member_count`).transaction((current) => {
            return (current || 0) + 1;
        });
        
        // Update site statistics
        await firebase.database().ref('site_statistics/total_members').transaction((current) => {
            return (current || 0) + 1;
        });
        
        await firebase.database().ref('site_statistics/awaiting_review').transaction((current) => {
            return (current || 0) + 1;
        });
        
        await firebase.database().ref('site_statistics/last_update_time').set(Date.now());
        
        // Create verification item
        await firebase.database().ref(`verification_items/${user.uid}`).set({
            request_time: Date.now(),
            document_list: "pending",
            current_status: "pending"
        });
        
        showMessage('signupMessage', 'success', 'Account created successfully! Redirecting...');
        
        // Redirect will happen automatically via onAuthStateChanged
        
    } catch (error) {
        console.error('Sign up error:', error);
        
        let errorMessage = 'Failed to create account';
        switch (error.code) {
            case 'auth/email-already-in-use':
                errorMessage = 'This email is already registered';
                break;
            case 'auth/invalid-email':
                errorMessage = 'Invalid email address';
                break;
            case 'auth/weak-password':
                errorMessage = 'Password is too weak';
                break;
            default:
                errorMessage = error.message;
        }
        
        showMessage('signupMessage', 'error', errorMessage);
        
        // Reset button
        signUpBtn.disabled = false;
        signUpBtn.innerHTML = '<i class="fas fa-user-plus"></i> Create Account';
    }
}

// Handle Reset Password
async function handleResetPassword(event) {
    event.preventDefault();
    
    const email = document.getElementById('resetEmail').value.trim();
    const resetBtn = document.getElementById('resetBtn');
    
    try {
        if (!email) {
            throw new Error('Please enter your email address');
        }
        
        if (!isValidEmail(email)) {
            throw new Error('Please enter a valid email address');
        }
        
        // Show loading state
        resetBtn.disabled = true;
        resetBtn.innerHTML = '<span class="spinner"></span> Sending...';
        
        // Send password reset email
        await firebase.auth().sendPasswordResetEmail(email);
        
        showMessage('resetMessage', 'success', 'Password reset email sent! Check your inbox.');
        
        // Clear form
        document.getElementById('resetEmail').value = '';
        
        // Reset button after 3 seconds
        setTimeout(() => {
            resetBtn.disabled = false;
            resetBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Reset Link';
        }, 3000);
        
    } catch (error) {
        console.error('Reset password error:', error);
        
        let errorMessage = 'Failed to send reset email';
        switch (error.code) {
            case 'auth/user-not-found':
                errorMessage = 'No account found with this email';
                break;
            case 'auth/invalid-email':
                errorMessage = 'Invalid email address';
                break;
            default:
                errorMessage = error.message;
        }
        
        showMessage('resetMessage', 'error', errorMessage);
        
        // Reset button
        resetBtn.disabled = false;
        resetBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Reset Link';
    }
}

// Handle Google Sign In (optional)
async function handleGoogleSignIn() {
    try {
        const provider = new firebase.auth.GoogleAuthProvider();
        await firebase.auth().signInWithPopup(provider);
    } catch (error) {
        console.error('Google sign in error:', error);
        showMessage('loginMessage', 'error', 'Failed to sign in with Google');
    }
}

// Make functions globally available
window.showSignIn = showSignIn;
window.showSignUp = showSignUp;
window.showResetPassword = showResetPassword;
window.handleSignIn = handleSignIn;
window.handleSignUp = handleSignUp;
window.handleResetPassword = handleResetPassword;
window.handleGoogleSignIn = handleGoogleSignIn;
