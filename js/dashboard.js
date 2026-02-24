import { auth, database } from './firebase-config.js';
import { ref, onValue, get, child, update } from 'firebase/database';
import { onAuthStateChanged } from 'firebase/auth';

// Global variables
let currentUser = null;
let userData = null;

// Initialize dashboard
document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser = user;
            await loadUserData();
            loadDashboardData();
            setupRealtimeListeners();
        }
    });
});

async function loadUserData() {
    const userRef = ref(database, `users/${currentUser.uid}`);
    const snapshot = await get(userRef);
    
    if (snapshot.exists()) {
        userData = snapshot.val();
        updateUserInfo();
    }
}

function updateUserInfo() {
    document.getElementById('userName').textContent = 
        userData?.personal?.full_name || 'User';
    document.getElementById('userEmail').textContent = 
        userData?.personal?.email_address || '';
}

function setupRealtimeListeners() {
    // Listen for user tasks updates
    const userTasksRef = ref(database, `user_tasks/${currentUser.uid}`);
    onValue(userTasksRef, (snapshot) => {
        if (snapshot.exists()) {
            updateUserStats(snapshot.val());
        }
    });
    
    // Listen for notifications
    const notificationsRef = ref(database, `task_notifications/${currentUser.uid}`);
    onValue(notificationsRef, (snapshot) => {
        if (snapshot.exists()) {
            updateNotifications(snapshot.val());
        }
    });
}

function updateUserStats(userTasks) {
    const stats = userTasks.stats || {};
    
    document.getElementById('tasksInProgress').textContent = 
        stats.tasks_in_progress || 0;
    document.getElementById('tasksAvailable').textContent = 
        stats.tasks_available || 0;
    document.getElementById('tasksCompleted').textContent = 
        stats.tasks_completed || 0;
    document.getElementById('totalEarned').textContent = 
        `KES ${stats.total_earned || 0}`;
}

function updateNotifications(notifications) {
    const unreadCount = Object.values(notifications).filter(n => !n.read).length;
    document.getElementById('notificationCount').textContent = unreadCount;
}

async function loadDashboardData() {
    await loadAvailableTasks();
    await loadCurrentTasks();
}

async function loadAvailableTasks() {
    const availableTasksRef = ref(database, 'available_tasks');
    const snapshot = await get(availableTasksRef);
    
    if (snapshot.exists()) {
        displayAvailableTasks(snapshot.val());
    }
}

function displayAvailableTasks(tasks) {
    const container = document.getElementById('availableTasksContainer');
    container.innerHTML = '';
    
    let tasksFound = false;
    
    // Loop through categories and priorities
    for (const [category, priorities] of Object.entries(tasks)) {
        for (const [priority, taskList] of Object.entries(priorities)) {
            for (const [taskId, task] of Object.entries(taskList)) {
                tasksFound = true;
                container.appendChild(createTaskCard(taskId, task, category, priority, true));
            }
        }
    }
    
    if (!tasksFound) {
        container.innerHTML = '<p class="no-tasks">No available tasks at the moment.</p>';
    }
    
    // Add filter functionality
    setupFilters();
}

function createTaskCard(taskId, task, category, priority, isAvailable = true) {
    const card = document.createElement('div');
    card.className = 'task-card';
    card.dataset.taskId = taskId;
    card.dataset.category = category;
    card.dataset.priority = priority;
    
    const priorityClass = `priority-${priority}`;
    
    card.innerHTML = `
        <div class="task-header">
            <span class="priority-badge ${priorityClass}">${priority.toUpperCase()}</span>
            <span class="task-category">${getCategoryName(category)}</span>
        </div>
        <h3 class="task-title">${task.title}</h3>
        <p class="task-description">${task.description || 'No description provided'}</p>
        <div class="task-details">
            <span><i class="fas fa-money-bill-wave"></i> KES ${task.budget}</span>
            <span><i class="fas fa-clock"></i> ${task.estimated_hours} hrs</span>
            <span><i class="fas fa-calendar"></i> ${formatDate(task.deadline)}</span>
        </div>
        <div class="task-actions">
            ${isAvailable ? 
                `<button class="btn btn-primary accept-task" data-task-id="${taskId}">Accept Task</button>` :
                `<button class="btn btn-primary view-task" data-task-id="${taskId}">View Details</button>`
            }
            <button class="btn btn-outline view-details" data-task-id="${taskId}">Details</button>
        </div>
    `;
    
    // Add event listeners
    const acceptBtn = card.querySelector('.accept-task');
    if (acceptBtn) {
        acceptBtn.addEventListener('click', () => acceptTask(taskId));
    }
    
    const viewBtn = card.querySelector('.view-details');
    if (viewBtn) {
        viewBtn.addEventListener('click', () => showTaskDetails(taskId));
    }
    
    return card;
}

