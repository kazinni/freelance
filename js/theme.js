// Theme management
document.addEventListener('DOMContentLoaded', () => {
    // Check for saved theme preference
    const savedTheme = localStorage.getItem('theme') || 'dark-mode';
    document.body.className = savedTheme;
    
    // Update toggle buttons
    updateThemeToggleButtons();
    
    // Add event listeners to all theme toggle buttons
    const toggleButtons = document.querySelectorAll('#themeToggle, .theme-toggle-sidebar');
    toggleButtons.forEach(button => {
        button.addEventListener('click', toggleTheme);
    });
});

function toggleTheme() {
    if (document.body.classList.contains('dark-mode')) {
        document.body.classList.remove('dark-mode');
        document.body.classList.add('light-mode');
        localStorage.setItem('theme', 'light-mode');
    } else {
        document.body.classList.remove('light-mode');
        document.body.classList.add('dark-mode');
        localStorage.setItem('theme', 'dark-mode');
    }
    
    updateThemeToggleButtons();
}

function updateThemeToggleButtons() {
    const isDark = document.body.classList.contains('dark-mode');
    const toggleButtons = document.querySelectorAll('#themeToggle, .theme-toggle-sidebar');
    
    toggleButtons.forEach(button => {
        const moonIcon = button.querySelector('.fa-moon');
        const sunIcon = button.querySelector('.fa-sun');
        
        if (moonIcon && sunIcon) {
            if (isDark) {
                moonIcon.style.display = 'none';
                sunIcon.style.display = 'inline-block';
            } else {
                moonIcon.style.display = 'inline-block';
                sunIcon.style.display = 'none';
            }
        }
    });
}

// Export for use in other files
window.toggleTheme = toggleTheme;
