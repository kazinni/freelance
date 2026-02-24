// Global variables
let currentUser = null;
let userData = null;
let userTasks = {
    priority: [],
    assigned: [],
    inProgress: [],
    completed: []
};
let allAvailableTasks = [];

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Page loaded, initializing...');
    initializeApp();
});

// Initialize app
async function initializeApp() {
    try {
        // Show loading state
        showLoading(true);
        
        // Check authentication
        await checkAuth();
        
    } catch (error) {
        console.error('❌ Initialization error:', error);
        showNotification('Failed to initialize app', 'error');
        showLoading(false);
    }
}

// Check authentication state
function checkAuth() {
    return new Promise((resolve, reject) => {
        const unsubscribe = firebase.auth().onAuthStateChanged(async (user) => {
            unsubscribe(); // Stop listening after first response
            
            if (user) {
                console.log('✅ User authenticated:', user.uid);
                currentUser = user;
                
                try {
                    // Load all data in parallel
                    await Promise.all([
                        loadUserData(),
                        loadUserTasks(),
                        loadAvailableTasks()
                    ]);
                    
                    console.log('✅ All data loaded successfully');
                    
                    // Update UI
                    updateUI();
                    
                    // Hide loading
                    showLoading(false);
                    
                    // Setup realtime listeners
                    setupRealtimeListeners();
                    
                    resolve();
                } catch (error) {
                    console.error('❌ Error loading data:', error);
                    showNotification('Error loading dashboard data', 'error');
                    showLoading(false);
                    reject(error);
                }
            } else {
                console.log('❌ No user authenticated, redirecting...');
                window.location.href = 'index.html';
                reject(new Error('No user'));
            }
        }, (error) => {
            console.error('❌ Auth error:', error);
            window.location.href = 'index.html';
            reject(error);
        });
    });
}

// Show/hide loading
function showLoading(show) {
    const loadingState = document.getElementById('loadingState');
    const mainContent = document.querySelector('.main-content');
    
    if (loadingState) {
        loadingState.style.display = show ? 'flex' : 'none';
    }
    
    if (mainContent) {
        mainContent.style.opacity = show ? '0.5' : '1';
        mainContent.style.pointerEvents = show ? 'none' : 'auto';
    }
}

// Load user data from Firebase
async function loadUserData() {
    try {
        console.log('📥 Loading user data...');
        
        const snapshot = await firebase.database()
            .ref(`users/${currentUser.uid}`)
            .once('value');
            
        userData = snapshot.val();
        
        if (!userData) {
            console.log('📝 Creating default user profile');
            
            // Create default user profile
            userData = {
                personal: {
                    full_name: currentUser.displayName || 'New Freelancer',
                    email_address: currentUser.email || '',
                    phone_number: '',
                    city_location: 'Nairobi',
                    joined_timestamp: Date.now()
                },
                professional: {
                    main_category: '',
                    skill_set: '',
                    experience_level: '0-1 years',
                    rate_per_hour: 0,
                    hours_per_week: '20-30 hours'
                },
                settings: {
                    preferred_project_type: 'project_based',
                    work_mode: 'remote'
                },
                account_state: 'active'
            };
            
            // Save to Firebase
            await firebase.database()
                .ref(`users/${currentUser.uid}`)
                .set(userData);
                
            console.log('✅ Default profile created');
        } else {
            console.log('✅ User data loaded:', userData.personal?.full_name);
        }
        
    } catch (error) {
        console.error('❌ Error loading user data:', error);
        throw error;
    }
}

