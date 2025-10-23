// Centralized Authentication Module for Student Attendance System

  // Check if user is logged in
export function isLoggedIn() {
    const loggedIn = localStorage.getItem('isLoggedIn') === 'true';
    const loginTime = localStorage.getItem('loginTime');
    
    // Session timeout (8 hours)
    if (loggedIn && loginTime) {
        const loginDate = new Date(loginTime);
        const now = new Date();
        const hoursDiff = (now - loginDate) / (1000 * 60 * 60);
        
        if (hoursDiff > 8) { // 8 hour session timeout
            localStorage.removeItem('isLoggedIn');
            localStorage.removeItem('loginTime');
        return false;
      }
    }
    
    return loggedIn;
}

// Set login status in localStorage
export function setLoggedIn(status) {
    localStorage.setItem('isLoggedIn', status.toString());
    localStorage.setItem('loginTime', new Date().toISOString());
}

export function logout() {
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('username');
    localStorage.removeItem('loginTime');
    window.location.href = 'login.html';
}

export function confirmLogout(event) {
    event.preventDefault(); // Prevent the default link behavior
    const confirmation = confirm("Are you sure you want to log out?");
    if (confirmation) {
        logout();
      }
    }

export function redirectToLogin() {
    window.location.href = 'login.html';
}

// Validate credentials against fixed values
export function validateCredentials(username, password) {
    return username === 'admin' && password === 'admin123';
    }
    
// Make functions globally available for HTML inline scripts
window.isLoggedIn = isLoggedIn;
window.redirectToLogin = redirectToLogin;
window.logout = logout;
window.confirmLogout = confirmLogout;
