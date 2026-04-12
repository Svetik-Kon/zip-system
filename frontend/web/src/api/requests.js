import apiClient from "./client";

export async function getRequests() {
  const response = await apiClient.get("/api/requests/");
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