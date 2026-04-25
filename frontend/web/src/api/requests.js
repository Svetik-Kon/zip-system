import apiClient from "./client";

export async function getRequests(params = {}) {
  const response = await apiClient.get("/api/requests/", { params });
  return response.data;
}

export async function getRequestById(id) {
  const response = await apiClient.get(`/api/requests/${id}/`);
  return response.data;
}

export async function createRequest(payload) {
  const response = await apiClient.post("/api/requests/", payload);
  return response.data;
}

export async function createComment(requestId, payload) {
  const response = await apiClient.post(`/api/requests/${requestId}/comments/`, payload);
  return response.data;
}

export async function assignRequest(requestId, payload) {
  const response = await apiClient.post(`/api/requests/${requestId}/assign/`, payload);
  return response.data;
}

export async function changeRequestStatus(requestId, payload) {
  const response = await apiClient.post(`/api/requests/${requestId}/change-status/`, payload);
  return response.data;
}