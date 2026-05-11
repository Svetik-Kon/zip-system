import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { assignRequest, changeRequestPriority, changeRequestStatus, confirmRequestReceipt, createComment, getRequestById, updateRequestItemWorkflow } from "../api/requests";
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

const priorityTone = { critical: "danger", high: "orange", medium: "yellow", low: "green" };

const statusTone = {
  shortage: "danger",
  awaiting_procurement: "orange",
  awaiting_replacement: "orange",
  awaiting_reallocation: "orange",
  awaiting_return: "yellow",
  partially_fulfilled: "blue",
  reserved: "blue",
  awaiting_confirmation: "blue",
  ready_to_ship: "green",
  shipped: "green",
  closed: "neutral",
  rejected: "danger",
  cancelled: "neutral",
};

const lineStatusLabels = {
  shortage: "Дефицит",
  waiting: "Ожидание",
  replacement: "Замена",
  reallocation: "Перераспределение",
  partial: "Частично",
  fulfilled: "Исполнено",
};

const includesText = (value, query) => String(value || "").toLowerCase().includes(query);

const WORKFLOW_TRANSITIONS = {
  new: ["in_review", "cancelled"],
  in_review: ["awaiting_warehouse", "diagnostics", "rejected", "cancelled"],
  diagnostics: ["awaiting_warehouse", "awaiting_replacement", "in_lab", "closed", "rejected"],
  awaiting_warehouse: ["reserved", "shortage", "awaiting_procurement", "awaiting_reallocation", "ready_to_ship", "awaiting_confirmation"],
  awaiting_procurement: ["awaiting_warehouse", "awaiting_replacement", "shortage", "cancelled"],
  awaiting_replacement: ["awaiting_warehouse", "awaiting_procurement", "shortage", "cancelled"],
  awaiting_reallocation: ["awaiting_warehouse", "reserved", "shortage", "cancelled"],
  shortage: ["awaiting_procurement", "awaiting_replacement", "awaiting_reallocation", "partially_fulfilled", "cancelled"],
  reserved: ["ready_to_ship", "partially_fulfilled", "awaiting_confirmation", "cancelled"],
  ready_to_ship: ["awaiting_confirmation", "partially_fulfilled", "cancelled"],
  partially_fulfilled: ["awaiting_warehouse", "awaiting_procurement", "ready_to_ship", "awaiting_confirmation", "closed"],
  shipped: ["awaiting_confirmation", "received"],
  awaiting_confirmation: ["received"],
  received: ["closed"],
  in_lab: ["diagnostics", "awaiting_warehouse", "closed"],
  awaiting_return: ["diagnostics", "closed", "cancelled"],
};

const WAREHOUSE_WORKFLOW_STATUSES = new Set([
  "awaiting_warehouse",
  "reserved",
  "ready_to_ship",
  "awaiting_confirmation",
  "partially_fulfilled",
  "shortage",
  "awaiting_procurement",
  "awaiting_replacement",
  "awaiting_reallocation",
]);

const WAREHOUSE_WORKFLOW_ROLES = new Set(["admin", "manager", "warehouse", "procurement"]);

const PROCUREMENT_WORKFLOW_STATUSES = new Set(["awaiting_procurement", "awaiting_replacement"]);
const PROCUREMENT_WORKFLOW_ROLES = new Set(["admin", "manager", "procurement"]);

