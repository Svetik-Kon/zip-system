import axios from "axios";

const AUTH_BASE_URL = "http://localhost:8001";

export async function loginRequest(username, password) {
  const response = await axios.post(`${AUTH_BASE_URL}/api/auth/login/`, {
    username,
    password,
  });

  return response.data;
}

export async function getMeRequest(token) {
  const response = await axios.get(`${AUTH_BASE_URL}/api/auth/me/`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return response.data;
}