// Load user tasks
async function loadUserTasks() {
    try {
        console.log('📥 Loading user tasks...');
        
        // Reset tasks
        userTasks = {
            priority: [],
            assigned: [],
            inProgress: [],
            completed: []
        };
        
        // Get all tasks
        const snapshot = await firebase.database()
            .ref('tasks')
            .once('value');
            
        const allTasks = snapshot.val() || {};
        
        console.log(`📊 Found ${Object.keys(allTasks).length} total tasks`);
        
        // Filter tasks assigned to current user
        Object.entries(allTasks).forEach(([taskId, task]) => {
            if (task.assignment && task.assignment.assigned_to === currentUser.uid) {
                task.id = taskId;
                
                const status = task.status?.current || 'available';
                
                switch(status) {
                    case 'available':
                        if (task.assignment.is_priority_match) {
                            userTasks.priority.push(task);
                        } else {
                            userTasks.assigned.push(task);
                        }
                        break;
                    case 'in_progress':
                        userTasks.inProgress.push(task);
                        break;
                    case 'completed':
                    case 'submitted':
                        userTasks.completed.push(task);
                        break;
                }
            }
        });
        
        console.log('📊 Task counts:', {
            priority: userTasks.priority.length,
            assigned: userTasks.assigned.length,
            inProgress: userTasks.inProgress.length,
            completed: userTasks.completed.length
        });
        
    } catch (error) {
        console.error('❌ Error loading tasks:', error);
        // Don't throw - tasks can be empty
    }
}

// Load available tasks
async function loadAvailableTasks() {
    try {
        console.log('📥 Loading available tasks...');
        
        const snapshot = await firebase.database()
            .ref('tasks')
            .once('value');
            
        const allTasks = snapshot.val() || {};
        
        allAvailableTasks = Object.entries(allTasks)
            .filter(([_, task]) => !task.assignment || !task.assignment.assigned_to)
            .map(([id, task]) => ({ id, ...task }));
        
        console.log(`📊 Found ${allAvailableTasks.length} available tasks`);
        
    } catch (error) {
        console.error('❌ Error loading available tasks:', error);
        allAvailableTasks = []; // Reset to empty array on error
    }
}

// Setup realtime listeners
function setupRealtimeListeners() {
    console.log('🔄 Setting up realtime listeners...');
    
    // Listen for new tasks
    firebase.database().ref('tasks').on('child_added', (snapshot) => {
        const task = snapshot.val();
        if (task.assignment?.assigned_to === currentUser.uid) {
            console.log('📨 New task assigned');
            showNotification('New task assigned!', 'success');
            refreshData();
        } else if (!task.assignment?.assigned_to) {
            console.log('📨 New task available');
            showNotification('New task available!', 'info');
            refreshAvailableTasks();
        }
    });

    // Listen for task updates
    firebase.database().ref('tasks').on('child_changed', (snapshot) => {
        const task = snapshot.val();
        if (task.assignment?.assigned_to === currentUser.uid) {
            console.log('📨 Task updated');
            refreshData();
        }
    });
}

// Refresh all data
async function refreshData() {
    try {
        await Promise.all([
            loadUserTasks(),
            loadAvailableTasks()
        ]);
        updateUI();
    } catch (error) {
        console.error('❌ Error refreshing data:', error);
    }
}

// Refresh available tasks only
async function refreshAvailableTasks() {
    try {
        await loadAvailableTasks();
        updateTaskBadges();
        renderAvailableTasks();
    } catch (error) {
        console.error('❌ Error refreshing available tasks:', error);
    }
}

// Update UI
function updateUI() {
    console.log('🎨 Updating UI...');
    updateProfileDisplay();
    updateTaskBadges();
    renderAllTaskSections();
}

