import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getRequests } from "../api/requests";
import Navbar from "../components/Navbar";

export default function RequestsPage() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadRequests();
  }, []);

  const loadRequests = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await getRequests();
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
          <h1>Список заявок</h1>
          <Link className="button-link" to="/requests/create">
            Создать заявку
          </Link>
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
                    <td>{item.request_type}</td>
                    <td>{item.priority}</td>
                    <td>{item.status}</td>
                    <td>{item.created_by_username}</td>
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