import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import RequestsPage from "./pages/RequestsPage";
import CreateRequestPage from "./pages/CreateRequestPage";
import RequestDetailsPage from "./pages/RequestDetailsPage";
import ProtectedRoute from "./components/ProtectedRoute";
import { isAuthenticated } from "./utils/auth";

function HomeRedirect() {
  return isAuthenticated() ? <Navigate to="/requests" replace /> : <Navigate to="/login" replace />;
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
      </Routes>
    </BrowserRouter>
  );
}