async function loadCurrentTasks() {
    const userTasksRef = ref(database, `user_tasks/${currentUser.uid}/assigned_tasks`);
    const snapshot = await get(userTasksRef);
    
    const container = document.getElementById('currentTasksContainer');
    container.innerHTML = '';
    
    if (snapshot.exists()) {
        const tasks = snapshot.val();
        
        for (const [taskId, taskInfo] of Object.entries(tasks)) {
            if (taskInfo.current_status === 'in_progress') {
                const taskDetails = await getTaskDetails(taskId);
                if (taskDetails) {
                    container.appendChild(createCurrentTaskCard(taskId, taskDetails, taskInfo));
                }
            }
        }
    }
    
    if (container.children.length === 0) {
        container.innerHTML = '<p class="no-tasks">No tasks in progress.</p>';
    }
}

async function getTaskDetails(taskId) {
    const taskRef = ref(database, `tasks/${taskId}`);
    const snapshot = await get(taskRef);
    return snapshot.exists() ? snapshot.val() : null;
}

function createCurrentTaskCard(taskId, taskDetails, taskInfo) {
    const card = document.createElement('div');
    card.className = 'task-card current-task';
    
    const task = taskDetails.task_details;
    const priority = task.priority;
    const priorityClass = `priority-${priority}`;
    
    card.innerHTML = `
        <div class="task-header">
            <span class="priority-badge ${priorityClass}">${priority.toUpperCase()}</span>
            <span class="task-status">In Progress</span>
        </div>
        <h3 class="task-title">${task.title}</h3>
        <p class="task-description">${task.description}</p>
        <div class="task-details">
            <span><i class="fas fa-money-bill-wave"></i> KES ${task.budget}</span>
            <span><i class="fas fa-clock"></i> ${task.estimated_hours} hrs</span>
            <span><i class="fas fa-calendar"></i> Deadline: ${formatDate(task.deadline)}</span>
        </div>
        <div class="task-actions">
            <button class="btn btn-primary submit-task" data-task-id="${taskId}">Submit Work</button>
            <button class="btn btn-outline view-details" data-task-id="${taskId}">View Details</button>
        </div>
    `;
    
    // Add event listeners
    const submitBtn = card.querySelector('.submit-task');
    if (submitBtn) {
        submitBtn.addEventListener('click', () => submitTask(taskId));
    }
    
    const viewBtn = card.querySelector('.view-details');
    if (viewBtn) {
        viewBtn.addEventListener('click', () => showTaskDetails(taskId));
    }
    
    return card;
}

async function acceptTask(taskId) {
    if (!confirm('Are you sure you want to accept this task?')) return;
    
    try {
        const updates = {};
        
        // Update task status
        updates[`tasks/${taskId}/status/current`] = 'in_progress';
        updates[`tasks/${taskId}/status/accepted_at`] = Date.now();
        updates[`tasks/${taskId}/assignment/assigned_to`] = currentUser.uid;
        
        // Update user tasks
        updates[`user_tasks/${currentUser.uid}/assigned_tasks/${taskId}`] = {
            assigned_at: Date.now(),
            priority_match: true,
            current_status: 'in_progress'
        };
        
        // Remove from available tasks
        const taskSnapshot = await get(child(ref(database), `tasks/${taskId}`));
        if (taskSnapshot.exists()) {
            const task = taskSnapshot.val();
            const category = task.task_details.category;
            const priority = task.task_details.priority;
            
            updates[`available_tasks/${category}/${priority}/${taskId}`] = null;
        }
        
        await update(ref(database), updates);
        
        showNotification('Task accepted successfully!', 'success');
        loadDashboardData();
        
    } catch (error) {
        showNotification(error.message, 'error');
    }
}

