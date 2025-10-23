(function () {
  function ensureNotificationStyles() {
    if (document.getElementById('ui-notification-styles')) return;
    const style = document.createElement('style');
    style.id = 'ui-notification-styles';
    style.textContent = `
      .notification {
        position: fixed;
        right: 20px;
        bottom: 20px;
        min-width: 260px;
        max-width: 420px;
        padding: 12px 14px;
        margin-top: 10px;
        background: #111827;
        color: #fff;
        border-radius: 10px;
        box-shadow: 0 10px 24px rgba(2, 6, 23, 0.16);
        display: flex;
        align-items: center;
        gap: 10px;
        opacity: 0;
        transform: translateY(10px);
        transition: all 0.25s ease;
        z-index: 9999;
      }
      .notification.show { opacity: 1; transform: translateY(0); }
      .notification i { font-size: 18px; }
      .notification.success { background: #065f46; }
      .notification.error { background: #7f1d1d; }
      .notification.info { background: #1e3a8a; }
      .notification.warning { background: #92400e; }
    `;
    document.head.appendChild(style);
  }

  function showNotification(message, type = 'info', timeout = 3000) {
    try {
      ensureNotificationStyles();
      const n = document.createElement('div');
      n.className = `notification ${type}`;
      const icon = type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : type === 'warning' ? 'fa-exclamation-triangle' : 'fa-info-circle';
      n.innerHTML = `<i class="fas ${icon}"></i><span>${message}</span>`;
      document.body.appendChild(n);
      // Animate in on next tick
      setTimeout(() => n.classList.add('show'), 50);
      // Auto dismiss
      const closeAfter = Math.max(1000, Number(timeout) || 3000);
      setTimeout(() => {
        n.classList.remove('show');
        setTimeout(() => n.remove(), 250);
      }, closeAfter);
    } catch (e) {
      // Fallback
      console && console.log && console.log(`[${type}]`, message);
      alert(message);
    }
  }

  if (typeof window !== 'undefined') {
    window.showNotification = showNotification;
  }

  // Support ESM/CommonJS import if needed
  try {
    if (typeof module !== 'undefined' && module.exports) {
      module.exports = { showNotification };
    }
  } catch (_) {}
})();
