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
let currentWorkspaceTask = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    checkAuthState();
    setupEventListeners();
});

// Check authentication state
function checkAuthState() {
    firebase.auth().onAuthStateChanged(async (user) => {
        if (user) {
            currentUser = user;
            await loadUserData();
            await loadUserTasks();
            await loadAvailableTasks();
            updateUI();
            hideLoading();
            setupRealtimeListeners();
        } else {
            // Redirect to login
            window.location.href = 'index.html';
        }
    });
}

// Hide loading state
function hideLoading() {
    document.getElementById('loadingState').style.display = 'none';
    document.querySelectorAll('.content-section').forEach(section => {
        if (section.id === 'tasks-section') {
            section.classList.add('active');
        }
    });
}

// Setup event listeners
function setupEventListeners() {
    // Toggle profile dropdown
    document.getElementById('userProfile').addEventListener('click', function(e) {
        e.stopPropagation();
        document.getElementById('profileDropdown').classList.toggle('show');
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', function() {
        document.getElementById('profileDropdown').classList.remove('show');
    });

    // Handle fullscreen changes
    document.addEventListener('fullscreenchange', updateFullscreenButton);
}

// Load user data from Firebase
async function loadUserData() {
    try {
        const snapshot = await firebase.database().ref(`users/${currentUser.uid}`).once('value');
        userData = snapshot.val();
        
        if (!userData) {
            // Create basic user profile if it doesn't exist
            userData = {
                personal: {
                    full_name: currentUser.displayName || 'Freelancer',
                    email_address: currentUser.email,
                    phone_number: '',
                    city_location: '',
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
                    verification_status: false
                },
                settings: {
                    preferred_project_type: 'project_based',
                    work_mode: 'remote'
                },
                account_state: 'active',
                system_data: {
                    last_login: Date.now()
                }
            };
            await firebase.database().ref(`users/${currentUser.uid}`).set(userData);
        } else {
            // Update last login
            await firebase.database().ref(`users/${currentUser.uid}/system_data/last_login`).set(Date.now());
        }
        
        // Load user tasks stats
        const tasksSnapshot = await firebase.database().ref(`user_tasks/${currentUser.uid}`).once('value');
        const userTasksData = tasksSnapshot.val() || {
            stats: {
                tasks_in_progress: 0,
                tasks_available: 0,
                tasks_completed: 0,
                total_earned: 0,
                average_rating: 0
            }
        };
        
        userData.tasks = userTasksData;
        updateProfileDisplay();
        
    } catch (error) {
        console.error('Error loading user data:', error);
        showNotification('Error loading profile data', 'error');
    }
}