function submitTask(taskId) {
    // Implement task submission logic
    // This would typically open a modal for file upload and notes
    alert('Task submission functionality coming soon!');
}

function showTaskDetails(taskId) {
    const modal = document.getElementById('taskModal');
    const taskDetails = document.getElementById('taskDetails');
    
    // Load task details
    get(child(ref(database), `tasks/${taskId}`)).then((snapshot) => {
        if (snapshot.exists()) {
            const task = snapshot.val();
            taskDetails.innerHTML = formatTaskDetails(task);
            modal.style.display = 'block';
        }
    });
    
    // Close modal when clicking on X or outside
    const closeBtn = modal.querySelector('.close');
    closeBtn.onclick = () => modal.style.display = 'none';
    window.onclick = (event) => {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    };
}

function formatTaskDetails(task) {
    const details = task.task_details;
    const status = task.status;
    const deliverables = task.deliverables;
    
    return `
        <h2>${details.title}</h2>
        <p><strong>Description:</strong> ${details.description}</p>
        <p><strong>Category:</strong> ${getCategoryName(details.category)}</p>
        <p><strong>Priority:</strong> ${details.priority}</p>
        <p><strong>Budget:</strong> KES ${details.budget}</p>
        <p><strong>Estimated Hours:</strong> ${details.estimated_hours}</p>
        <p><strong>Deadline:</strong> ${formatDate(details.deadline)}</p>
        <p><strong>Created:</strong> ${formatDate(details.created_at)}</p>
        
        <h3>Status</h3>
        <p><strong>Current:</strong> ${status.current}</p>
        ${status.accepted_at ? `<p><strong>Accepted:</strong> ${formatDate(status.accepted_at)}</p>` : ''}
        ${status.submitted_at ? `<p><strong>Submitted:</strong> ${formatDate(status.submitted_at)}</p>` : ''}
        
        ${deliverables.files && deliverables.files.length > 0 ? `
            <h3>Deliverables</h3>
            <ul>
                ${deliverables.files.map(file => `<li><a href="${file}" target="_blank">View File</a></li>`).join('')}
            </ul>
            ${deliverables.submission_notes ? `<p><strong>Notes:</strong> ${deliverables.submission_notes}</p>` : ''}
        ` : ''}
        
        ${deliverables.feedback ? `
            <h3>Feedback</h3>
            <p><strong>Rating:</strong> ${deliverables.rating}/5</p>
            <p><strong>Feedback:</strong> ${deliverables.feedback}</p>
        ` : ''}
    `;
}

function setupFilters() {
    const filterBtns = document.querySelectorAll('.filter-btn');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const category = btn.dataset.category;
            filterTasksByCategory(category);
        });
    });
}

function filterTasksByCategory(category) {
    const taskCards = document.querySelectorAll('#availableTasksContainer .task-card');
    
    taskCards.forEach(card => {
        if (category === 'all' || card.dataset.category === category) {
            card.style.display = 'block';
        } else {
            card.style.display = 'none';
        }
    });
}

function getCategoryName(category) {
    const categories = {
        'advert': 'Advert Generation',
        'social': 'Social Media Management',
        'data': 'Data Entry'
    };
    return categories[category] || category;
}

function formatDate(timestamp) {
    if (!timestamp) return 'N/A';
    return new Date(timestamp).toLocaleDateString('en-KE', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    if (notification) {
        notification.textContent = message;
        notification.className = `notification ${type}`;
        notification.classList.add('show');
        
        setTimeout(() => {
            notification.classList.remove('show');
        }, 3000);
    }
}

// Export for use in other files
window.acceptTask = acceptTask;
window.submitTask = submitTask;