// Update profile display
function updateProfileDisplay() {
    try {
        const personal = userData?.personal || {};
        const professional = userData?.professional || {};
        
        // Get initials
        const name = personal.full_name || 'Freelancer';
        const initials = name.split(' ')
            .map(n => n[0])
            .join('')
            .toUpperCase()
            .substring(0, 2) || 'FL';
        
        // Update avatars
        setElementText('userAvatar', initials);
        setElementText('profileAvatar', initials);
        
        // Update names
        setElementText('userName', name);
        setElementText('profileName', name);
        setElementText('profileEmail', personal.email_address || '');
        setElementText('profileSkills', professional.skill_set || 'No skills added');
        
        // Calculate stats
        const completedCount = userTasks.completed.length;
        const activeCount = userTasks.inProgress.length;
        const totalEarned = userTasks.completed.reduce((sum, task) => 
            sum + (task.task_details?.budget || 0), 0);
        
        // Update stat elements
        setElementText('profileCompleted', completedCount);
        setElementText('profileEarnings', formatCurrency(totalEarned));
        setElementText('profileRating', '0.0');
        setElementText('profileActive', activeCount);
        
        // Update task stats cards
        const taskStats = document.getElementById('taskStats');
        if (taskStats) {
            taskStats.innerHTML = `
                <div class="stat-card">
                    <div class="stat-number">${completedCount}</div>
                    <div class="stat-label">Completed</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${activeCount}</div>
                    <div class="stat-label">In Progress</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${userTasks.priority.length}</div>
                    <div class="stat-label">Priority</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${allAvailableTasks.length}</div>
                    <div class="stat-label">Available</div>
                </div>
            `;
        }
        
        // Update settings form
        const settingsFields = {
            'settingsFullName': personal.full_name || '',
            'settingsPhone': personal.phone_number || '',
            'settingsLocation': personal.city_location || 'Nairobi',
            'settingsCategory': professional.main_category || '',
            'settingsSkills': professional.skill_set || '',
            'settingsExperience': professional.experience_level || '0-1 years',
            'settingsRate': professional.rate_per_hour || 0
        };
        
        Object.entries(settingsFields).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) element.value = value;
        });
        
    } catch (error) {
        console.error('❌ Error updating profile display:', error);
    }
}

// Helper to safely set element text
function setElementText(id, text) {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = text;
    }
}

// Format currency
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-KE', {
        style: 'currency',
        currency: 'KES',
        minimumFractionDigits: 0
    }).format(amount || 0);
}

// Update task badges
function updateTaskBadges() {
    const badges = {
        'priorityBadge': userTasks.priority.length,
        'availableBadge': allAvailableTasks.length,
        'progressBadge': userTasks.inProgress.length,
        'activeTasksBadge': `${userTasks.inProgress.length} Active`,
        'priorityTasksBadge': userTasks.priority.length,
        'availableTasksBadge': allAvailableTasks.length,
        'inProgressBadge': userTasks.inProgress.length,
        'completedTasksBadge': userTasks.completed.length
    };
    
    Object.entries(badges).forEach(([id, text]) => {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = text;
        }
    });
}

// Render all task sections
function renderAllTaskSections() {
    renderPriorityTasks();
    renderAssignedTasks();
    renderInProgressTasks();
    renderRecentTasks();
    renderCompletedTasks();
    renderAvailableTasks();
}

// Render priority tasks
function renderPriorityTasks() {
    const containers = [
        'priorityTasksContainer',
        'priority-tasks-container'
    ];
    
    containers.forEach(containerId => {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        if (userTasks.priority.length === 0) {
            container.innerHTML = getEmptyState('No priority tasks', 'star');
            return;
        }
        
        container.innerHTML = userTasks.priority
            .map(task => getTaskCardHTML(task, 'priority'))
            .join('');
    });
}

// Render assigned tasks
function renderAssignedTasks() {
    const container = document.getElementById('assigned-tasks-container');
    if (!container) return;
    
    if (userTasks.assigned.length === 0) {
        container.innerHTML = getEmptyState('No assigned tasks', 'tasks');
        return;
    }
    
    container.innerHTML = userTasks.assigned
        .map(task => getTaskCardHTML(task))
        .join('');
}

// Render in-progress tasks
function renderInProgressTasks() {
    const containers = [
        'inProgressContainer',
        'in-progress-tasks-container'
    ];
    
    containers.forEach(containerId => {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        if (userTasks.inProgress.length === 0) {
            container.innerHTML = getEmptyState('No tasks in progress', 'play-circle');
            return;
        }
        
        container.innerHTML = userTasks.inProgress
            .map(task => getTaskCardHTML(task, 'in-progress'))
            .join('');
    });
}

