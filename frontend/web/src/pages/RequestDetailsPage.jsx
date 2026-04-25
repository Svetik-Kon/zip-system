import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  assignRequest,
  changeRequestStatus,
  createComment,
  getRequestById,
} from "../api/requests";
import { getAssignableUsersRequest } from "../api/auth";
import { getMe } from "../utils/auth";
import Navbar from "../components/Navbar";
import {
  getRequestStatusLabel,
  getRequestTypeLabel,
  getRoleLabel,
} from "../utils/dictionaries";

const STATUS_OPTIONS = [
  { value: "new", label: "Новая" },
  { value: "in_review", label: "На согласовании" },
  { value: "diagnostics", label: "Диагностика" },
  { value: "awaiting_warehouse", label: "Ожидает склад" },
  { value: "awaiting_procurement", label: "Ожидает закупки" },
  { value: "reserved", label: "В резерве" },
  { value: "ready_to_ship", label: "На отгрузке" },
  { value: "shipped", label: "Отгружено" },
  { value: "in_lab", label: "В лаборатории" },
  { value: "received", label: "Получено" },
  { value: "closed", label: "Закрыта" },
  { value: "rejected", label: "Отклонена" },
  { value: "cancelled", label: "Отменена" },
];

export default function RequestDetailsPage() {
  const { id } = useParams();
  const me = getMe();

  const [requestData, setRequestData] = useState(null);
  const [assignableUsers, setAssignableUsers] = useState([]);

  const [commentBody, setCommentBody] = useState("");
  const [isInternal, setIsInternal] = useState(false);

  const [newStatus, setNewStatus] = useState("in_review");
  const [statusComment, setStatusComment] = useState("");

  const [assigneeId, setAssigneeId] = useState("");
  const [assignComment, setAssignComment] = useState("");

  const [loading, setLoading] = useState(true);
  const [commentLoading, setCommentLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [assignLoading, setAssignLoading] = useState(false);
  const [error, setError] = useState("");

  const isCustomer = me?.role === "customer";
  const canManageRequest = !isCustomer;

  useEffect(() => {
    loadAll();
  }, [id]);

  const selectedAssignee = useMemo(() => {
    return assignableUsers.find((user) => user.id === assigneeId) || null;
  }, [assignableUsers, assigneeId]);

  const loadAll = async () => {
    try {
      setLoading(true);
      setError("");

      const requestPromise = getRequestById(id);
      const usersPromise = canManageRequest
        ? getAssignableUsersRequest()
        : Promise.resolve([]);

      const [requestResult, usersResult] = await Promise.all([
        requestPromise,
        usersPromise,
      ]);

      setRequestData(requestResult);
      setAssignableUsers(usersResult || []);

      if (requestResult?.status) {
        setNewStatus(requestResult.status);
      }

      if (requestResult?.current_assignee_id) {
        setAssigneeId(requestResult.current_assignee_id);
      }
    } catch (err) {
      setError("Не удалось загрузить карточку заявки.");
    } finally {
      setLoading(false);
    }
  };

  const loadRequestOnly = async () => {
    try {
      const data = await getRequestById(id);
      setRequestData(data);

      if (data?.status) {
        setNewStatus(data.status);
      }

      if (data?.current_assignee_id) {
        setAssigneeId(data.current_assignee_id);
      }
    } catch (err) {
      setError("Не удалось обновить карточку заявки.");
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
      await loadRequestOnly();
    } catch (err) {
      setError("Не удалось добавить комментарий.");
    } finally {
      setCommentLoading(false);
    }
  };

  const handleStatusSubmit = async (e) => {
    e.preventDefault();

    if (!canManageRequest) {
      return;
    }

    try {
      setStatusLoading(true);

      await changeRequestStatus(id, {
        status: newStatus,
        comment: statusComment,
      });

      setStatusComment("");
      await loadRequestOnly();
    } catch (err) {
      setError("Не удалось изменить статус.");
    } finally {
      setStatusLoading(false);
    }
  };

  const handleAssignSubmit = async (e) => {
    e.preventDefault();

    if (!canManageRequest) {
      return;
    }

    if (!assigneeId) {
      setError("Выбери исполнителя.");
      return;
    }

    try {
      setAssignLoading(true);

      await assignRequest(id, {
        assignee_id: assigneeId,
        assignee_username: selectedAssignee?.username || "",
        comment: assignComment,
      });

      setAssignComment("");
      await loadRequestOnly();
    } catch (err) {
      setError("Не удалось назначить исполнителя.");
    } finally {
      setAssignLoading(false);
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
              <p><strong>Статус:</strong> {getRequestStatusLabel(requestData.status)}</p>
              <p><strong>Тип:</strong> {getRequestTypeLabel(requestData.request_type)}</p>
              <p><strong>Приоритет:</strong> {requestData.priority}</p>
              <p><strong>Автор:</strong> {requestData.created_by_username}</p>
              <p><strong>Описание:</strong> {requestData.description}</p>
              <p><strong>Оборудование:</strong> {requestData.equipment_name}</p>
              <p><strong>Модель:</strong> {requestData.equipment_model}</p>
              <p><strong>Серийный номер:</strong> {requestData.serial_number}</p>
              <p><strong>Площадка:</strong> {requestData.site_name}</p>
              <p><strong>Текущий исполнитель:</strong> {requestData.current_assignee_username || "не назначен"}</p>
            </div>

            {canManageRequest ? (
              <>
                <div className="card">
                  <h2>Сменить статус</h2>

                  <form onSubmit={handleStatusSubmit} className="form">
                    <label>
                      Новый статус
                      <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
                        {STATUS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      Комментарий к смене статуса
                      <textarea
                        value={statusComment}
                        onChange={(e) => setStatusComment(e.target.value)}
                      />
                    </label>

                    <button type="submit" disabled={statusLoading}>
                      {statusLoading ? "Сохранение..." : "Изменить статус"}
                    </button>
                  </form>
                </div>

                <div className="card">
                  <h2>Назначить / переназначить исполнителя</h2>

                  <form onSubmit={handleAssignSubmit} className="form">
                    <label>
                      Исполнитель
                      <select
                        value={assigneeId}
                        onChange={(e) => setAssigneeId(e.target.value)}
                      >
                        <option value="">Выбери исполнителя</option>
                        {assignableUsers.map((user) => (
                          <option key={user.id} value={user.id}>
                            {user.username}
                            {user.first_name || user.last_name
                              ? ` — ${user.first_name || ""} ${user.last_name || ""}`.trim()
                              : ""}
                            {user.role ? ` (${getRoleLabel(user.role)})` : ""}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      Комментарий к назначению
                      <textarea
                        value={assignComment}
                        onChange={(e) => setAssignComment(e.target.value)}
                      />
                    </label>

                    <button type="submit" disabled={assignLoading}>
                      {assignLoading ? "Сохранение..." : "Назначить исполнителя"}
                    </button>
                  </form>
                </div>
              </>
            ) : null}

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
                      <strong>{comment.author_username}</strong> ({getRoleLabel(comment.author_role)})<br />
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

                {canManageRequest ? (
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
                      <strong>{event.event_type}</strong> — {event.actor_username} ({getRoleLabel(event.actor_role)})
                      {event.old_value || event.new_value ? (
                        <>
                          <br />
                          <span>
                            {event.old_value ? `было: ${event.old_value}` : ""}
                            {event.old_value && event.new_value ? " | " : ""}
                            {event.new_value ? `стало: ${event.new_value}` : ""}
                          </span>
                        </>
                      ) : null}
                      {event.comment ? (
                        <>
                          <br />
                          <span>{event.comment}</span>
                        </>
                      ) : null}
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