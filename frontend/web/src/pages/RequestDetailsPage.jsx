import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { createComment, getRequestById } from "../api/requests";
import { getMe } from "../utils/auth";
import Navbar from "../components/Navbar";

export default function RequestDetailsPage() {
  const { id } = useParams();
  const me = getMe();

  const [requestData, setRequestData] = useState(null);
  const [commentBody, setCommentBody] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [commentLoading, setCommentLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    loadRequest();
  }, [id]);

  const loadRequest = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await getRequestById(id);
      setRequestData(data);
    } catch (err) {
      setError("Не удалось загрузить карточку заявки.");
    } finally {
      setLoading(false);
    }
  };

  const handleCommentSubmit = async (e) => {
    e.preventDefault();

    if (!commentBody.trim()) {
      return;
    }

    try {
      setCommentLoading(true);

      await createComment(id, {
        body: commentBody,
        is_internal: isInternal,
      });

      setCommentBody("");
      setIsInternal(false);
      await loadRequest();
    } catch (err) {
      setError("Не удалось добавить комментарий.");
    } finally {
      setCommentLoading(false);
    }
  };

  return (
    <>
      <Navbar />

      <div className="page">
        {loading ? <p>Загрузка...</p> : null}
        {error ? <div className="error">{error}</div> : null}

        {!loading && requestData ? (
          <>
            <div className="card">
              <h1>{requestData.number}</h1>
              <p><strong>Заголовок:</strong> {requestData.title}</p>
              <p><strong>Статус:</strong> {requestData.status}</p>
              <p><strong>Тип:</strong> {requestData.request_type}</p>
              <p><strong>Приоритет:</strong> {requestData.priority}</p>
              <p><strong>Автор:</strong> {requestData.created_by_username}</p>
              <p><strong>Описание:</strong> {requestData.description}</p>
              <p><strong>Оборудование:</strong> {requestData.equipment_name}</p>
              <p><strong>Модель:</strong> {requestData.equipment_model}</p>
              <p><strong>Серийный номер:</strong> {requestData.serial_number}</p>
              <p><strong>Площадка:</strong> {requestData.site_name}</p>
            </div>

            <div className="card">
              <h2>Позиции</h2>
              {!requestData.items?.length ? (
                <p>Позиции отсутствуют.</p>
              ) : (
                <ul>
                  {requestData.items.map((item) => (
                    <li key={item.id}>
                      {item.item_name} — {item.quantity} шт.
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="card">
              <h2>Комментарии</h2>

              {!requestData.comments?.length ? (
                <p>Комментариев пока нет.</p>
              ) : (
                <ul className="activity-list">
                  {requestData.comments.map((comment) => (
                    <li key={comment.id}>
                      <strong>{comment.author_username}</strong> ({comment.author_role})<br />
                      {comment.body}
                    </li>
                  ))}
                </ul>
              )}

              <form onSubmit={handleCommentSubmit} className="form">
                <label>
                  Новый комментарий
                  <textarea
                    value={commentBody}
                    onChange={(e) => setCommentBody(e.target.value)}
                  />
                </label>

                {me?.role !== "customer" ? (
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={isInternal}
                      onChange={(e) => setIsInternal(e.target.checked)}
                    />
                    Внутренний комментарий
                  </label>
                ) : null}

                <button type="submit" disabled={commentLoading}>
                  {commentLoading ? "Отправка..." : "Добавить комментарий"}
                </button>
              </form>
            </div>

            <div className="card">
              <h2>История</h2>

              {!requestData.events?.length ? (
                <p>История пока пустая.</p>
              ) : (
                <ul className="activity-list">
                  {requestData.events.map((event) => (
                    <li key={event.id}>
                      <strong>{event.event_type}</strong> — {event.actor_username} ({event.actor_role})
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}