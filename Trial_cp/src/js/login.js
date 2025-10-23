import { isLoggedIn, setLoggedIn, validateCredentials } from './auth.js';

// Login functionality for Student Attendance System
document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('login-form');
    const errorMessage = document.getElementById('error-message');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');

    // Check if user is already logged in
    if (isLoggedIn()) {
        redirectToDashboard();
        return;
    }

    // Focus on username input when page loads
    usernameInput.focus();

    // Handle form submission
    loginForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const username = usernameInput.value.trim(); 
        const password = passwordInput.value.trim();

        console.log('Username:', username);
        console.log('Password:', password);
        
        const isValid = validateCredentials(username, password);
        if (isValid) {
            // Successful login
            setLoggedIn(true);
            console.log('Login status set to:', localStorage.getItem('isLoggedIn'));
            console.log('Login status set to:', localStorage.getItem('isLoggedIn'));
            redirectToDashboard();
        } else {
            // Failed login
            showError();
            passwordInput.value = '';
            passwordInput.focus();
        }
    });

    // Clear error when user starts typing
    usernameInput.addEventListener('input', clearError);
    passwordInput.addEventListener('input', clearError);

    // Allow Enter key to submit form
    usernameInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            passwordInput.focus();
        }
    });

    passwordInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            loginForm.dispatchEvent(new Event('submit'));
        }
    });
});

// Show error message
function showError() {
    const errorMessage = document.getElementById('error-message');
    errorMessage.style.display = 'flex';
    
    // Add shake animation to form
    const loginForm = document.getElementById('login-form');
    loginForm.classList.add('shake');
    setTimeout(() => {
        loginForm.classList.remove('shake');
    }, 500);
}

// Clear error message
function clearError() {
    const errorMessage = document.getElementById('error-message');
    errorMessage.style.display = 'none';
}

// Redirect to dashboard
function redirectToDashboard() {
    window.location.href = 'dashboard.html';
}
