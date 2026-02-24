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
let databaseListeners = [];

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
            
            // Create default user profile based on your JSON structure
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
                account_state: 'active',
                system_data: {
                    signup_source: 'web_app',
                    visitor_ip: '',
                    browser_info: navigator.userAgent.replace(/\./g, '_')
                }
            };
            
            // Save to Firebase
            await firebase.database()
                .ref(`users/${currentUser.uid}`)
                .set(userData);
            
            // Update user_tasks node
            await firebase.database()
                .ref(`user_tasks/${currentUser.uid}`)
                .set({
                    assigned_tasks: {},
                    completed_tasks: {},
                    stats: {
                        tasks_in_progress: 0,
                        tasks_available: 0,
                        tasks_completed: 0,
                        total_earned: 0,
                        average_rating: 0
                    }
                });
                
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
        
        // First try to get from user_tasks node for efficiency
        const userTasksSnapshot = await firebase.database()
            .ref(`user_tasks/${currentUser.uid}/assigned_tasks`)
            .once('value');
            
        const assignedTasksMap = userTasksSnapshot.val() || {};
        const taskIds = Object.keys(assignedTasksMap);
        
        if (taskIds.length === 0) {
            console.log('📊 No assigned tasks found');
            return;
        }
        
        // Get full task details for each assigned task
        const taskPromises = taskIds.map(taskId => 
            firebase.database().ref(`tasks/${taskId}`).once('value')
        );
        
        const taskSnapshots = await Promise.all(taskPromises);
        
        taskSnapshots.forEach(snapshot => {
            const task = snapshot.val();
            const taskId = snapshot.key;
            
            if (task) {
                task.id = taskId;
                
                // Get status from the task or from user_tasks mapping
                const status = task.status?.current || 
                              assignedTasksMap[taskId]?.current_status || 
                              'available';
                
                // Check if it's a priority match
                const isPriorityMatch = task.assignment?.is_priority_match || 
                                       assignedTasksMap[taskId]?.priority_match || 
                                       false;
                
                switch(status) {
                    case 'available':
                        if (isPriorityMatch) {
                            userTasks.priority.push(task);
                        } else {
                            userTasks.assigned.push(task);
                        }
                        break;
                    case 'in_progress':
                        userTasks.inProgress.push(task);
                        break;
                    case 'submitted':
                    case 'completed':
                        userTasks.completed.push(task);
                        break;
                }
            }
        });
        
        // Also get completed tasks from user_tasks
        const completedSnapshot = await firebase.database()
            .ref(`user_tasks/${currentUser.uid}/completed_tasks`)
            .once('value');
            
        const completedTasksMap = completedSnapshot.val() || {};
        
        // Add any completed tasks not already in the list
        Object.entries(completedTasksMap).forEach(([taskId, taskData]) => {
            if (!userTasks.completed.find(t => t.id === taskId)) {
                userTasks.completed.push({
                    id: taskId,
                    ...taskData,
                    status: { current: 'completed' }
                });
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
        
        // Get from available_tasks node first (more efficient)
        const availableSnapshot = await firebase.database()
            .ref('available_tasks')
            .once('value');
            
        const availableByCategory = availableSnapshot.val() || {};
        allAvailableTasks = [];
        
        // Flatten the available tasks structure
        Object.entries(availableByCategory).forEach(([category, priorityLevels]) => {
            Object.entries(priorityLevels).forEach(([priority, tasks]) => {
                Object.entries(tasks).forEach(([taskId, taskDetails]) => {
                    allAvailableTasks.push({
                        id: taskId,
                        task_details: {
                            ...taskDetails,
                            category,
                            priority
                        },
                        status: { current: 'available' }
                    });
                });
            });
        });
        
        // If no tasks in available_tasks, fall back to main tasks node
        if (allAvailableTasks.length === 0) {
            const tasksSnapshot = await firebase.database()
                .ref('tasks')
                .once('value');
                
            const allTasks = tasksSnapshot.val() || {};
            
            allAvailableTasks = Object.entries(allTasks)
                .filter(([_, task]) => {
                    // Task is available if not assigned or assignment is incomplete
                    return !task.assignment || 
                           !task.assignment.assigned_to ||
                           (task.status?.current === 'available');
                })
                .map(([id, task]) => ({ id, ...task }));
        }
        
        console.log(`📊 Found ${allAvailableTasks.length} available tasks`);
        
    } catch (error) {
        console.error('❌ Error loading available tasks:', error);
        allAvailableTasks = []; // Reset to empty array on error
    }
}

// Setup realtime listeners
function setupRealtimeListeners() {
    console.log('🔄 Setting up realtime listeners...');
    
    // Clean up existing listeners
    databaseListeners.forEach(ref => ref.off());
    databaseListeners = [];
    
    // Listen for new tasks in user_tasks
    const userTasksRef = firebase.database().ref(`user_tasks/${currentUser.uid}/assigned_tasks`);
    userTasksRef.on('child_added', (snapshot) => {
        console.log('📨 New task assigned to user');
        refreshData();
    });
    databaseListeners.push(userTasksRef);
    
    // Listen for task status changes
    const tasksRef = firebase.database().ref('tasks');
    tasksRef.on('child_changed', (snapshot) => {
        const task = snapshot.val();
        if (task.assignment?.assigned_to === currentUser.uid) {
            console.log('📨 Task updated');
            refreshData();
        }
    });
    databaseListeners.push(tasksRef);
    
    // Listen for new available tasks
    const availableRef = firebase.database().ref('available_tasks');
    availableRef.on('value', () => {
        console.log('📨 Available tasks updated');
        refreshAvailableTasks();
    });
    databaseListeners.push(availableRef);
    
    // Listen for user data changes
    const userRef = firebase.database().ref(`users/${currentUser.uid}`);
    userRef.on('value', (snapshot) => {
        userData = snapshot.val();
        updateProfileDisplay();
    });
    databaseListeners.push(userRef);
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
        if (document.getElementById('available-tasks-section')?.classList.contains('active')) {
            renderAvailableTasks();
        }
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
        
        // Get stats from user_tasks if available
        getUserStats().then(stats => {
            // Update stat elements
            setElementText('profileCompleted', stats.completed);
            setElementText('profileEarnings', formatCurrency(stats.earned));
            setElementText('profileRating', stats.rating.toFixed(1));
            setElementText('profileActive', stats.active);
            
            // Update task stats cards
            const taskStats = document.getElementById('taskStats');
            if (taskStats) {
                taskStats.innerHTML = `
                    <div class="stat-card">
                        <div class="stat-number">${stats.completed}</div>
                        <div class="stat-label">Completed</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-number">${stats.active}</div>
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
        });
        
        // Update settings form if it exists
        updateSettingsForm();
        
    } catch (error) {
        console.error('❌ Error updating profile display:', error);
    }
}

// Get user stats from database
async function getUserStats() {
    try {
        const snapshot = await firebase.database()
            .ref(`user_tasks/${currentUser.uid}/stats`)
            .once('value');
            
        const stats = snapshot.val() || {};
        
        return {
            completed: stats.tasks_completed || userTasks.completed.length,
            active: stats.tasks_in_progress || userTasks.inProgress.length,
            earned: stats.total_earned || calculateTotalEarned(),
            rating: stats.average_rating || calculateAverageRating()
        };
    } catch (error) {
        return {
            completed: userTasks.completed.length,
            active: userTasks.inProgress.length,
            earned: calculateTotalEarned(),
            rating: calculateAverageRating()
        };
    }
}

// Calculate total earned from tasks
function calculateTotalEarned() {
    return userTasks.completed.reduce((sum, task) => {
        return sum + (task.task_details?.budget || task.budget || 0);
    }, 0);
}

// Calculate average rating
function calculateAverageRating() {
    const ratings = userTasks.completed
        .map(task => task.deliverables?.rating || task.rating)
        .filter(r => r != null);
    
    if (ratings.length === 0) return 0;
    return ratings.reduce((a, b) => a + b, 0) / ratings.length;
}

// Update settings form with user data
function updateSettingsForm() {
    const personal = userData?.personal || {};
    const professional = userData?.professional || {};
    const settings = userData?.settings || {};
    
    const settingsFields = {
        'settingsFullName': personal.full_name || '',
        'settingsPhone': personal.phone_number || '',
        'settingsLocation': personal.city_location || 'Nairobi',
        'settingsCategory': professional.main_category || '',
        'settingsSkills': professional.skill_set || '',
        'settingsExperience': professional.experience_level || '0-1 years',
        'settingsRate': professional.rate_per_hour || 0,
        'settingsHours': professional.hours_per_week || '20-30 hours',
        'settingsProjectType': settings.preferred_project_type || 'project_based',
        'settingsWorkMode': settings.work_mode || 'remote'
    };
    
    Object.entries(settingsFields).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) {
            if (element.tagName === 'SELECT') {
                // Find and select the matching option
                Array.from(element.options).forEach(option => {
                    if (option.value === value) {
                        option.selected = true;
                    }
                });
            } else {
                element.value = value;
            }
        }
    });
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
        .sort((a, b) => {
            const dateA = a.status?.completed_at || a.completed_at || 0;
            const dateB = b.status?.completed_at || b.completed_at || 0;
            return dateB - dateA;
        })
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
    const details = task.task_details || task.details || {};
    const taskDetails = task.task_details || {};
    
    const title = details.title || taskDetails.title || 'Untitled Task';
    const description = details.description || taskDetails.description || 'No description provided.';
    const deadline = details.deadline || taskDetails.deadline;
    const budget = details.budget || taskDetails.budget;
    const priority = details.priority || taskDetails.priority || 'medium';
    
    const formattedDeadline = deadline ? new Date(deadline).toLocaleDateString() : 'Not set';
    const formattedBudget = formatCurrency(budget);
    
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
    
    // Get rating for completed tasks
    const rating = task.deliverables?.rating || task.rating;
    const ratingHtml = rating ? `
        <div class="task-rating">
            ${Array(5).fill(0).map((_, i) => 
                `<i class="fas fa-star ${i < Math.floor(rating) ? 'filled' : ''}"></i>`
            ).join('')}
            <span>${rating.toFixed(1)}</span>
        </div>
    ` : '';
    
    return `
        <div class="task-card" onclick="openTaskWorkspace('${task.id}')">
            <div class="task-header">
                <h3 class="task-title">${escapeHtml(title)}</h3>
                <div class="task-meta">
                    <div class="task-info">
                        <i class="fas fa-calendar-alt"></i>
                        <span>Due: ${formattedDeadline}</span>
                    </div>
                    <div class="task-info">
                        <i class="fas fa-money-bill-wave"></i>
                        <span>${formattedBudget}</span>
                    </div>
                    <span class="status-badge ${statusClass}">${statusText}</span>
                </div>
            </div>
            <div class="task-description">
                ${escapeHtml(description)}
                ${ratingHtml}
            </div>
            <div class="task-actions" onclick="event.stopPropagation()">
                <button class="btn btn-primary" onclick="openTaskWorkspace('${task.id}')">
                    <i class="fas fa-${type === 'in-progress' ? 'play' : 'arrow-right'}"></i> 
                    ${type === 'in-progress' ? 'Continue' : 'View'}
                </button>
                ${type === 'in-progress' ? `
                    <button class="btn btn-success" onclick="submitTask('${task.id}')">
                        <i class="fas fa-check"></i> Submit
                    </button>
                ` : ''}
            </div>
        </div>
    `;
}

// Get available task card HTML
function getAvailableTaskCardHTML(task) {
    const details = task.task_details || task.details || {};
    const taskDetails = task.task_details || {};
    
    const title = details.title || taskDetails.title || 'Untitled Task';
    const description = details.description || taskDetails.description || 'No description provided.';
    const deadline = details.deadline || taskDetails.deadline;
    const budget = details.budget || taskDetails.budget;
    const priority = details.priority || taskDetails.priority || 'medium';
    const category = details.category || taskDetails.category || '';
    const estimatedHours = details.estimated_hours || taskDetails.estimated_hours || 'Not specified';
    
    const formattedDeadline = deadline ? new Date(deadline).toLocaleDateString() : 'Not set';
    const formattedBudget = formatCurrency(budget);
    
    const priorityClass = {
        'high': 'status-assigned',
        'medium': 'status-in-progress',
        'low': 'status-completed'
    }[priority] || 'status-assigned';
    
    const isPriorityMatch = userData?.professional?.main_category === category;
    
    return `
        <div class="task-card ${isPriorityMatch ? 'priority-match' : ''}">
            <div class="task-header">
                <h3 class="task-title">${escapeHtml(title)}</h3>
                <div class="task-meta">
                    <div class="task-info">
                        <i class="fas fa-calendar-alt"></i>
                        <span>Due: ${formattedDeadline}</span>
                    </div>
                    <div class="task-info">
                        <i class="fas fa-money-bill-wave"></i>
                        <span>${formattedBudget}</span>
                    </div>
                    <span class="status-badge ${priorityClass}">${priority}</span>
                </div>
            </div>
            <div class="task-description">
                ${escapeHtml(description)}
                <div class="task-details">
                    <small><i class="fas fa-clock"></i> Est: ${estimatedHours} hrs</small>
                    <small><i class="fas fa-tag"></i> ${escapeHtml(category)}</small>
                </div>
                ${isPriorityMatch ? `
                    <div class="priority-match-badge">
                        <i class="fas fa-star" style="color: #ffd43b;"></i> Matches your category!
                    </div>
                ` : ''}
            </div>
            <div class="task-actions">
                <button class="btn btn-primary" onclick="acceptTask('${task.id}')">
                    <i class="fas fa-check"></i> Accept Task
                </button>
                <button class="btn btn-outline" onclick="viewTaskDetails('${task.id}')">
                    <i class="fas fa-info-circle"></i> Details
                </button>
            </div>
        </div>
    `;
}

// Escape HTML to prevent XSS
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Accept task
async function acceptTask(taskId) {
    try {
        console.log('📥 Accepting task:', taskId);
        showLoading(true);
        
        // Get task details
        const snapshot = await firebase.database()
            .ref(`tasks/${taskId}`)
            .once('value');
            
        let task = snapshot.val();
        
        // If task not in tasks node, check available_tasks
        if (!task) {
            const availableSnapshot = await firebase.database()
                .ref(`available_tasks`)
                .once('value');
                
            const availableTasks = availableSnapshot.val() || {};
            
            // Search for task in available_tasks
            let foundTask = null;
            let foundCategory = null;
            let foundPriority = null;
            
            Object.entries(availableTasks).forEach(([category, priorities]) => {
                Object.entries(priorities).forEach(([priority, tasks]) => {
                    if (tasks[taskId]) {
                        foundTask = tasks[taskId];
                        foundCategory = category;
                        foundPriority = priority;
                    }
                });
            });
            
            if (foundTask) {
                task = {
                    task_details: {
                        ...foundTask,
                        category: foundCategory,
                        priority: foundPriority
                    }
                };
            }
        }
        
        if (!task) {
            showNotification('Task not found', 'error');
            showLoading(false);
            return;
        }
        
        // Check if task is already assigned
        if (task.assignment?.assigned_to) {
            showNotification('Task already assigned', 'error');
            await refreshAvailableTasks();
            showLoading(false);
            return;
        }
        
        const isPriorityMatch = userData?.professional?.main_category === task.task_details?.category;
        const now = Date.now();
        
        // Update task in tasks node
        await firebase.database().ref(`tasks/${taskId}`).update({
            assignment: {
                assigned_to: currentUser.uid,
                assigned_by: 'system',
                assigned_at: now,
                is_priority_match: isPriorityMatch
            },
            status: {
                current: 'available',
                accepted_at: null,
                started_at: null,
                submitted_at: null,
                completed_at: null
            }
        });
        
        // Update user_tasks node
        await firebase.database()
            .ref(`user_tasks/${currentUser.uid}/assigned_tasks/${taskId}`)
            .set({
                assigned_at: now,
                priority_match: isPriorityMatch,
                current_status: 'available'
            });
        
        // Update user stats
        await updateUserStats();
        
        // Remove from available_tasks if it exists there
        if (task.task_details?.category && task.task_details?.priority) {
            await firebase.database()
                .ref(`available_tasks/${task.task_details.category}/${task.task_details.priority}/${taskId}`)
                .remove();
        }
        
        // Create notification
        await firebase.database()
            .ref(`task_notifications/${currentUser.uid}/${taskId}`)
            .set({
                type: isPriorityMatch ? 'priority_match' : 'available',
                message: `New task assigned: ${task.task_details?.title || 'Task'}`,
                read: false,
                timestamp: now
            });
        
        showNotification('Task accepted successfully!', 'success');
        
        // Refresh data
        await refreshData();
        
        // Switch to tasks section
        showSection('tasks-section');
        
    } catch (error) {
        console.error('❌ Error accepting task:', error);
        showNotification('Error accepting task: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// Submit task for review
async function submitTask(taskId) {
    try {
        const task = userTasks.inProgress.find(t => t.id === taskId) ||
                    userTasks.priority.find(t => t.id === taskId);
        
        if (!task) {
            showNotification('Task not found', 'error');
            return;
        }
        
        // Show submission modal
        showSubmissionModal(taskId);
        
    } catch (error) {
        console.error('❌ Error preparing task submission:', error);
        showNotification('Error preparing submission', 'error');
    }
}

// Show submission modal
function showSubmissionModal(taskId) {
    // Create modal if it doesn't exist
    let modal = document.getElementById('submissionModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'submissionModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Submit Task</h2>
                    <button class="close-btn" onclick="closeSubmissionModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <form id="submissionForm">
                        <div class="form-group">
                            <label>Submission Notes</label>
                            <textarea id="submissionNotes" rows="4" placeholder="Add any notes about your submission..."></textarea>
                        </div>
                        <div class="form-group">
                            <label>Attach Files</label>
                            <input type="file" id="submissionFiles" multiple accept=".pdf,.doc,.docx,.zip,.jpg,.png">
                            <small>You can upload multiple files (PDF, DOC, ZIP, Images)</small>
                        </div>
                        <div id="fileList" class="file-list"></div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="closeSubmissionModal()">Cancel</button>
                    <button class="btn btn-success" onclick="confirmSubmission('${taskId}')">
                        <i class="fas fa-check"></i> Submit Task
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        // Add file input handler
        const fileInput = document.getElementById('submissionFiles');
        fileInput.addEventListener('change', handleFileSelection);
    }
    
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

// Handle file selection
function handleFileSelection(event) {
    const files = event.target.files;
    const fileList = document.getElementById('fileList');
    
    if (files.length > 0) {
        fileList.innerHTML = '<h4>Selected Files:</h4>';
        Array.from(files).forEach(file => {
            fileList.innerHTML += `<div class="file-item">📎 ${escapeHtml(file.name)} (${(file.size / 1024).toFixed(2)} KB)</div>`;
        });
    } else {
        fileList.innerHTML = '';
    }
}

// Close submission modal
function closeSubmissionModal() {
    const modal = document.getElementById('submissionModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = 'auto';
        
        // Clear form
        const form = document.getElementById('submissionForm');
        if (form) form.reset();
        const fileList = document.getElementById('fileList');
        if (fileList) fileList.innerHTML = '';
    }
}

// Confirm task submission
async function confirmSubmission(taskId) {
    try {
        showLoading(true);
        
        const notes = document.getElementById('submissionNotes')?.value || '';
        const fileInput = document.getElementById('submissionFiles');
        const files = fileInput?.files || [];
        
        // Upload files if any
        const fileUrls = [];
        if (files.length > 0) {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const storageRef = firebase.storage().ref();
                const fileRef = storageRef.child(`submissions/${currentUser.uid}/${taskId}/${Date.now()}_${file.name}`);
                await fileRef.put(file);
                const url = await fileRef.getDownloadURL();
                fileUrls.push(url);
            }
        }
        
        const now = Date.now();
        
        // Update task status
        await firebase.database().ref(`tasks/${taskId}/status`).update({
            current: 'submitted',
            submitted_at: now
        });
        
        // Update deliverables
        await firebase.database().ref(`tasks/${taskId}/deliverables`).update({
            files: fileUrls,
            submission_notes: notes,
            submitted_at: now
        });
        
        // Update user_tasks
        await firebase.database()
            .ref(`user_tasks/${currentUser.uid}/assigned_tasks/${taskId}`)
            .update({
                current_status: 'submitted',
                submitted_at: now
            });
        
        // Move from assigned to completed in local data
        const taskIndex = userTasks.inProgress.findIndex(t => t.id === taskId);
        if (taskIndex !== -1) {
            const task = userTasks.inProgress[taskIndex];
            task.status.current = 'submitted';
            userTasks.inProgress.splice(taskIndex, 1);
            userTasks.completed.push(task);
        }
        
        closeSubmissionModal();
        showNotification('Task submitted successfully!', 'success');
        
        // Refresh data
        await refreshData();
        
    } catch (error) {
        console.error('❌ Error submitting task:', error);
        showNotification('Error submitting task: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// Update user statistics
async function updateUserStats() {
    try {
        const stats = {
            tasks_in_progress: userTasks.inProgress.length,
            tasks_available: userTasks.assigned.length + userTasks.priority.length,
            tasks_completed: userTasks.completed.length,
            total_earned: calculateTotalEarned(),
            average_rating: calculateAverageRating()
        };
        
        await firebase.database()
            .ref(`user_tasks/${currentUser.uid}/stats`)
            .set(stats);
            
    } catch (error) {
        console.error('❌ Error updating user stats:', error);
    }
}

// Open task workspace
async function openTaskWorkspace(taskId) {
    try {
        showLoading(true);
        
        // Find task in local data first
        let task = userTasks.priority.find(t => t.id === taskId) ||
                  userTasks.assigned.find(t => t.id === taskId) ||
                  userTasks.inProgress.find(t => t.id === taskId) ||
                  userTasks.completed.find(t => t.id === taskId);
        
        // If not found locally, fetch from database
        if (!task) {
            const snapshot = await firebase.database()
                .ref(`tasks/${taskId}`)
                .once('value');
                
            task = snapshot.val();
            if (task) task.id = taskId;
        }
        
        if (!task) {
            showNotification('Task not found', 'error');
            showLoading(false);
            return;
        }
        
        // Update status if needed (when opening an available task)
        if (task.status?.current === 'available' && !task.status?.accepted_at) {
            await firebase.database().ref(`tasks/${taskId}/status`).update({
                current: 'in_progress',
                accepted_at: Date.now(),
                started_at: Date.now()
            });
            
            await firebase.database()
                .ref(`user_tasks/${currentUser.uid}/assigned_tasks/${taskId}`)
                .update({
                    current_status: 'in_progress',
                    started_at: Date.now()
                });
                
            await refreshData();
        }
        
        // Show workspace modal
        showWorkspaceModal(task);
        
    } catch (error) {
        console.error('❌ Error opening workspace:', error);
        showNotification('Error opening workspace', 'error');
    } finally {
        showLoading(false);
    }
}

// Show workspace modal
function showWorkspaceModal(task) {
    // Create modal if it doesn't exist
    let modal = document.getElementById('workspaceModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'workspaceModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content workspace-modal">
                <div class="modal-header">
                    <h2 id="workspaceTitle">Task Workspace</h2>
                    <div class="workspace-controls">
                        <button class="btn btn-outline" onclick="refreshWorkspace()">
                            <i class="fas fa-sync-alt"></i>
                        </button>
                        <button class="close-btn" onclick="closeWorkspace()">&times;</button>
                    </div>
                </div>
                <div class="workspace-toolbar">
                    <button class="btn btn-success" onclick="submitTask('${task.id}')">
                        <i class="fas fa-check"></i> Submit Task
                    </button>
                    <button class="btn btn-outline" onclick="downloadTaskFiles('${task.id}')">
                        <i class="fas fa-download"></i> Download Files
                    </button>
                </div>
                <iframe id="workspaceFrame" class="workspace-frame"></iframe>
            </div>
        `;
        document.body.appendChild(modal);
    }
    
    const title = document.getElementById('workspaceTitle');
    const frame = document.getElementById('workspaceFrame');
    
    if (title) {
        title.textContent = task.task_details?.title || 'Task Workspace';
    }
    
    if (frame) {
        // Load task content
        frame.srcdoc = generateWorkspaceHTML(task);
    }
    
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

// Generate workspace HTML
function generateWorkspaceHTML(task) {
    const details = task.task_details || {};
    const deliverables = task.deliverables || {};
    
    const hasSubmission = deliverables.files?.length > 0 || deliverables.submission_notes;
    
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Task Workspace</title>
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
                    background: #f8f9fa;
                    padding: 24px;
                    line-height: 1.6;
                }
                
                .workspace-container {
                    max-width: 1000px;
                    margin: 0 auto;
                }
                
                .task-header {
                    background: white;
                    border-radius: 12px;
                    padding: 24px;
                    margin-bottom: 24px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                }
                
                .task-title {
                    font-size: 28px;
                    color: #0a192f;
                    margin-bottom: 16px;
                }
                
                .task-meta {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 16px;
                    background: #f8f9fa;
                    padding: 16px;
                    border-radius: 8px;
                }
                
                .meta-item {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                
                .meta-item i {
                    color: #0a192f;
                    width: 20px;
                }
                
                .meta-item .label {
                    color: #6c757d;
                    font-size: 14px;
                }
                
                .meta-item .value {
                    font-weight: 600;
                    color: #0a192f;
                }
                
                .task-description {
                    background: white;
                    border-radius: 12px;
                    padding: 24px;
                    margin-bottom: 24px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                }
                
                .section-title {
                    font-size: 18px;
                    color: #0a192f;
                    margin-bottom: 16px;
                    padding-bottom: 8px;
                    border-bottom: 2px solid #e9ecef;
                }
                
                .deliverables {
                    background: white;
                    border-radius: 12px;
                    padding: 24px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                }
                
                .file-list {
                    list-style: none;
                }
                
                .file-item {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 12px;
                    background: #f8f9fa;
                    border-radius: 6px;
                    margin-bottom: 8px;
                }
                
                .file-item a {
                    color: #0a192f;
                    text-decoration: none;
                    flex: 1;
                }
                
                .file-item a:hover {
                    color: #2a3f5f;
                }
                
                .submission-notes {
                    background: #e3f2fd;
                    padding: 16px;
                    border-radius: 8px;
                    margin-top: 16px;
                    font-style: italic;
                }
                
                .status-badge {
                    display: inline-block;
                    padding: 4px 12px;
                    border-radius: 20px;
                    font-size: 12px;
                    font-weight: 600;
                    text-transform: uppercase;
                }
                
                .status-in-progress {
                    background: #fff3cd;
                    color: #856404;
                }
                
                .status-completed {
                    background: #d4edda;
                    color: #155724;
                }
                
                .status-submitted {
                    background: #cce5ff;
                    color: #004085;
                }
                
                @media (max-width: 768px) {
                    body { padding: 16px; }
                    .task-meta { grid-template-columns: 1fr; }
                }
            </style>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
        </head>
        <body>
            <div class="workspace-container">
                <div class="task-header">
                    <h1 class="task-title">${escapeHtml(details.title || 'Untitled Task')}</h1>
                    
                    <div class="task-meta">
                        <div class="meta-item">
                            <i class="fas fa-tag"></i>
                            <span class="label">Category:</span>
                            <span class="value">${escapeHtml(details.category || 'Not specified')}</span>
                        </div>
                        <div class="meta-item">
                            <i class="fas fa-clock"></i>
                            <span class="label">Estimated Hours:</span>
                            <span class="value">${escapeHtml(details.estimated_hours || 'Not specified')}</span>
                        </div>
                        <div class="meta-item">
                            <i class="fas fa-money-bill-wave"></i>
                            <span class="label">Budget:</span>
                            <span class="value">${formatCurrency(details.budget)}</span>
                        </div>
                        <div class="meta-item">
                            <i class="fas fa-calendar-alt"></i>
                            <span class="label">Deadline:</span>
                            <span class="value">${details.deadline ? new Date(details.deadline).toLocaleDateString() : 'Not set'}</span>
                        </div>
                        <div class="meta-item">
                            <i class="fas fa-flag"></i>
                            <span class="label">Priority:</span>
                            <span class="value">
                                <span class="status-badge status-${details.priority || 'medium'}">
                                    ${escapeHtml(details.priority || 'medium')}
                                </span>
                            </span>
                        </div>
                        <div class="meta-item">
                            <i class="fas fa-tasks"></i>
                            <span class="label">Status:</span>
                            <span class="value">
                                <span class="status-badge status-${task.status?.current || 'available'}">
                                    ${escapeHtml(task.status?.current || 'available')}
                                </span>
                            </span>
                        </div>
                    </div>
                </div>
                
                <div class="task-description">
                    <h3 class="section-title">Description</h3>
                    <p>${escapeHtml(details.description || 'No description provided.')}</p>
                    
                    ${details.requirements ? `
                        <h4 style="margin-top: 20px; color: #495057;">Requirements</h4>
                        <p>${escapeHtml(details.requirements)}</p>
                    ` : ''}
                </div>
                
                <div class="deliverables">
                    <h3 class="section-title">Deliverables</h3>
                    
                    ${hasSubmission ? `
                        ${deliverables.files?.length > 0 ? `
                            <h4>Submitted Files:</h4>
                            <ul class="file-list">
                                ${deliverables.files.map(url => `
                                    <li class="file-item">
                                        <i class="fas fa-file"></i>
                                        <a href="${url}" target="_blank">${url.split('/').pop()}</a>
                                        <a href="${url}" download class="btn-small">
                                            <i class="fas fa-download"></i>
                                        </a>
                                    </li>
                                `).join('')}
                            </ul>
                        ` : ''}
                        
                        ${deliverables.submission_notes ? `
                            <div class="submission-notes">
                                <strong>Notes:</strong>
                                <p>${escapeHtml(deliverables.submission_notes)}</p>
                            </div>
                        ` : ''}
                        
                        ${deliverables.feedback ? `
                            <div style="margin-top: 20px; padding: 16px; background: #f8f9fa; border-radius: 8px;">
                                <strong>Feedback:</strong>
                                <p>${escapeHtml(deliverables.feedback)}</p>
                                ${deliverables.rating ? `
                                    <div style="margin-top: 8px;">
                                        <strong>Rating:</strong>
                                        ${Array(5).fill(0).map((_, i) => 
                                            `<i class="fas fa-star" style="color: ${i < Math.floor(deliverables.rating) ? '#ffd43b' : '#e9ecef'}"></i>`
                                        ).join('')}
                                        <span>(${deliverables.rating.toFixed(1)})</span>
                                    </div>
                                ` : ''}
                            </div>
                        ` : ''}
                    ` : `
                        <div style="text-align: center; padding: 40px; color: #6c757d;">
                            <i class="fas fa-upload" style="font-size: 48px; margin-bottom: 16px;"></i>
                            <p>No deliverables submitted yet.</p>
                            <p style="font-size: 14px; margin-top: 8px;">Use the submit button above to upload your work.</p>
                        </div>
                    `}
                </div>
            </div>
        </body>
        </html>
    `;
}

// Refresh workspace
function refreshWorkspace() {
    const frame = document.getElementById('workspaceFrame');
    if (frame) {
        frame.srcdoc = frame.srcdoc; // Reload iframe
    }
}

// Download task files
async function downloadTaskFiles(taskId) {
    try {
        const snapshot = await firebase.database()
            .ref(`tasks/${taskId}/deliverables/files`)
            .once('value');
            
        const files = snapshot.val() || [];
        
        if (files.length === 0) {
            showNotification('No files to download', 'info');
            return;
        }
        
        // Open each file in new tab for download
        files.forEach(url => {
            window.open(url, '_blank');
        });
        
    } catch (error) {
        console.error('❌ Error downloading files:', error);
        showNotification('Error downloading files', 'error');
    }
}

// View task details
async function viewTaskDetails(taskId) {
    try {
        const task = allAvailableTasks.find(t => t.id === taskId);
        if (!task) {
            showNotification('Task not found', 'error');
            return;
        }
        
        // Show task details modal
        showTaskDetailsModal(task);
        
    } catch (error) {
        console.error('❌ Error viewing task details:', error);
        showNotification('Error loading task details', 'error');
    }
}

// Show task details modal
function showTaskDetailsModal(task) {
    // Create modal if it doesn't exist
    let modal = document.getElementById('taskDetailsModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'taskDetailsModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 600px;">
                <div class="modal-header">
                    <h2>Task Details</h2>
                    <button class="close-btn" onclick="closeTaskDetailsModal()">&times;</button>
                </div>
                <div class="modal-body" id="taskDetailsContent">
                    <!-- Content will be inserted here -->
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="closeTaskDetailsModal()">Close</button>
                    <button class="btn btn-primary" onclick="acceptTaskFromDetails()">Accept Task</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    
    const content = document.getElementById('taskDetailsContent');
    const details = task.task_details || {};
    
    content.innerHTML = `
        <div style="padding: 16px;">
            <h3 style="margin-bottom: 16px;">${escapeHtml(details.title || 'Untitled Task')}</h3>
            
            <div style="background: #f8f9fa; padding: 16px; border-radius: 8px; margin-bottom: 16px;">
                <p><strong>Description:</strong> ${escapeHtml(details.description || 'No description')}</p>
            </div>
            
            <table style="width: 100%; border-collapse: collapse;">
                <tr>
                    <td style="padding: 8px 0;"><strong>Category:</strong></td>
                    <td>${escapeHtml(details.category || 'Not specified')}</td>
                </tr>
                <tr>
                    <td style="padding: 8px 0;"><strong>Priority:</strong></td>
                    <td><span class="status-badge status-${details.priority || 'medium'}">${escapeHtml(details.priority || 'medium')}</span></td>
                </tr>
                <tr>
                    <td style="padding: 8px 0;"><strong>Budget:</strong></td>
                    <td>${formatCurrency(details.budget)}</td>
                </tr>
                <tr>
                    <td style="padding: 8px 0;"><strong>Estimated Hours:</strong></td>
                    <td>${escapeHtml(details.estimated_hours || 'Not specified')}</td>
                </tr>
                <tr>
                    <td style="padding: 8px 0;"><strong>Deadline:</strong></td>
                    <td>${details.deadline ? new Date(details.deadline).toLocaleDateString() : 'Not set'}</td>
                </tr>
                <tr>
                    <td style="padding: 8px 0;"><strong>Created:</strong></td>
                    <td>${details.created_at ? new Date(details.created_at).toLocaleDateString() : 'Not specified'}</td>
                </tr>
            </table>
            
            ${details.requirements ? `
                <div style="margin-top: 16px; padding: 16px; background: #f8f9fa; border-radius: 8px;">
                    <strong>Requirements:</strong>
                    <p>${escapeHtml(details.requirements)}</p>
                </div>
            ` : ''}
        </div>
    `;
    
    // Store task ID for acceptance
    modal.dataset.taskId = task.id;
    
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

// Close task details modal
function closeTaskDetailsModal() {
    const modal = document.getElementById('taskDetailsModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = 'auto';
    }
}

// Accept task from details modal
async function acceptTaskFromDetails() {
    const modal = document.getElementById('taskDetailsModal');
    const taskId = modal?.dataset.taskId;
    
    if (taskId) {
        closeTaskDetailsModal();
        await acceptTask(taskId);
    }
}

// Close workspace
function closeWorkspace() {
    const modal = document.getElementById('workspaceModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = 'auto';
    }
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
        
        // Load section data if needed
        if (sectionId === 'available-tasks-section') {
            renderAvailableTasks();
        } else if (sectionId === 'tasks-section') {
            renderAllTaskSections();
        } else if (sectionId === 'profile-section') {
            updateProfileDisplay();
        }
    }
}

// Filter available tasks
function filterAvailableTasks() {
    const category = document.getElementById('categoryFilter')?.value || '';
    const priority = document.getElementById('priorityFilter')?.value || '';
    const searchTerm = document.getElementById('searchTask')?.value?.toLowerCase() || '';
    
    const filtered = allAvailableTasks.filter(task => {
        const taskCategory = task.task_details?.category || '';
        const taskPriority = task.task_details?.priority || '';
        const taskTitle = task.task_details?.title || '';
        const taskDesc = task.task_details?.description || '';
        
        if (category && taskCategory !== category) return false;
        if (priority && taskPriority !== priority) return false;
        if (searchTerm && !taskTitle.toLowerCase().includes(searchTerm) && 
            !taskDesc.toLowerCase().includes(searchTerm)) return false;
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
function switchTaskTab(tab, event) {
    // Update tabs
    document.querySelectorAll('.task-tab').forEach(t => t.classList.remove('active'));
    if (event?.target) {
        event.target.classList.add('active');
    } else {
        // Find tab by data attribute
        const tabElement = document.querySelector(`.task-tab[data-tab="${tab}"]`);
        if (tabElement) tabElement.classList.add('active');
    }
    
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

// Update profile
async function updateProfile() {
    try {
        showLoading(true);
        
        const updates = {
            'personal/full_name': document.getElementById('settingsFullName')?.value || userData?.personal?.full_name,
            'personal/phone_number': document.getElementById('settingsPhone')?.value || userData?.personal?.phone_number,
            'personal/city_location': document.getElementById('settingsLocation')?.value || userData?.personal?.city_location,
            'settings/preferred_project_type': document.getElementById('settingsProjectType')?.value || userData?.settings?.preferred_project_type,
            'settings/work_mode': document.getElementById('settingsWorkMode')?.value || userData?.settings?.work_mode
        };
        
        // Update each field
        for (const [path, value] of Object.entries(updates)) {
            if (value) {
                await firebase.database()
                    .ref(`users/${currentUser.uid}/${path}`)
                    .set(value);
            }
        }
        
        showNotification('Profile updated successfully!', 'success');
        await loadUserData(); // Reload user data
        updateProfileDisplay();
        
    } catch (error) {
        console.error('❌ Error updating profile:', error);
        showNotification('Error updating profile: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// Update professional info
async function updateProfessional() {
    try {
        showLoading(true);
        
        const updates = {
            'professional/main_category': document.getElementById('settingsCategory')?.value || userData?.professional?.main_category,
            'professional/skill_set': document.getElementById('settingsSkills')?.value || userData?.professional?.skill_set,
            'professional/experience_level': document.getElementById('settingsExperience')?.value || userData?.professional?.experience_level,
            'professional/rate_per_hour': parseInt(document.getElementById('settingsRate')?.value) || userData?.professional?.rate_per_hour,
            'professional/hours_per_week': document.getElementById('settingsHours')?.value || userData?.professional?.hours_per_week
        };
        
        // Update each field
        for (const [path, value] of Object.entries(updates)) {
            if (value !== undefined && value !== '') {
                await firebase.database()
                    .ref(`users/${currentUser.uid}/${path}`)
                    .set(value);
            }
        }
        
        showNotification('Professional info updated successfully!', 'success');
        await loadUserData(); // Reload user data
        updateProfileDisplay();
        
    } catch (error) {
        console.error('❌ Error updating professional info:', error);
        showNotification('Error updating professional info: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// Update notifications
async function updateNotifications() {
    try {
        const notificationsRef = firebase.database().ref(`task_notifications/${currentUser.uid}`);
        const snapshot = await notificationsRef.once('value');
        const notifications = snapshot.val() || {};
        
        let unreadCount = 0;
        let notificationsHtml = '';
        
        Object.entries(notifications).forEach(([taskId, notification]) => {
            if (!notification.read) unreadCount++;
            
            notificationsHtml += `
                <div class="notification-item ${notification.read ? '' : 'unread'}" 
                     onclick="markNotificationRead('${taskId}')">
                    <div class="notification-icon">
                        <i class="fas fa-${notification.type === 'priority_match' ? 'star' : 'bell'}"></i>
                    </div>
                    <div class="notification-content">
                        <p>${escapeHtml(notification.message)}</p>
                        <small>${new Date(notification.timestamp).toLocaleString()}</small>
                    </div>
                </div>
            `;
        });
        
        // Update notification badge
        const badge = document.getElementById('notificationBadge');
        if (badge) {
            badge.textContent = unreadCount;
            badge.style.display = unreadCount > 0 ? 'flex' : 'none';
        }
        
        // Update notifications panel
        const panel = document.getElementById('notificationsPanel');
        if (panel) {
            panel.innerHTML = notificationsHtml || '<div class="empty-state">No notifications</div>';
        }
        
    } catch (error) {
        console.error('❌ Error updating notifications:', error);
    }
}

// Mark notification as read
async function markNotificationRead(taskId) {
    try {
        await firebase.database()
            .ref(`task_notifications/${currentUser.uid}/${taskId}/read`)
            .set(true);
            
        await updateNotifications();
        
    } catch (error) {
        console.error('❌ Error marking notification as read:', error);
    }
}

// Show notification
function showNotification(message, type = 'info') {
    // Remove existing notification if any
    const existing = document.querySelector('.notification-toast');
    if (existing) existing.remove();
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification-toast ${type}`;
    notification.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
        <span>${message}</span>
    `;
    
    document.body.appendChild(notification);
    
    // Show notification
    setTimeout(() => notification.classList.add('show'), 100);
    
    // Auto hide after 3 seconds
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Handle logout
async function handleLogout() {
    try {
        showLoading(true);
        
        // Clean up listeners
        databaseListeners.forEach(ref => ref.off());
        databaseListeners = [];
        
        await firebase.auth().signOut();
        window.location.href = 'index.html';
        
    } catch (error) {
        console.error('❌ Logout error:', error);
        showNotification('Error signing out', 'error');
        showLoading(false);
    }
}

// Make functions globally available
window.showSection = showSection;
window.switchTaskTab = switchTaskTab;
window.filterAvailableTasks = filterAvailableTasks;
window.openTaskWorkspace = openTaskWorkspace;
window.acceptTask = acceptTask;
window.submitTask = submitTask;
window.closeWorkspace = closeWorkspace;
window.closeSubmissionModal = closeSubmissionModal;
window.viewTaskDetails = viewTaskDetails;
window.closeTaskDetailsModal = closeTaskDetailsModal;
window.acceptTaskFromDetails = acceptTaskFromDetails;
window.refreshWorkspace = refreshWorkspace;
window.downloadTaskFiles = downloadTaskFiles;
window.updateProfile = updateProfile;
window.updateProfessional = updateProfessional;
window.updateNotifications = updateNotifications;
window.markNotificationRead = markNotificationRead;
window.handleLogout = handleLogout;