export default function RequestDetailsPage() {
  const { id } = useParams();
  const me = getMe();
  const [requestData, setRequestData] = useState(null);
  const [assignableUsers, setAssignableUsers] = useState([]);
  const [commentBody, setCommentBody] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [newStatus, setNewStatus] = useState("in_review");
  const [newPriority, setNewPriority] = useState("medium");
  const [assigneeId, setAssigneeId] = useState("");
  const [statusSearch, setStatusSearch] = useState("");
  const [assigneeSearch, setAssigneeSearch] = useState("");
  const [itemDrafts, setItemDrafts] = useState({});
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isCustomer = me?.role === "customer";
  const canManageRequest = !isCustomer;
  const canConfirmReceipt = requestData && ["awaiting_confirmation", "shipped"].includes(requestData.status)
    && (isCustomer || ["admin", "manager"].includes(me?.role));

  const selectedAssignee = useMemo(() => assignableUsers.find((user) => user.id === assigneeId) || null, [assignableUsers, assigneeId]);

  const filteredStatuses = useMemo(() => {
    const text = statusSearch.trim().toLowerCase();
    const rawAllowed = requestData ? WORKFLOW_TRANSITIONS[requestData.status] || [] : [];
    const role = me?.role;
    const allowedByApproval = requestData?.status === "in_review" && !["admin", "manager"].includes(role)
      ? []
      : rawAllowed;
    const allowed = allowedByApproval.filter((status) => (
      (
        WAREHOUSE_WORKFLOW_ROLES.has(role)
        || (!WAREHOUSE_WORKFLOW_STATUSES.has(requestData?.status) && !WAREHOUSE_WORKFLOW_STATUSES.has(status))
      )
      && (
        PROCUREMENT_WORKFLOW_ROLES.has(role)
        || (!PROCUREMENT_WORKFLOW_STATUSES.has(requestData?.status) && !PROCUREMENT_WORKFLOW_STATUSES.has(status))
      )
    ));
    return Object.entries(REQUEST_STATUS_LABELS).filter(([value, label]) => (
      allowed.includes(value)
      && (!text || includesText(value, text) || includesText(label, text))
    ));
  }, [requestData, statusSearch]);

  const filteredAssignees = useMemo(() => {
    const text = assigneeSearch.trim().toLowerCase();
    return assignableUsers.filter((user) => (
      !text || [user.username, user.email, user.full_name, getRoleLabel(user.role)].some((value) => includesText(value, text))
    ));
  }, [assignableUsers, assigneeSearch]);

  useEffect(() => {
    loadAll();
  }, [id]);

  const hydrateForm = (data) => {
    setNewStatus(data.status || "in_review");
    setNewPriority(data.priority || "medium");
    setAssigneeId(data.current_assignee_id || "");
    setItemDrafts(Object.fromEntries((data.items || []).map((item) => [item.id, {
      reserved_quantity: item.reserved_quantity || 0,
      issued_quantity: item.issued_quantity || 0,
      shortage_quantity: item.shortage_quantity || 0,
      line_status: item.line_status || "",
      shortage_reason: item.shortage_reason || "",
      replacement_item_name: item.replacement_item_name || "",
      replacement_status: item.replacement_status || "",
      allow_analog: Boolean(item.allow_analog),
    }])));
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
      await changeRequestPriority(id, { priority: newPriority, comment: "" });
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
      await changeRequestStatus(id, { status: newStatus, comment: "" });
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
      await assignRequest(id, { assignee_id: assigneeId, assignee_username: selectedAssignee?.username || "", comment: "" });
      await reloadRequest();
    } catch {
      setError("Не удалось назначить исполнителя.");
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmReceipt = async () => {
    try {
      setSaving(true);
      const data = await confirmRequestReceipt(id);
      setRequestData(data);
      hydrateForm(data);
    } catch {
      setError("Не удалось подтвердить получение.");
    } finally {
      setSaving(false);
    }
  };

  const handleItemDraftChange = (itemId, field, value) => {
    setItemDrafts((prev) => ({
      ...prev,
      [itemId]: {
        ...(prev[itemId] || {}),
        [field]: value,
      },
    }));
  };

  const handleItemWorkflowSubmit = async (event, itemId) => {
    event.preventDefault();
    if (!canManageRequest) return;
    try {
      setSaving(true);
      const draft = itemDrafts[itemId] || {};
      const data = await updateRequestItemWorkflow(id, itemId, {
        ...draft,
        reserved_quantity: Number(draft.reserved_quantity || 0),
        issued_quantity: Number(draft.issued_quantity || 0),
        shortage_quantity: Number(draft.shortage_quantity || 0),
      });
      setRequestData(data);
      hydrateForm(data);
    } catch {
      setError("Не удалось обновить позицию заявки.");
    } finally {
      setSaving(false);
    }
  };

  const renderField = (label, value) => (
    <div className="request-field">
      <span>{label}</span>
      <strong>{value || "-"}</strong>
    </div>
  );

  return (
    <Navbar>
      <div className="page">
        {loading ? <p>Загрузка...</p> : null}
        {error ? <div className="error">{error}</div> : null}

        {!loading && requestData ? (
          <>
            <div className="card request-hero">
              <div className="request-title-row">
                <div>
                  <h1>{requestData.number}</h1>
                  <p>{requestData.title}</p>
                </div>
                <div className="badge-row">
                  <span className={`badge badge-${statusTone[requestData.status] || "neutral"}`}>{getRequestStatusLabel(requestData.status)}</span>
                  <span className={`badge badge-${priorityTone[requestData.priority] || "neutral"}`}>{getRequestPriorityLabel(requestData.priority)}</span>
                </div>
              </div>
              {requestData.status === "in_review" ? (
                <div className="workflow-warning">Заявка на согласовании. До подтверждения договора нельзя выдавать оборудование заказчику или забирать его на диагностику.</div>
              ) : null}

              <div className="request-meta-grid">
                {renderField("Тип", getRequestTypeLabel(requestData.request_type))}
                {renderField("Автор", requestData.created_by_username)}
                {renderField("Исполнитель", requestData.current_assignee_username || "Не назначен")}
                {renderField("Площадка", requestData.site_name)}
                {renderField("Оборудование", `${requestData.equipment_name || "-"}${requestData.equipment_model ? ` / ${requestData.equipment_model}` : ""}`)}
                {renderField("Серийный номер", requestData.serial_number)}
                {requestData.request_type === "equipment_replacement" ? renderField("Аналог", requestData.allow_analog ? "Возможен" : "Нужна точная замена") : null}
              </div>

              <div className="request-description">
                <span>Описание</span>
                <p>{requestData.description || "Описание не заполнено."}</p>
              </div>
              {canConfirmReceipt ? (
                <div className="detail-actions">
                  <button type="button" onClick={handleConfirmReceipt} disabled={saving}>Подтвердить получение</button>
                </div>
              ) : null}
            </div>

            <div className="dashboard-grid request-actions-grid">
              <div className="card">
                <h2>Изменить приоритет</h2>
                <form onSubmit={handlePrioritySubmit} className="form">
                  <select value={newPriority} onChange={(event) => setNewPriority(event.target.value)}>
                    {Object.entries(REQUEST_PRIORITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                  <button type="submit" disabled={saving}>Сохранить приоритет</button>
                </form>
              </div>

              {canManageRequest ? (
                <>
                  <div className="card">
                    <h2>Сменить статус</h2>
                    <form onSubmit={handleStatusSubmit} className="form">
                      <input className="select-search" placeholder="Найти статус" value={statusSearch} onChange={(event) => setStatusSearch(event.target.value)} />
                      <select value={filteredStatuses.some(([value]) => value === newStatus) ? newStatus : ""} onChange={(event) => setNewStatus(event.target.value)} required>
                        <option value="">Выбери следующий статус</option>
                        {filteredStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                      {!filteredStatuses.length ? <p className="field-note">Для текущего статуса нет доступных переходов.</p> : null}
                      <button type="submit" disabled={saving}>Изменить статус</button>
                    </form>
                  </div>

                  <div className="card">
                    <h2>Исполнитель</h2>
                    <form onSubmit={handleAssignSubmit} className="form">
                      <input className="select-search" placeholder="Найти исполнителя" value={assigneeSearch} onChange={(event) => setAssigneeSearch(event.target.value)} />
                      <select value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
                        <option value="">Выбери исполнителя</option>
                        {filteredAssignees.map((user) => <option key={user.id} value={user.id}>{user.username} ({getRoleLabel(user.role)})</option>)}
                      </select>
                      <button type="submit" disabled={saving}>Назначить</button>
                    </form>
                  </div>
                </>
              ) : null}
            </div>

            {requestData.items?.length ? (
            <div className="card">
              <h2>Позиции</h2>
                <div className="request-item-list">
                  {requestData.items.map((item) => (
                    <div className="request-item-row" key={item.id}>
                      <div>
                        <strong>{item.item_name}</strong>
                        <span>{lineStatusLabels[item.line_status] || item.line_status || "Обычная позиция"}</span>
                      </div>
                      <div><span>Запрошено</span><strong>{item.quantity}</strong></div>
                      <div><span>Резерв</span><strong>{item.reserved_quantity || 0}</strong></div>
                      <div><span>Выдано</span><strong>{item.issued_quantity || 0}</strong></div>
                      <div><span>Дефицит</span><strong>{item.shortage_quantity || 0}</strong></div>
                      {item.shortage_reason || item.replacement_item_name ? (
                        <p>
                          {item.shortage_reason ? `Причина: ${item.shortage_reason}` : ""}
                          {item.shortage_reason && item.replacement_item_name ? " | " : ""}
                          {item.replacement_item_name ? `Замена: ${item.replacement_item_name}` : ""}
                        </p>
                      ) : null}
                      {canManageRequest ? (
                        <form className="request-item-workflow" onSubmit={(event) => handleItemWorkflowSubmit(event, item.id)}>
                          <label>
                            Статус строки
                            <select value={itemDrafts[item.id]?.line_status || ""} onChange={(event) => handleItemDraftChange(item.id, "line_status", event.target.value)}>
                              <option value="">Обычная позиция</option>
                              <option value="shortage">Дефицит</option>
                              <option value="waiting">Ожидание</option>
                              <option value="replacement">Замена</option>
                              <option value="reallocation">Перераспределение</option>
                              <option value="partial">Частично</option>
                              <option value="fulfilled">Исполнено</option>
                            </select>
                          </label>
                          <label>
                            Резерв
                            <input type="number" min="0" value={itemDrafts[item.id]?.reserved_quantity ?? 0} onChange={(event) => handleItemDraftChange(item.id, "reserved_quantity", event.target.value)} />
                          </label>
                          <label>
                            Выдано
                            <input type="number" min="0" value={itemDrafts[item.id]?.issued_quantity ?? 0} onChange={(event) => handleItemDraftChange(item.id, "issued_quantity", event.target.value)} />
                          </label>
                          <label>
                            Дефицит
                            <input type="number" min="0" value={itemDrafts[item.id]?.shortage_quantity ?? 0} onChange={(event) => handleItemDraftChange(item.id, "shortage_quantity", event.target.value)} />
                          </label>
                          <label>
                            Причина дефицита
                            <input value={itemDrafts[item.id]?.shortage_reason || ""} onChange={(event) => handleItemDraftChange(item.id, "shortage_reason", event.target.value)} />
                          </label>
                          <label>
                            Аналог / замена
                            <input value={itemDrafts[item.id]?.replacement_item_name || ""} onChange={(event) => handleItemDraftChange(item.id, "replacement_item_name", event.target.value)} />
                          </label>
                          <label>
                            Статус замены
                            <input value={itemDrafts[item.id]?.replacement_status || ""} onChange={(event) => handleItemDraftChange(item.id, "replacement_status", event.target.value)} />
                          </label>
                          <label className="checkbox request-item-checkbox">
                            <input type="checkbox" checked={Boolean(itemDrafts[item.id]?.allow_analog)} onChange={(event) => handleItemDraftChange(item.id, "allow_analog", event.target.checked)} />
                            Можно аналог
                          </label>
                          <button type="submit" disabled={saving}>Сохранить строку</button>
                        </form>
                      ) : null}
                    </div>
                  ))}
                </div>
            </div>
            ) : null}

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
              <div className="section-head">
                <h2>История</h2>
                <button type="button" className="ghost-button" onClick={() => setHistoryOpen((value) => !value)}>
                  {historyOpen ? "Скрыть" : `Показать (${requestData.events?.length || 0})`}
                </button>
              </div>
              {!historyOpen ? <p className="field-note">История скрыта, чтобы карточка заявки не превращалась в длинную простыню.</p> : null}
              {historyOpen && !requestData.events?.length ? <p>История пока пустая.</p> : null}
              {historyOpen && requestData.events?.length ? (
                <ul className="activity-list request-history-list">
                  {requestData.events.map((event) => (
                    <li key={event.id}>
                      <strong>{event.event_type}</strong> - {event.actor_username} ({getRoleLabel(event.actor_role)})
                      {event.old_value || event.new_value ? <><br />{event.old_value ? `было: ${event.old_value}` : ""}{event.old_value && event.new_value ? " | " : ""}{event.new_value ? `стало: ${event.new_value}` : ""}</> : null}
                      {event.comment ? <><br />{event.comment}</> : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </Navbar>
  );
}
