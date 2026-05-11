import axios from "axios";

const inventoryClient = axios.create({
  baseURL: "http://localhost:8003",
});

inventoryClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("access");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

export async function getCatalogItems(params = {}) {
  const response = await inventoryClient.get("/api/catalog/items/", { params });
  return response.data;
}

export async function createCatalogItem(payload) {
  const response = await inventoryClient.post("/api/catalog/items/", payload);
  return response.data;
}

export async function deleteCatalogItem(id) {
  await inventoryClient.delete(`/api/catalog/items/${id}/`);
}

export async function getContracts(params = {}) {
  const response = await inventoryClient.get("/api/contracts/", { params });
  return response.data;
}

export async function createContract(payload) {
  const response = await inventoryClient.post("/api/contracts/", payload);
  return response.data;
}

export async function updateContract(id, payload) {
  const response = await inventoryClient.patch(`/api/contracts/${id}/`, payload);
  return response.data;
}

export async function getEquipmentUnits(params = {}) {
  const response = await inventoryClient.get("/api/equipment-units/", { params });
  return response.data;
}

export async function createEquipmentUnit(payload) {
  const response = await inventoryClient.post("/api/equipment-units/", payload);
  return response.data;
}

export async function updateEquipmentUnit(id, payload) {
  const response = await inventoryClient.patch(`/api/equipment-units/${id}/`, payload);
  return response.data;
}

export async function getLocations() {
  const response = await inventoryClient.get("/api/locations/");
  return response.data;
}

export async function createLocation(payload) {
  const response = await inventoryClient.post("/api/locations/", payload);
  return response.data;
}

export async function getBalances(params = {}) {
  const response = await inventoryClient.get("/api/balances/", { params });
  return response.data;
}

export async function createBalance(payload) {
  const response = await inventoryClient.post("/api/balances/", payload);
  return response.data;
}

export async function getReservations(params = {}) {
  const response = await inventoryClient.get("/api/reservations/", { params });
  return response.data;
}

export async function createReservation(payload) {
  const response = await inventoryClient.post("/api/reservations/", payload);
  return response.data;
}

export async function releaseReservation(id, payload = {}) {
  const response = await inventoryClient.post(`/api/reservations/${id}/release/`, payload);
  return response.data;
}

export async function increaseReservation(id, payload = {}) {
  const response = await inventoryClient.post(`/api/reservations/${id}/increase/`, payload);
  return response.data;
}

export async function getTransactions(params = {}) {
  const response = await inventoryClient.get("/api/transactions/", { params });
  return response.data;
}

export async function createTransaction(payload) {
  const response = await inventoryClient.post("/api/transactions/", payload);
  return response.data;
}