// Load user tasks
async function loadUserTasks() {
    try {
        // Reset tasks
        userTasks = {
            priority: [],
            assigned: [],
            inProgress: [],
            completed: []
        };
        
        // Get all tasks assigned to user
        const tasksSnapshot = await firebase.database().ref('tasks').once('value');
        const allTasks = tasksSnapshot.val() || {};
        
        Object.entries(allTasks).forEach(([taskId, task]) => {
            if (task.assignment && task.assignment.assigned_to === currentUser.uid) {
                task.id = taskId;
                
                // Categorize by status
                switch(task.status?.current) {
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
        
        // Update user_tasks stats in Firebase
        const totalEarned = userTasks.completed.reduce((sum, task) => 
            sum + (task.task_details?.budget || 0), 0);
        
        await firebase.database().ref(`user_tasks/${currentUser.uid}/stats`).set({
            tasks_in_progress: userTasks.inProgress.length,
            tasks_available: userTasks.assigned.length,
            tasks_completed: userTasks.completed.length,
            total_earned: totalEarned,
            average_rating: calculateAverageRating()
        });
        
        updateTaskBadges();
        renderTasks();
        
    } catch (error) {
        console.error('Error loading tasks:', error);
        showNotification('Error loading tasks', 'error');
    }
}

// Load available tasks (not assigned to anyone)
async function loadAvailableTasks() {
    try {
        const tasksSnapshot = await firebase.database().ref('tasks').once('value');
        const allTasks = tasksSnapshot.val() || {};
        
        allAvailableTasks = Object.entries(allTasks)
            .filter(([_, task]) => !task.assignment || !task.assignment.assigned_to)
            .map(([id, task]) => ({ id, ...task }));
        
        renderAvailableTasks();
        updateTaskBadges();
        
    } catch (error) {
        console.error('Error loading available tasks:', error);
    }
}

// Setup realtime listeners for task updates
function setupRealtimeListeners() {
    // Listen for new tasks assigned to user
    firebase.database().ref('tasks').on('child_added', (snapshot) => {
        const task = snapshot.val();
        if (task.assignment && task.assignment.assigned_to === currentUser.uid) {
            showNotification('New task assigned!', 'success');
            loadUserTasks();
        }
    });

    // Listen for task status changes
    firebase.database().ref('tasks').on('child_changed', (snapshot) => {
        const task = snapshot.val();
        if (task.assignment && task.assignment.assigned_to === currentUser.uid) {
            loadUserTasks();
        }
    });
    
    // Listen for new available tasks
    firebase.database().ref('tasks').on('child_added', (snapshot) => {
        const task = snapshot.val();
        if (!task.assignment || !task.assignment.assigned_to) {
            loadAvailableTasks();
            showNotification('New task available!', 'info');
        }
    });
}

// Update profile display
function updateProfileDisplay() {
    const personal = userData.personal || {};
    const professional = userData.professional || {};
    
    // Get initials
    const name = personal.full_name || 'Freelancer';
    const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
    
    // Update avatar
    document.getElementById('userAvatar').textContent = initials;
    document.getElementById('profileAvatar').textContent = initials;
    
    // Update names
    document.getElementById('userName').textContent = name;
    document.getElementById('profileName').textContent = name;
    document.getElementById('profileEmail').textContent = personal.email_address || '';
    document.getElementById('profileSkills').textContent = professional.skill_set || 'No skills added';
    
    // Calculate stats from userTasks
    const completedCount = userTasks.completed.length;
    const activeCount = userTasks.inProgress.length;
    const totalEarned = userTasks.completed.reduce((sum, task) => 
        sum + (task.task_details?.budget || 0), 0);
    const avgRating = calculateAverageRating();
    
    document.getElementById('profileCompleted').textContent = completedCount;
    document.getElementById('profileEarnings').textContent = 
        new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 0 })
            .format(totalEarned);
    document.getElementById('profileRating').textContent = avgRating.toFixed(1);
    document.getElementById('profileActive').textContent = activeCount;
    
    // Update task stats
    document.getElementById('taskStats').innerHTML = `
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
            <div class="stat-label">Priority Tasks</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${allAvailableTasks.length}</div>
            <div class="stat-label">Available</div>
        </div>
    `;
    
    // Update settings form with current values
    document.getElementById('settingsFullName').value = personal.full_name || '';
    document.getElementById('settingsPhone').value = personal.phone_number || '';
    document.getElementById('settingsLocation').value = personal.city_location || 'Nairobi';
    document.getElementById('settingsCategory').value = professional.main_category || 'advert';
    document.getElementById('settingsSkills').value = professional.skill_set || '';
    document.getElementById('settingsExperience').value = professional.experience_level || '0-1 years';
    document.getElementById('settingsRate').value = professional.rate_per_hour || 0;
}

// Calculate average rating
function calculateAverageRating() {
    const ratings = userTasks.completed
        .map(task => task.deliverables?.rating)
        .filter(r => r && r > 0);
    
    if (ratings.length === 0) return 0;
    return ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
}

// Update task badges
function updateTaskBadges() {
    document.getElementById('priorityBadge').textContent = userTasks.priority.length;
    document.getElementById('availableBadge').textContent = allAvailableTasks.length;
    document.getElementById('progressBadge').textContent = userTasks.inProgress.length;
    document.getElementById('activeTasksBadge').textContent = 
        `${userTasks.inProgress.length} Active`;
    document.getElementById('priorityTasksBadge').textContent = userTasks.priority.length;
    document.getElementById('availableTasksBadge').textContent = allAvailableTasks.length;
    document.getElementById('inProgressBadge').textContent = userTasks.inProgress.length;
    document.getElementById('completedTasksBadge').textContent = userTasks.completed.length;
}

// Render all tasks
function renderTasks() {
    renderPriorityTasks();
    renderAssignedTasks();
    renderInProgressTasks();
    renderRecentTasks();
    renderCompletedTasks();
}

// Render priority tasks
function renderPriorityTasks() {
    const container = document.getElementById('priorityTasksContainer');
    const priorityContainer = document.getElementById('priority-tasks-container');
    
    if (userTasks.priority.length === 0) {
        const emptyHtml = getEmptyState('No priority tasks at the moment', 'star');
        container.innerHTML = emptyHtml;
        priorityContainer.innerHTML = emptyHtml;
        return;
    }
    
    let html = '';
    userTasks.priority.forEach(task => {
        html += getTaskCardHTML(task, 'priority');
    });
    
    container.innerHTML = html;
    priorityContainer.innerHTML = html;
}

// Render assigned tasks
function renderAssignedTasks() {
    const container = document.getElementById('assigned-tasks-container');
    
    if (userTasks.assigned.length === 0) {
        container.innerHTML = getEmptyState('No assigned tasks', 'tasks');
        return;
    }
    
    let html = '';
    userTasks.assigned.forEach(task => {
        html += getTaskCardHTML(task);
    });
    
    container.innerHTML = html;
}

// Render in-progress tasks
function renderInProgressTasks() {
    const container = document.getElementById('inProgressContainer');
    const inProgressContainer = document.getElementById('in-progress-tasks-container');
    
    if (userTasks.inProgress.length === 0) {
        const emptyHtml = getEmptyState('No tasks in progress', 'play-circle');
        container.innerHTML = emptyHtml;
        inProgressContainer.innerHTML = emptyHtml;
        return;
    }
    
    let html = '';
    userTasks.inProgress.forEach(task => {
        html += getTaskCardHTML(task, 'in-progress');
    });
    
    container.innerHTML = html;
    inProgressContainer.innerHTML = html;
}

// Render recent tasks (last 3 completed)
function renderRecentTasks() {
    const container = document.getElementById('recent-tasks-container');
    
    const recent = [...userTasks.completed]
        .sort((a, b) => (b.status?.completed_at || 0) - (a.status?.completed_at || 0))
        .slice(0, 3);
    
    if (recent.length === 0) {
        container.innerHTML = getEmptyState('No completed tasks yet', 'check-circle');
        return;
    }
    
    let html = '';
    recent.forEach(task => {
        html += getTaskCardHTML(task, 'completed');
    });
    
    container.innerHTML = html;
}

// Render completed tasks
function renderCompletedTasks() {
    const container = document.getElementById('completedTasksContainer');
    
    if (userTasks.completed.length === 0) {
        container.innerHTML = getEmptyState('No completed tasks', 'check-circle');
        return;
    }
    
    let html = '';
    userTasks.completed.forEach(task => {
        html += getTaskCardHTML(task, 'completed');
    });
    
    container.innerHTML = html;
}

// Render available tasks
function renderAvailableTasks() {
    const container = document.getElementById('availableTasksContainer');
    
    if (allAvailableTasks.length === 0) {
        container.innerHTML = getEmptyState('No tasks available at the moment', 'clock');
        return;
    }
    
    let html = '';
    allAvailableTasks.forEach(task => {
        html += getAvailableTaskCardHTML(task);
    });
    
    container.innerHTML = html;
}

// Filter available tasks
function filterAvailableTasks() {
    const category = document.getElementById('categoryFilter').value;
    const priority = document.getElementById('priorityFilter').value;
    
    const filtered = allAvailableTasks.filter(task => {
        const taskCategory = task.task_details?.category || '';
        const taskPriority = task.task_details?.priority || '';
        
        if (category && taskCategory !== category) return false;
        if (priority && taskPriority !== priority) return false;
        return true;
    });
    
    const container = document.getElementById('availableTasksContainer');
    
    if (filtered.length === 0) {
        container.innerHTML = getEmptyState('No tasks match your filters', 'filter');
        return;
    }
    
    let html = '';
    filtered.forEach(task => {
        html += getAvailableTaskCardHTML(task);
    });
    
    container.innerHTML = html;
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
    const budget = details.budget ? 
        new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 0 })
            .format(details.budget) : 'Not set';
    
    const statusClass = type === 'priority' ? 'status-assigned' : 
                       type === 'in-progress' ? 'status-in-progress' : 
                       type === 'completed' ? 'status-completed' : 'status-assigned';
    
    const statusText = type === 'priority' ? 'Priority' : 
                      type === 'in-progress' ? 'In Progress' : 
                      type === 'completed' ? 'Completed' : 'Assigned';
    
    return `
        <div class="task-card ${type === 'priority' ? 'priority' : ''}" onclick="openTaskWorkspace('${task.id}')">
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
                    <i class="fas fa-play"></i> ${type === 'in-progress' ? 'Continue' : 'Start'} Working
                </button>
                ${type === 'completed' ? `
                    <button class="btn btn-secondary" onclick="viewTaskFeedback('${task.id}')">
                        <i class="fas fa-star"></i> View Feedback
                    </button>
                ` : ''}
            </div>
        </div>
    `;
}

