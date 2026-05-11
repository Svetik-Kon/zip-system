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

export async function createOrganizationRequest(payload) {
  const token = getAccessToken();

  const response = await axios.post(`${AUTH_BASE_URL}/api/admin/organizations/`, payload, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return response.data;
}

export async function deleteOrganizationRequest(organizationId) {
  const token = getAccessToken();

  await axios.delete(`${AUTH_BASE_URL}/api/admin/organizations/${organizationId}/`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function updateOrganizationRequest(organizationId, payload) {
  const token = getAccessToken();

  const response = await axios.patch(`${AUTH_BASE_URL}/api/admin/organizations/${organizationId}/`, payload, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return response.data;
}

export async function getAdminUsersRequest(params = {}) {
  const token = getAccessToken();

  const response = await axios.get(`${AUTH_BASE_URL}/api/admin/users/`, {
    params,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return response.data;
}

export async function updateAdminUserRequest(userId, payload) {
  const token = getAccessToken();

  const response = await axios.patch(`${AUTH_BASE_URL}/api/admin/users/${userId}/`, payload, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return response.data;
}

export async function deleteAdminUserRequest(userId) {
  const token = getAccessToken();

  await axios.delete(`${AUTH_BASE_URL}/api/admin/users/${userId}/`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function changeAdminUserPasswordRequest(userId, password) {
  const token = getAccessToken();

  const response = await axios.post(
    `${AUTH_BASE_URL}/api/admin/users/${userId}/password/`,
    { password },
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  return response.data;
}