// Render recent tasks
function renderRecentTasks() {
    const container = document.getElementById('recent-tasks-container');
    if (!container) return;
    
    const recent = [...userTasks.completed]
        .sort((a, b) => (b.status?.completed_at || 0) - (a.status?.completed_at || 0))
        .slice(0, 3);
    
    if (recent.length === 0) {
        container.innerHTML = getEmptyState('No completed tasks', 'check-circle');
        return;
    }
    
    container.innerHTML = recent
        .map(task => getTaskCardHTML(task, 'completed'))
        .join('');
}

// Render completed tasks
function renderCompletedTasks() {
    const container = document.getElementById('completedTasksContainer');
    if (!container) return;
    
    if (userTasks.completed.length === 0) {
        container.innerHTML = getEmptyState('No completed tasks', 'check-circle');
        return;
    }
    
    container.innerHTML = userTasks.completed
        .map(task => getTaskCardHTML(task, 'completed'))
        .join('');
}

// Render available tasks
function renderAvailableTasks() {
    const container = document.getElementById('availableTasksContainer');
    if (!container) return;
    
    if (allAvailableTasks.length === 0) {
        container.innerHTML = getEmptyState('No tasks available', 'clock');
        return;
    }
    
    container.innerHTML = allAvailableTasks
        .map(task => getAvailableTaskCardHTML(task))
        .join('');
}

// Get empty state HTML
function getEmptyState(message, icon = 'info-circle') {
    return `
        <div class="empty-state">
            <div class="empty-icon">
                <i class="fas fa-${icon}"></i>
            </div>
            <p>${message}</p>
        </div>
    `;
}

// Get task card HTML
function getTaskCardHTML(task, type = '') {
    const details = task.task_details || {};
    const deadline = details.deadline ? new Date(details.deadline).toLocaleDateString() : 'Not set';
    const budget = formatCurrency(details.budget);
    
    const statusClass = {
        'priority': 'status-assigned',
        'in-progress': 'status-in-progress',
        'completed': 'status-completed'
    }[type] || 'status-assigned';
    
    const statusText = {
        'priority': 'Priority',
        'in-progress': 'In Progress',
        'completed': 'Completed'
    }[type] || 'Assigned';
    
    return `
        <div class="task-card" onclick="openTaskWorkspace('${task.id}')">
            <div class="task-header">
                <h3 class="task-title">${details.title || 'Untitled Task'}</h3>
                <div class="task-meta">
                    <div class="task-info">
                        <i class="fas fa-calendar-alt"></i>
                        <span>Due: ${deadline}</span>
                    </div>
                    <div class="task-info">
                        <i class="fas fa-money-bill-wave"></i>
                        <span>${budget}</span>
                    </div>
                    <span class="status-badge ${statusClass}">${statusText}</span>
                </div>
            </div>
            <div class="task-description">
                ${details.description || 'No description provided.'}
            </div>
            <div class="task-actions" onclick="event.stopPropagation()">
                <button class="btn btn-primary" onclick="openTaskWorkspace('${task.id}')">
                    <i class="fas fa-play"></i> ${type === 'in-progress' ? 'Continue' : 'Start'}
                </button>
            </div>
        </div>
    `;
}