// Get available task card HTML
function getAvailableTaskCardHTML(task) {
    const details = task.task_details || {};
    const deadline = details.deadline ? new Date(details.deadline).toLocaleDateString() : 'Not set';
    const budget = details.budget ? 
        new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 0 })
            .format(details.budget) : 'Not set';
    
    const priorityClass = details.priority === 'high' ? 'status-assigned' : 
                         details.priority === 'medium' ? 'status-in-progress' : 'status-completed';
    
    // Check if this task matches user's primary category
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
                ${isPriorityMatch ? '<br><small><i class="fas fa-star" style="color: var(--warning);"></i> Matches your primary category!</small>' : ''}
            </div>
            <div class="task-actions">
                <button class="btn btn-primary" onclick="acceptTask('${task.id}')">
                    <i class="fas fa-check"></i> Accept Task
                </button>
                <button class="btn btn-secondary" onclick="viewTaskDetails('${task.id}')">
                    <i class="fas fa-info-circle"></i> Details
                </button>
            </div>
        </div>
    `;
}

// Update UI
function updateUI() {
    updateProfileDisplay();
    updateTaskBadges();
}

// Switch task tabs
function switchTaskTab(tab) {
    // Update tab buttons
    document.querySelectorAll('.task-tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');
    
    // Update containers
    document.querySelectorAll('.task-list').forEach(c => c.classList.remove('active'));
    
    switch(tab) {
        case 'priority':
            document.getElementById('priority-tasks-container').classList.add('active');
            break;
        case 'assigned':
            document.getElementById('assigned-tasks-container').classList.add('active');
            break;
        case 'in-progress':
            document.getElementById('in-progress-tasks-container').classList.add('active');
            break;
        case 'recent':
            document.getElementById('recent-tasks-container').classList.add('active');
            break;
    }
}

// Show section
function showSection(sectionId) {
    // Update menu active state
    document.querySelectorAll('.menu-link').forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('onclick')?.includes(sectionId)) {
            link.classList.add('active');
        }
    });
    
    // Show section
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
    });
    document.getElementById(sectionId).classList.add('active');
    
    // Load section-specific data if needed
    if (sectionId === 'available-tasks-section') {
        loadAvailableTasks();
    } else if (sectionId === 'performance-section') {
        loadPerformanceData();
    } else if (sectionId === 'documents-section') {
        loadDocuments();
    }
}

// Load performance data
async function loadPerformanceData() {
    const metricsContainer = document.getElementById('performanceMetrics');
    
    try {
        const totalEarned = userTasks.completed.reduce((sum, task) => 
            sum + (task.task_details?.budget || 0), 0);
        
        const monthlyEarned = userTasks.completed
            .filter(task => {
                const date = new Date(task.status?.completed_at || 0);
                const now = new Date();
                return date.getMonth() === now.getMonth() && 
                       date.getFullYear() === now.getFullYear();
            })
            .reduce((sum, task) => sum + (task.task_details?.budget || 0), 0);
        
        const avgCompletionTime = calculateAvgCompletionTime();
        const avgRating = calculateAverageRating();
        const completionRate = userTasks.completed.length / 
            (userTasks.completed.length + userTasks.inProgress.length + userTasks.assigned.length) * 100 || 0;
        
        metricsContainer.innerHTML = `
            <div class="metric-card">
                <h3 class="metric-title">Completion Rate</h3>
                <div class="stat-number">${completionRate.toFixed(1)}%</div>
                <div class="stat-label">${userTasks.completed.length} of ${userTasks.completed.length + userTasks.inProgress.length + userTasks.assigned.length} tasks</div>
            </div>
            <div class="metric-card">
                <h3 class="metric-title">Total Earnings</h3>
                <div class="stat-number">${new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 0 }).format(totalEarned)}</div>
                <div class="stat-label">This month: ${new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 0 }).format(monthlyEarned)}</div>
            </div>
            <div class="metric-card">
                <h3 class="metric-title">Avg. Completion Time</h3>
                <div class="stat-number">${avgCompletionTime.toFixed(1)} days</div>
                <div class="stat-label">From acceptance to submission</div>
            </div>
            <div class="metric-card">
                <h3 class="metric-title">Client Rating</h3>
                <div class="stat-number">${avgRating.toFixed(1)}</div>
                <div class="stat-label">Based on ${userTasks.completed.length} reviews</div>
            </div>
        `;
        
        // Update charts
        updateCharts();
        
    } catch (error) {
        console.error('Error loading performance data:', error);
        metricsContainer.innerHTML = getEmptyState('Error loading performance data', 'exclamation-triangle');
    }
}

// Calculate average completion time
function calculateAvgCompletionTime() {
    const times = userTasks.completed
        .map(task => {
            const accepted = task.status?.accepted_at;
            const completed = task.status?.completed_at;
            if (accepted && completed) {
                return (completed - accepted) / (1000 * 60 * 60 * 24); // Convert to days
            }
            return null;
        })
        .filter(t => t !== null);
    
    if (times.length === 0) return 0;
    return times.reduce((sum, t) => sum + t, 0) / times.length;
}

// Update charts (simplified version)
function updateCharts() {
    const completionChart = document.getElementById('completionChart');
    const earningsChart = document.getElementById('earningsChart');
    
    // Group tasks by month
    const monthlyData = {};
    userTasks.completed.forEach(task => {
        const date = new Date(task.status?.completed_at || 0);
        const monthYear = `${date.getMonth() + 1}/${date.getFullYear()}`;
        
        if (!monthlyData[monthYear]) {
            monthlyData[monthYear] = { count: 0, earnings: 0 };
        }
        monthlyData[monthYear].count++;
        monthlyData[monthYear].earnings += task.task_details?.budget || 0;
    });
    
    // Create simple bar chart representation
    let completionHtml = '<div style="display: flex; gap: 10px; height: 150px; align-items: flex-end;">';
    let earningsHtml = '<div style="display: flex; gap: 10px; height: 150px; align-items: flex-end;">';
    
    const months = Object.keys(monthlyData).slice(-6); // Last 6 months
    const maxCount = Math.max(...months.map(m => monthlyData[m].count), 1);
    const maxEarnings = Math.max(...months.map(m => monthlyData[m].earnings), 1);
    
    months.forEach(month => {
        const count = monthlyData[month].count;
        const earnings = monthlyData[month].earnings;
        
        completionHtml += `
            <div style="flex: 1; display: flex; flex-direction: column; align-items: center;">
                <div style="height: ${(count / maxCount) * 120}px; width: 30px; background: var(--light-blue); border-radius: 4px 4px 0 0;"></div>
                <div style="margin-top: 5px; font-size: 0.7rem;">${month}</div>
            </div>
        `;
        
        earningsHtml += `
            <div style="flex: 1; display: flex; flex-direction: column; align-items: center;">
                <div style="height: ${(earnings / maxEarnings) * 120}px; width: 30px; background: var(--highlight); border-radius: 4px 4px 0 0;"></div>
                <div style="margin-top: 5px; font-size: 0.7rem;">${month}</div>
            </div>
        `;
    });
    
    completionHtml += '</div>';
    earningsHtml += '</div>';
    
    completionChart.innerHTML = completionHtml;
    earningsChart.innerHTML = earningsHtml;
}

// Load documents
async function loadDocuments() {
    const container = document.getElementById('documentsList');
    
    try {
        const documents = [];
        
        // Add user's uploaded documents
        if (userData.files) {
            if (userData.files.cv_file_url) {
                documents.push({
                    title: 'Curriculum Vitae',
                    url: userData.files.cv_file_url,
                    type: 'document',
                    category: 'personal'
                });
            }
            if (userData.files.id_file_url) {
                documents.push({
                    title: 'ID Document',
                    url: userData.files.id_file_url,
                    type: 'document',
                    category: 'personal'
                });
            }
        }
        
        // Add task-related documents
        userTasks.completed.forEach(task => {
            if (task.deliverables?.files) {
                task.deliverables.files.forEach((file, index) => {
                    documents.push({
                        title: `${task.task_details?.title} - Deliverable ${index + 1}`,
                        url: file,
                        type: 'worksheet',
                        category: 'work',
                        taskId: task.id
                    });
                });
            }
        });
        
        if (documents.length === 0) {
            container.innerHTML = getEmptyState('No documents available', 'file-alt');
            return;
        }
        
        let html = '';
        documents.forEach(doc => {
            html += `
                <div class="document-card">
                    <h3 class="document-title">${doc.title}</h3>
                    <div class="document-meta">
                        <i class="fas fa-${doc.type === 'worksheet' ? 'file-excel' : 'file-pdf'}"></i>
                        ${doc.type === 'worksheet' ? 'Worksheet' : 'Document'}
                    </div>
                    <div class="document-actions">
                        <button class="btn btn-primary" onclick="openDocument('${doc.url}')">
                            <i class="fas fa-external-link-alt"></i> Open
                        </button>
                        <button class="btn btn-secondary" onclick="downloadDocument('${doc.url}')">
                            <i class="fas fa-download"></i> Download
                        </button>
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = html;
        
    } catch (error) {
        console.error('Error loading documents:', error);
        container.innerHTML = getEmptyState('Error loading documents', 'exclamation-triangle');
    }
}

