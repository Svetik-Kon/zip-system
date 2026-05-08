import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { assignRequest, changeRequestPriority, changeRequestStatus, createComment, getRequestById } from "../api/requests";
import { getAssignableUsersRequest } from "../api/auth";
import { getMe } from "../utils/auth";
import Navbar from "../components/Navbar";
import {
  REQUEST_PRIORITY_LABELS,
  REQUEST_STATUS_LABELS,
  getRequestPriorityLabel,
  getRequestStatusLabel,
  getRequestTypeLabel,
  getRoleLabel,
} from "../utils/dictionaries";

export default function RequestDetailsPage() {
  const { id } = useParams();
  const me = getMe();
  const [requestData, setRequestData] = useState(null);
  const [assignableUsers, setAssignableUsers] = useState([]);
  const [commentBody, setCommentBody] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [newStatus, setNewStatus] = useState("in_review");
  const [statusComment, setStatusComment] = useState("");
  const [newPriority, setNewPriority] = useState("medium");
  const [priorityComment, setPriorityComment] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [assignComment, setAssignComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isCustomer = me?.role === "customer";
  const canManageRequest = !isCustomer;

  const selectedAssignee = useMemo(() => assignableUsers.find((user) => user.id === assigneeId) || null, [assignableUsers, assigneeId]);

  useEffect(() => {
    loadAll();
  }, [id]);

  const hydrateForm = (data) => {
    setNewStatus(data.status || "in_review");
    setNewPriority(data.priority || "medium");
    setAssigneeId(data.current_assignee_id || "");
  };

  const loadAll = async () => {
    try {
      setLoading(true);
      setError("");
      const [requestResult, usersResult] = await Promise.all([
        getRequestById(id),
        canManageRequest ? getAssignableUsersRequest() : Promise.resolve([]),
      ]);
      setRequestData(requestResult);
      setAssignableUsers(usersResult || []);
      hydrateForm(requestResult);
    } catch {
      setError("Не удалось загрузить карточку заявки.");
    } finally {
      setLoading(false);
    }
  };

  const reloadRequest = async () => {
    const data = await getRequestById(id);
    setRequestData(data);
    hydrateForm(data);
  };

  const handleCommentSubmit = async (event) => {
    event.preventDefault();
    if (!commentBody.trim()) return;
    try {
      setSaving(true);
      await createComment(id, { body: commentBody, is_internal: canManageRequest ? isInternal : false });
      setCommentBody("");
      setIsInternal(false);
      await reloadRequest();
    } catch {
      setError("Не удалось добавить комментарий.");
    } finally {
      setSaving(false);
    }
  };

  const handlePrioritySubmit = async (event) => {
    event.preventDefault();
    try {
      setSaving(true);
      await changeRequestPriority(id, { priority: newPriority, comment: priorityComment });
      setPriorityComment("");
      await reloadRequest();
    } catch {
      setError("Не удалось изменить приоритет.");
    } finally {
      setSaving(false);
    }
  };

  const handleStatusSubmit = async (event) => {
    event.preventDefault();
    if (!canManageRequest) return;
    try {
      setSaving(true);
      await changeRequestStatus(id, { status: newStatus, comment: statusComment });
      setStatusComment("");
      await reloadRequest();
    } catch {
      setError("Не удалось изменить статус.");
    } finally {
      setSaving(false);
    }
  };

  const handleAssignSubmit = async (event) => {
    event.preventDefault();
    if (!canManageRequest || !assigneeId) return;
    try {
      setSaving(true);
      await assignRequest(id, { assignee_id: assigneeId, assignee_username: selectedAssignee?.username || "", comment: assignComment });
      setAssignComment("");
      await reloadRequest();
    } catch {
      setError("Не удалось назначить исполнителя.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Navbar>
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
              <p><strong>Приоритет:</strong> {getRequestPriorityLabel(requestData.priority)}</p>
              <p><strong>Автор:</strong> {requestData.created_by_username}</p>
              <p><strong>Исполнитель:</strong> {requestData.current_assignee_username || "не назначен"}</p>
              <p><strong>Описание:</strong> {requestData.description || "-"}</p>
              <p><strong>Оборудование:</strong> {requestData.equipment_name || "-"} {requestData.equipment_model ? `(${requestData.equipment_model})` : ""}</p>
              <p><strong>Серийный номер:</strong> {requestData.serial_number || "-"}</p>
              <p><strong>Площадка:</strong> {requestData.site_name || "-"}</p>
            </div>

            <div className="dashboard-grid">
              <div className="card">
                <h2>Изменить приоритет</h2>
                <form onSubmit={handlePrioritySubmit} className="form">
                  <select value={newPriority} onChange={(event) => setNewPriority(event.target.value)}>
                    {Object.entries(REQUEST_PRIORITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                  <textarea placeholder="Комментарий" value={priorityComment} onChange={(event) => setPriorityComment(event.target.value)} />
                  <button type="submit" disabled={saving}>Сохранить приоритет</button>
                </form>
              </div>

              {canManageRequest ? (
                <>
                  <div className="card">
                    <h2>Сменить статус</h2>
                    <form onSubmit={handleStatusSubmit} className="form">
                      <select value={newStatus} onChange={(event) => setNewStatus(event.target.value)}>
                        {Object.entries(REQUEST_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                      <textarea placeholder="Комментарий" value={statusComment} onChange={(event) => setStatusComment(event.target.value)} />
                      <button type="submit" disabled={saving}>Изменить статус</button>
                    </form>
                  </div>

                  <div className="card">
                    <h2>Исполнитель</h2>
                    <form onSubmit={handleAssignSubmit} className="form">
                      <select value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
                        <option value="">Выбери исполнителя</option>
                        {assignableUsers.map((user) => <option key={user.id} value={user.id}>{user.username} ({getRoleLabel(user.role)})</option>)}
                      </select>
                      <textarea placeholder="Комментарий" value={assignComment} onChange={(event) => setAssignComment(event.target.value)} />
                      <button type="submit" disabled={saving}>Назначить</button>
                    </form>
                  </div>
                </>
              ) : null}
            </div>

            <div className="card">
              <h2>Позиции</h2>
              {!requestData.items?.length ? <p>Позиции отсутствуют.</p> : <ul>{requestData.items.map((item) => <li key={item.id}>{item.item_name} - {item.quantity} шт.</li>)}</ul>}
            </div>

            <div className="card">
              <h2>Комментарии</h2>
              {!requestData.comments?.length ? <p>Комментариев пока нет.</p> : (
                <ul className="activity-list">
                  {requestData.comments.map((comment) => <li key={comment.id}><strong>{comment.author_username}</strong> ({getRoleLabel(comment.author_role)})<br />{comment.body}</li>)}
                </ul>
              )}
              <form onSubmit={handleCommentSubmit} className="form">
                <textarea placeholder="Новый комментарий" value={commentBody} onChange={(event) => setCommentBody(event.target.value)} />
                {canManageRequest ? <label className="checkbox"><input type="checkbox" checked={isInternal} onChange={(event) => setIsInternal(event.target.checked)} />Внутренний комментарий</label> : null}
                <button type="submit" disabled={saving}>Добавить комментарий</button>
              </form>
            </div>

            <div className="card">
              <h2>История</h2>
              {!requestData.events?.length ? <p>История пока пустая.</p> : (
                <ul className="activity-list">
                  {requestData.events.map((event) => (
                    <li key={event.id}>
                      <strong>{event.event_type}</strong> - {event.actor_username} ({getRoleLabel(event.actor_role)})
                      {event.old_value || event.new_value ? <><br />{event.old_value ? `было: ${event.old_value}` : ""}{event.old_value && event.new_value ? " | " : ""}{event.new_value ? `стало: ${event.new_value}` : ""}</> : null}
                      {event.comment ? <><br />{event.comment}</> : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        ) : null}
      </div>
    </Navbar>
  );
}