// Get available task card HTML
function getAvailableTaskCardHTML(task) {
    const details = task.task_details || {};
    const deadline = details.deadline ? new Date(details.deadline).toLocaleDateString() : 'Not set';
    const budget = formatCurrency(details.budget);
    
    const priorityClass = {
        'high': 'status-assigned',
        'medium': 'status-in-progress',
        'low': 'status-completed'
    }[details.priority] || 'status-assigned';
    
    const isPriorityMatch = userData?.professional?.main_category === details.category;
    
    return `
        <div class="task-card ${isPriorityMatch ? 'priority' : ''}">
            <div class="task-header">
                <h3 class="task-title">${details.title || 'Untitled Task'}</h3>
                <div class="task-meta">
                    <div class="task-info">
                        <i class="fas fa-calendar-alt"></i>
                        <span>Due: ${deadline}</span>
                    </div>
                    <div class="task-info">
                        <i class="fas fa-money-bill-wave"></i>
                        <span>${budget}</span>
                    </div>
                    <span class="status-badge ${priorityClass}">${details.priority || 'medium'}</span>
                </div>
            </div>
            <div class="task-description">
                ${details.description || 'No description provided.'}
                ${isPriorityMatch ? '<br><small><i class="fas fa-star" style="color: #ffd43b;"></i> Matches your category!</small>' : ''}
            </div>
            <div class="task-actions">
                <button class="btn btn-primary" onclick="acceptTask('${task.id}')">
                    <i class="fas fa-check"></i> Accept
                </button>
            </div>
        </div>
    `;
}

// Accept task
async function acceptTask(taskId) {
    try {
        console.log('📥 Accepting task:', taskId);
        
        const snapshot = await firebase.database()
            .ref(`tasks/${taskId}`)
            .once('value');
            
        const task = snapshot.val();
        
        if (!task) {
            showNotification('Task not found', 'error');
            return;
        }
        
        if (task.assignment?.assigned_to) {
            showNotification('Task already assigned', 'error');
            await refreshAvailableTasks();
            return;
        }
        
        const isPriorityMatch = userData?.professional?.main_category === task.task_details?.category;
        
        // Update task assignment
        await firebase.database().ref(`tasks/${taskId}/assignment`).set({
            assigned_to: currentUser.uid,
            assigned_by: 'system',
            assigned_at: Date.now(),
            is_priority_match: isPriorityMatch
        });
        
        await firebase.database().ref(`tasks/${taskId}/status`).set({
            current: 'available',
            accepted_at: null,
            started_at: null,
            submitted_at: null,
            completed_at: null
        });
        
        showNotification('Task accepted!', 'success');
        
        // Refresh data
        await refreshData();
        
        // Switch to tasks section
        showSection('tasks-section');
        
    } catch (error) {
        console.error('❌ Error accepting task:', error);
        showNotification('Error accepting task', 'error');
    }
}

