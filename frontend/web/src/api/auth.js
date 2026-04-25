import axios from "axios";
import { getAccessToken } from "../utils/auth";

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

export async function getAssignableUsersRequest() {
  const token = getAccessToken();

  const response = await axios.get(`${AUTH_BASE_URL}/api/users/assignable/`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return response.data;
}


export async function getOrganizationsRequest() {
  const token = getAccessToken();

  const response = await axios.get(`${AUTH_BASE_URL}/api/admin/organizations/`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return response.data;
}

export async function createUserRequest(payload) {
  const token = getAccessToken();

  const response = await axios.post(`${AUTH_BASE_URL}/api/admin/users/`, payload, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return response.data;
}