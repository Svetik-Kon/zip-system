import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import RequestsPage from "./pages/RequestsPage";
import CreateRequestPage from "./pages/CreateRequestPage";
import RequestDetailsPage from "./pages/RequestDetailsPage";
import CatalogPage from "./pages/CatalogPage";
import InventoryPage from "./pages/InventoryPage";
import ContractsPage from "./pages/ContractsPage";
import MovementsPage from "./pages/MovementsPage";
import ProtectedRoute from "./components/ProtectedRoute";
import { isAuthenticated } from "./utils/auth";
import { getMe } from "./utils/auth";
import AdminUsersPage from "./pages/AdminUsersPage";

function HomeRedirect() {
  return isAuthenticated() ? <Navigate to="/requests" replace /> : <Navigate to="/login" replace />;
}

function InternalOnly({ children }) {
  const me = getMe();
  if (me?.role === "customer") {
    return <Navigate to="/requests" replace />;
  }
  return children;
}

function WarehouseOnly({ children }) {
  const me = getMe();
  if (me?.role === "customer" || me?.role === "manager") {
    return <Navigate to="/requests" replace />;
  }
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/login" element={<LoginPage />} />

        <Route
          path="/requests"
          element={
            <ProtectedRoute>
              <RequestsPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/requests/create"
          element={
            <ProtectedRoute>
              <CreateRequestPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/requests/:id"
          element={
            <ProtectedRoute>
              <RequestDetailsPage />
            </ProtectedRoute>
          }
        />

        <Route path="/admin/users" element={<ProtectedRoute><AdminUsersPage /></ProtectedRoute>} />

        <Route
          path="/catalog"
          element={
            <ProtectedRoute>
              <InternalOnly><CatalogPage /></InternalOnly>
            </ProtectedRoute>
          }
        />

        <Route
          path="/inventory"
          element={
            <ProtectedRoute>
              <InternalOnly><InventoryPage /></InternalOnly>
            </ProtectedRoute>
          }
        />

        <Route
          path="/contracts"
          element={
            <ProtectedRoute>
              <InternalOnly><ContractsPage /></InternalOnly>
            </ProtectedRoute>
          }
        />

        <Route
          path="/movements"
          element={
            <ProtectedRoute>
              <WarehouseOnly><MovementsPage /></WarehouseOnly>
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