// Open task workspace
async function openTaskWorkspace(taskId) {
    try {
        const snapshot = await firebase.database()
            .ref(`tasks/${taskId}`)
            .once('value');
            
        const task = snapshot.val();
        
        if (!task) {
            showNotification('Task not found', 'error');
            return;
        }
        
        task.id = taskId;
        
        // Update status if needed
        if (task.status?.current === 'available') {
            await firebase.database().ref(`tasks/${taskId}/status`).update({
                current: 'in_progress',
                accepted_at: Date.now()
            });
            await refreshData();
        }
        
        // Show workspace modal
        const modal = document.getElementById('workspaceModal');
        const title = document.getElementById('workspaceTitle');
        const frame = document.getElementById('workspaceFrame');
        
        if (title) {
            title.textContent = task.task_details?.title || 'Task Workspace';
        }
        
        if (frame) {
            if (task.task_details?.worksheet_url) {
                frame.src = task.task_details.worksheet_url;
            } else {
                frame.srcdoc = getSimpleWorkspaceHTML(task);
            }
        }
        
        if (modal) {
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
        
    } catch (error) {
        console.error('❌ Error opening workspace:', error);
        showNotification('Error opening workspace', 'error');
    }
}

// Get simple workspace HTML
function getSimpleWorkspaceHTML(task) {
    const details = task.task_details || {};
    return `
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5; }
                .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; }
                h1 { color: #0a192f; }
                .details { background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; }
                .label { font-weight: bold; color: #495057; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>${details.title || 'Task Workspace'}</h1>
                <p>${details.description || 'No description provided.'}</p>
                <div class="details">
                    <h3>Task Details:</h3>
                    <p><span class="label">Budget:</span> ${details.budget || 'Not set'} KSh</p>
                    <p><span class="label">Deadline:</span> ${details.deadline ? new Date(details.deadline).toLocaleDateString() : 'Not set'}</p>
                    <p><span class="label">Category:</span> ${details.category || 'Not set'}</p>
                    <p><span class="label">Priority:</span> ${details.priority || 'Not set'}</p>
                </div>
                <p>Use the toolbar below to submit your work.</p>
            </div>
        </body>
        </html>
    `;
}

// Close workspace
function closeWorkspace() {
    const modal = document.getElementById('workspaceModal');
    const frame = document.getElementById('workspaceFrame');
    
    if (modal) modal.classList.remove('active');
    if (frame) frame.src = 'about:blank';
    document.body.style.overflow = 'auto';
}

// Show section
function showSection(sectionId) {
    // Update menu
    document.querySelectorAll('.menu-link').forEach(link => {
        link.classList.remove('active');
    });
    
    const activeLink = Array.from(document.querySelectorAll('.menu-link'))
        .find(link => link.getAttribute('onclick')?.includes(sectionId));
    
    if (activeLink) activeLink.classList.add('active');
    
    // Show section
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
    });
    
    const targetSection = document.getElementById(sectionId);
    if (targetSection) {
        targetSection.classList.add('active');
    }
    
    // Load section data if needed
    if (sectionId === 'available-tasks-section') {
        renderAvailableTasks();
    }
}

// Filter available tasks
function filterAvailableTasks() {
    const category = document.getElementById('categoryFilter')?.value || '';
    const priority = document.getElementById('priorityFilter')?.value || '';
    
    const filtered = allAvailableTasks.filter(task => {
        const taskCategory = task.task_details?.category || '';
        const taskPriority = task.task_details?.priority || '';
        
        if (category && taskCategory !== category) return false;
        if (priority && taskPriority !== priority) return false;
        return true;
    });
    
    const container = document.getElementById('availableTasksContainer');
    if (!container) return;
    
    if (filtered.length === 0) {
        container.innerHTML = getEmptyState('No tasks match filters', 'filter');
        return;
    }
    
    container.innerHTML = filtered
        .map(task => getAvailableTaskCardHTML(task))
        .join('');
}

// Switch task tabs
function switchTaskTab(tab) {
    // Update tabs
    document.querySelectorAll('.task-tab').forEach(t => t.classList.remove('active'));
    if (event.target) event.target.classList.add('active');
    
    // Update containers
    document.querySelectorAll('.task-list').forEach(c => c.classList.remove('active'));
    
    const containerId = {
        'priority': 'priority-tasks-container',
        'assigned': 'assigned-tasks-container',
        'in-progress': 'in-progress-tasks-container',
        'recent': 'recent-tasks-container'
    }[tab];
    
    const container = document.getElementById(containerId);
    if (container) container.classList.add('active');
}

// Show notification
function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    if (!notification) return;
    
    notification.textContent = message;
    notification.className = `notification ${type} show`;
    
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

// Handle logout
async function handleLogout() {
    try {
        await firebase.auth().signOut();
        window.location.href = 'index.html';
    } catch (error) {
        console.error('❌ Logout error:', error);
        showNotification('Error signing out', 'error');
    }
}

// Make functions globally available
window.showSection = showSection;
window.switchTaskTab = switchTaskTab;
window.filterAvailableTasks = filterAvailableTasks;
window.openTaskWorkspace = openTaskWorkspace;
window.acceptTask = acceptTask;
window.closeWorkspace = closeWorkspace;
window.handleLogout = handleLogout;
window.updateProfile = updateProfile;
window.updateProfessional = updateProfessional;
window.updateNotifications = updateNotifications;
