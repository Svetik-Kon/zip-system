export function saveAuth(data) {
  localStorage.setItem("access", data.access);
  localStorage.setItem("refresh", data.refresh);
}

export function clearAuth() {
  localStorage.removeItem("access");
  localStorage.removeItem("refresh");
  localStorage.removeItem("me");
}

export function getAccessToken() {
  return localStorage.getItem("access");
}

export function saveMe(me) {
  localStorage.setItem("me", JSON.stringify(me));
}

export function getMe() {
  const raw = localStorage.getItem("me");
  return raw ? JSON.parse(raw) : null;
}

export function isAuthenticated() {
  return Boolean(localStorage.getItem("access"));
}