// Filter documents
function filterDocuments(category) {
    // Update active category
    document.querySelectorAll('.category-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    
    // Reload documents with filter (simplified - in production, you'd filter the existing list)
    loadDocuments();
}

// Open task workspace
async function openTaskWorkspace(taskId) {
    try {
        const snapshot = await firebase.database().ref(`tasks/${taskId}`).once('value');
        const task = snapshot.val();
        
        if (!task) {
            showNotification('Task not found', 'error');
            return;
        }
        
        task.id = taskId;
        currentWorkspaceTask = task;
        
        // Update task status to in_progress if it's just starting
        if (task.status?.current === 'available') {
            await firebase.database().ref(`tasks/${taskId}/status`).update({
                current: 'in_progress',
                accepted_at: Date.now()
            });
            
            // Update user_tasks stats
            await firebase.database().ref(`user_tasks/${currentUser.uid}/assigned_tasks/${taskId}`).update({
                current_status: 'in_progress'
            });
        }
        
        document.getElementById('workspaceTitle').textContent = task.task_details?.title || 'Task Workspace';
        
        // If task has a worksheet URL, open it
        if (task.task_details?.worksheet_url) {
            document.getElementById('workspaceFrame').src = task.task_details.worksheet_url;
        } else {
            // Create a simple workspace if no URL
            document.getElementById('workspaceFrame').srcdoc = `
                <html>
                <head>
                    <style>
                        body { font-family: Arial, sans-serif; padding: 20px; }
                        h1 { color: #0a192f; }
                        .content { max-width: 800px; margin: 0 auto; }
                    </style>
                </head>
                <body>
                    <div class="content">
                        <h1>${task.task_details?.title || 'Task Workspace'}</h1>
                        <p>${task.task_details?.description || 'No description provided.'}</p>
                        <h3>Task Details:</h3>
                        <ul>
                            <li>Budget: ${task.task_details?.budget || 'Not set'} KSh</li>
                            <li>Deadline: ${task.task_details?.deadline ? new Date(task.task_details.deadline).toLocaleDateString() : 'Not set'}</li>
                            <li>Category: ${task.task_details?.category || 'Not set'}</li>
                        </ul>
                        <p>Use the toolbar below to submit your work.</p>
                    </div>
                </body>
                </html>
            `;
        }
        
        // Update toolbar
        document.getElementById('workspaceToolbar').innerHTML = `
            <button class="btn btn-primary" onclick="submitTaskWork('${taskId}')">
                <i class="fas fa-upload"></i> Submit Work
            </button>
            <button class="btn btn-secondary" onclick="requestClarification('${taskId}')">
                <i class="fas fa-question-circle"></i> Request Clarification
            </button>
            <button class="btn btn-secondary" onclick="saveProgress('${taskId}')">
                <i class="fas fa-save"></i> Save Progress
            </button>
        `;
        
        document.getElementById('workspaceModal').classList.add('active');
        document.body.style.overflow = 'hidden';
        
    } catch (error) {
        console.error('Error opening workspace:', error);
        showNotification('Error opening workspace', 'error');
    }
}

// Accept task
async function acceptTask(taskId) {
    try {
        // Get task details
        const snapshot = await firebase.database().ref(`tasks/${taskId}`).once('value');
        const task = snapshot.val();
        
        if (!task) {
            showNotification('Task not found', 'error');
            return;
        }
        
        // Check if task is already assigned
        if (task.assignment?.assigned_to) {
            showNotification('This task is no longer available', 'error');
            loadAvailableTasks();
            return;
        }
        
        // Assign task to user
        const isPriorityMatch = userData?.professional?.main_category === task.task_details?.category;
        
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
        
        // Add to user_tasks
        await firebase.database().ref(`user_tasks/${currentUser.uid}/assigned_tasks/${taskId}`).set({
            assigned_at: Date.now(),
            priority_match: isPriorityMatch,
            current_status: 'available'
        });
        
        showNotification('Task accepted successfully!', 'success');
        
        // Reload tasks
        await loadUserTasks();
        await loadAvailableTasks();
        
        // Switch to tasks section
        showSection('tasks-section');
        
    } catch (error) {
        console.error('Error accepting task:', error);
        showNotification('Error accepting task', 'error');
    }
}

// Submit task work
async function submitTaskWork(taskId) {
    // In a real app, this would open a form to upload files or add submission notes
    const submissionNotes = prompt('Add submission notes (optional):');
    
    try {
        await firebase.database().ref(`tasks/${taskId}/status`).update({
            current: 'submitted',
            submitted_at: Date.now()
        });
        
        await firebase.database().ref(`user_tasks/${currentUser.uid}/assigned_tasks/${taskId}`).update({
            current_status: 'submitted'
        });
        
        showNotification('Work submitted successfully!', 'success');
        
        // Close workspace and reload tasks
        closeWorkspace();
        await loadUserTasks();
        
    } catch (error) {
        console.error('Error submitting work:', error);
        showNotification('Error submitting work', 'error');
    }
}

// View task feedback
async function viewTaskFeedback(taskId) {
    try {
        const snapshot = await firebase.database().ref(`tasks/${taskId}`).once('value');
        const task = snapshot.val();
        
        const feedback = task.deliverables?.feedback || 'No feedback provided.';
        const rating = task.deliverables?.rating || 'No rating';
        
        alert(`Feedback: ${feedback}\nRating: ${rating}/5`);
        
    } catch (error) {
        console.error('Error viewing feedback:', error);
    }
}

// View task details
function viewTaskDetails(taskId) {
    const task = allAvailableTasks.find(t => t.id === taskId);
    if (!task) return;
    
    const details = task.task_details || {};
    alert(`
Task Details:
Title: ${details.title}
Description: ${details.description}
Budget: ${details.budget} KSh
Deadline: ${new Date(details.deadline).toLocaleDateString()}
Category: ${details.category}
Priority: ${details.priority}
Estimated Hours: ${details.estimated_hours || 'Not specified'}
    `);
}

// Request clarification
function requestClarification(taskId) {
    // In a real app, this would open a messaging interface
    const question = prompt('What would you like to clarify?');
    if (question) {
        // Send to Firebase
        firebase.database().ref(`tasks/${taskId}/clarifications`).push({
            user: currentUser.uid,
            question: question,
            timestamp: Date.now(),
            answered: false
        });
        showNotification('Question sent to admin', 'success');
    }
}

// Save progress
function saveProgress(taskId) {
    // In a real app, this would save the current state
    showNotification('Progress saved', 'success');
}

// Close workspace
function closeWorkspace() {
    document.getElementById('workspaceModal').classList.remove('active');
    document.getElementById('workspaceFrame').src = 'about:blank';
    document.body.style.overflow = 'auto';
    currentWorkspaceTask = null;
}

// Refresh workspace
function refreshWorkspace() {
    const frame = document.getElementById('workspaceFrame');
    if (frame.src && frame.src !== 'about:blank') {
        frame.src = frame.src;
        showNotification('Workspace refreshed');
    }
}

// Toggle fullscreen
function toggleFullscreen() {
    const container = document.querySelector('.workspace-iframe-container');
    if (!document.fullscreenElement) {
        container.requestFullscreen();
    } else {
        document.exitFullscreen();
    }
}

// Update fullscreen button
function updateFullscreenButton() {
    const icon = document.getElementById('fullscreenIcon');
    if (document.fullscreenElement) {
        icon.className = 'fas fa-compress';
    } else {
        icon.className = 'fas fa-expand';
    }
}

// Open document
function openDocument(url) {
    window.open(url, '_blank');
}

// Download document
function downloadDocument(url) {
    const a = document.createElement('a');
    a.href = url;
    a.download = url.split('/').pop();
    a.click();
}

// Update profile
async function updateProfile() {
    const fullName = document.getElementById('settingsFullName').value;
    const phone = document.getElementById('settingsPhone').value;
    const location = document.getElementById('settingsLocation').value;
    
    try {
        await firebase.database().ref(`users/${currentUser.uid}/personal`).update({
            full_name: fullName,
            phone_number: phone,
            city_location: location
        });
        
        // Update display name in Auth
        await currentUser.updateProfile({
            displayName: fullName
        });
        
        userData.personal.full_name = fullName;
        userData.personal.phone_number = phone;
        userData.personal.city_location = location;
        
        updateProfileDisplay();
        showNotification('Profile updated successfully', 'success');
        
    } catch (error) {
        console.error('Error updating profile:', error);
        showNotification('Error updating profile', 'error');
    }
}

// Update professional details
async function updateProfessional() {
    const category = document.getElementById('settingsCategory').value;
    const skills = document.getElementById('settingsSkills').value;
    const experience = document.getElementById('settingsExperience').value;
    const rate = document.getElementById('settingsRate').value;
    
    try {
        await firebase.database().ref(`users/${currentUser.uid}/professional`).update({
            main_category: category,
            skill_set: skills,
            experience_level: experience,
            rate_per_hour: parseInt(rate)
        });
        
        userData.professional.main_category = category;
        userData.professional.skill_set = skills;
        userData.professional.experience_level = experience;
        userData.professional.rate_per_hour = parseInt(rate);
        
        updateProfileDisplay();
        showNotification('Professional details updated', 'success');
        
    } catch (error) {
        console.error('Error updating professional details:', error);
        showNotification('Error updating details', 'error');
    }
}

// Update notification preferences
async function updateNotifications() {
    const notifyPriority = document.getElementById('notifyPriority').checked;
    const notifyAvailable = document.getElementById('notifyAvailable').checked;
    const notifyDeadline = document.getElementById('notifyDeadline').checked;
    const notifyComments = document.getElementById('notifyComments').checked;
    
    try {
        await firebase.database().ref(`users/${currentUser.uid}/settings/notifications`).set({
            priority_tasks: notifyPriority,
            available_tasks: notifyAvailable,
            deadlines: notifyDeadline,
            comments: notifyComments
        });
        
        showNotification('Notification preferences saved', 'success');
        
    } catch (error) {
        console.error('Error saving preferences:', error);
        showNotification('Error saving preferences', 'error');
    }
}

// Show notification
function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
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
        console.error('Error signing out:', error);
        showNotification('Error signing out', 'error');
    }
}

// Make functions globally available
window.showSection = showSection;
window.switchTaskTab = switchTaskTab;
window.filterAvailableTasks = filterAvailableTasks;
window.filterDocuments = filterDocuments;
window.openTaskWorkspace = openTaskWorkspace;
window.acceptTask = acceptTask;
window.submitTaskWork = submitTaskWork;
window.viewTaskFeedback = viewTaskFeedback;
window.viewTaskDetails = viewTaskDetails;
window.requestClarification = requestClarification;
window.saveProgress = saveProgress;
window.closeWorkspace = closeWorkspace;
window.refreshWorkspace = refreshWorkspace;
window.toggleFullscreen = toggleFullscreen;
window.openDocument = openDocument;
window.downloadDocument = downloadDocument;
window.updateProfile = updateProfile;
window.updateProfessional = updateProfessional;
window.updateNotifications = updateNotifications;
window.handleLogout = handleLogout;
