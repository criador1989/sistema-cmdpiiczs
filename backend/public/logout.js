document.getElementById('logoutBtn').addEventListener('click', async () => {
  await fetch('/auth/logout', {
    method: 'POST',
    credentials: 'include'
  });
  window.location.href = '/login.html';
});
