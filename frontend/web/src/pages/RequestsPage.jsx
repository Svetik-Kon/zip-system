import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { getRequests } from "../api/requests";
import Navbar from "../components/Navbar";
import {
  REQUEST_PRIORITY_LABELS,
  REQUEST_STATUS_LABELS,
  REQUEST_TYPE_LABELS,
  getRequestPriorityLabel,
  getRequestStatusLabel,
  getRequestTypeLabel,
} from "../utils/dictionaries";

export default function RequestsPage() {
  const location = useLocation();
  const [requests, setRequests] = useState([]);
  const [filters, setFilters] = useState({
    search: "",
    status: "",
    request_type: "",
    priority: "",
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const assignedToMe = useMemo(() => {
    return new URLSearchParams(location.search).get("assigned_to_me") === "true";
  }, [location.search]);

  useEffect(() => {
    loadRequests();
  }, [location.search]);

  const buildParams = () => {
    const params = assignedToMe ? { assigned_to_me: "true" } : {};
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params[key] = value;
    });
    return params;
  };

  const loadRequests = async (event) => {
    event?.preventDefault();
    try {
      setLoading(true);
      setError("");
      setRequests(await getRequests(buildParams()));
    } catch {
      setError("Не удалось загрузить заявки.");
    } finally {
      setLoading(false);
    }
  };

  const resetFilters = () => {
    setFilters({ search: "", status: "", request_type: "", priority: "" });
    setTimeout(() => loadRequests(), 0);
  };

  return (
    <Navbar>
      <div className="page">
        <div className="page-header">
          <h1>{assignedToMe ? "Назначенные мне заявки" : "Заявки"}</h1>
          <div className="header-actions">
            <Link className="button-link secondary" to={assignedToMe ? "/requests" : "/requests?assigned_to_me=true"}>
              {assignedToMe ? "Все заявки" : "Назначенные мне"}
            </Link>
            <Link className="button-link" to="/requests/create">Создать заявку</Link>
          </div>
        </div>

        <div className="metric-grid">
          <div className="metric-card">Открытые заявки<strong>{requests.filter((item) => !["closed", "cancelled", "rejected"].includes(item.status)).length}</strong></div>
          <div className="metric-card">Критические<strong>{requests.filter((item) => item.priority === "critical").length}</strong></div>
          <div className="metric-card">В работе<strong>{requests.filter((item) => ["diagnostics", "awaiting_warehouse", "awaiting_procurement", "reserved"].includes(item.status)).length}</strong></div>
        </div>

        <form className="card filters" onSubmit={loadRequests}>
          <input
            value={filters.search}
            onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
            placeholder="Поиск: номер, объект, исполнитель..."
          />
          <select value={filters.status} onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}>
            <option value="">Все статусы</option>
            {Object.entries(REQUEST_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select value={filters.priority} onChange={(event) => setFilters((prev) => ({ ...prev, priority: event.target.value }))}>
            <option value="">Любой приоритет</option>
            {Object.entries(REQUEST_PRIORITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select value={filters.request_type} onChange={(event) => setFilters((prev) => ({ ...prev, request_type: event.target.value }))}>
            <option value="">Все типы</option>
            {Object.entries(REQUEST_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <button type="submit">Найти</button>
          <button type="button" className="ghost-button" onClick={resetFilters}>Сбросить</button>
        </form>

        {loading ? <p>Загрузка...</p> : null}
        {error ? <div className="error">{error}</div> : null}

        {!loading ? (
          <div className="card">
            <h2>Список заявок</h2>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Номер</th>
                    <th>Заголовок</th>
                    <th>Тип</th>
                    <th>Приоритет</th>
                    <th>Статус</th>
                    <th>Автор</th>
                    <th>Исполнитель</th>
                    <th>Дата</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((item) => (
                    <tr key={item.id}>
                      <td><Link to={`/requests/${item.id}`}>{item.number}</Link></td>
                      <td>{item.title}</td>
                      <td>{getRequestTypeLabel(item.request_type)}</td>
                      <td>{getRequestPriorityLabel(item.priority)}</td>
                      <td>{getRequestStatusLabel(item.status)}</td>
                      <td>{item.created_by_username}</td>
                      <td>{item.current_assignee_username || "-"}</td>
                      <td>{new Date(item.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!requests.length ? <p>Заявок по выбранным условиям нет.</p> : null}
          </div>
        ) : null}
      </div>
    </Navbar>
  );
}
