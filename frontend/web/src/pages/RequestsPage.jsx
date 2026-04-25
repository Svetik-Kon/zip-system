import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { getRequests } from "../api/requests";
import Navbar from "../components/Navbar";
import {
  getRequestStatusLabel,
  getRequestTypeLabel,
} from "../utils/dictionaries";

export default function RequestsPage() {
  const location = useLocation();

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const searchParams = new URLSearchParams(location.search);
  const assignedToMe = searchParams.get("assigned_to_me") === "true";

  useEffect(() => {
    loadRequests();
  }, [location.search]);

  const loadRequests = async () => {
    try {
      setLoading(true);
      setError("");

      const data = await getRequests(
        assignedToMe ? { assigned_to_me: "true" } : {}
      );

      setRequests(data);
    } catch (err) {
      setError("Не удалось загрузить заявки.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Navbar />

      <div className="page">
        <div className="page-header">
          <h1>{assignedToMe ? "Назначенные мне заявки" : "Список заявок"}</h1>

          <div className="header-actions">
            {!assignedToMe ? (
              <Link className="button-link secondary" to="/requests?assigned_to_me=true">
                Показать назначенные мне
              </Link>
            ) : (
              <Link className="button-link secondary" to="/requests">
                Показать все заявки
              </Link>
            )}

            <Link className="button-link" to="/requests/create">
              Создать заявку
            </Link>
          </div>
        </div>

        {loading ? <p>Загрузка...</p> : null}
        {error ? <div className="error">{error}</div> : null}

        {!loading && !requests.length ? <p>Заявок пока нет.</p> : null}

        {!loading && requests.length ? (
          <div className="card">
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
                    <td>
                      <Link to={`/requests/${item.id}`}>{item.number}</Link>
                    </td>
                    <td>{item.title}</td>
                    <td>{getRequestTypeLabel(item.request_type)}</td>
                    <td>{item.priority}</td>
                    <td>{getRequestStatusLabel(item.status)}</td>
                    <td>{item.created_by_username}</td>
                    <td>{item.current_assignee_username || "—"}</td>
                    <td>{new Date(item.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </>
  );
}