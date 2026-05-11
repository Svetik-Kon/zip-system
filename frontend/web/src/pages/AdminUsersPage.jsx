import { useEffect, useMemo, useState } from "react";
import {
  changeAdminUserPasswordRequest,
  createOrganizationRequest,
  createUserRequest,
  deleteAdminUserRequest,
  deleteOrganizationRequest,
  getAdminUsersRequest,
  getOrganizationsRequest,
  updateAdminUserRequest,
  updateOrganizationRequest,
} from "../api/auth";
import Navbar from "../components/Navbar";
import { getMe } from "../utils/auth";
import { ROLE_LABELS, getRoleLabel } from "../utils/dictionaries";

const ROLE_OPTIONS = Object.keys(ROLE_LABELS);

export default function AdminUsersPage() {
  const me = getMe();
  const [users, setUsers] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [filters, setFilters] = useState({ search: "", role: "", is_active: "", organization: "" });
  const [passwords, setPasswords] = useState({});
  const [activeModal, setActiveModal] = useState("");
  const [organizationSearch, setOrganizationSearch] = useState("");
  const [organizationForm, setOrganizationForm] = useState({ name: "", org_type: "customer" });
  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
    first_name: "",
    last_name: "",
    role: "customer",
    organization: "",
    phone: "",
    job_title: "",
    is_active: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    loadAll();
  }, []);

  const activeOrganizations = useMemo(() => organizations.filter((org) => org.is_active), [organizations]);
  const filteredOrganizations = useMemo(() => {
    const query = organizationSearch.trim().toLowerCase();
    if (!query) return organizations;
    return organizations.filter((org) => org.name.toLowerCase().includes(query));
  }, [organizations, organizationSearch]);

  const organizationOptionsForUser = (user) => {
    const currentArchived = organizations.find((org) => org.id === user.organization && !org.is_active);
    return currentArchived ? [...activeOrganizations, currentArchived] : activeOrganizations;
  };

  const activeParams = () => {
    const params = {};
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params[key] = value;
    });
    return params;
  };

  const loadAll = async (event) => {
    event?.preventDefault();
    try {
      setLoading(true);
      setError("");
      const [orgs, adminUsers] = await Promise.all([
        getOrganizationsRequest(),
        getAdminUsersRequest(activeParams()),
      ]);
      setOrganizations(orgs);
      setUsers(adminUsers);
    } catch {
      setError("Не удалось загрузить пользователей.");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  };

  const closeModal = () => setActiveModal("");

  const createOrganization = async (event) => {
    event.preventDefault();
    try {
      setSaving(true);
      setError("");
      setSuccess("");
      await createOrganizationRequest({ ...organizationForm, is_active: true });
      setOrganizationForm({ name: "", org_type: "customer" });
      setSuccess("Организация создана или восстановлена.");
      closeModal();
      await loadAll();
    } catch (err) {
      setError(err?.response?.data ? JSON.stringify(err.response.data) : "Не удалось создать организацию.");
    } finally {
      setSaving(false);
    }
  };

  const deleteOrganization = async (organization) => {
    if (!window.confirm(`Архивировать организацию "${organization.name}"? Все привязанные пользователи будут отключены, но связь с организацией сохранится.`)) return;

    try {
      setError("");
      setSuccess("");
      await deleteOrganizationRequest(organization.id);
      setSuccess("Организация отправлена в архив.");
      await loadAll();
    } catch (err) {
      setError(err?.response?.data ? JSON.stringify(err.response.data) : "Не удалось удалить организацию.");
    }
  };

  const restoreOrganization = async (organization) => {
    if (!window.confirm(`Восстановить организацию "${organization.name}"?`)) return;

    try {
      setError("");
      setSuccess("");
      await updateOrganizationRequest(organization.id, { is_active: true });
      setSuccess("Организация восстановлена.");
      await loadAll();
    } catch (err) {
      setError(err?.response?.data ? JSON.stringify(err.response.data) : "Не удалось восстановить организацию.");
    }
  };

  const createUser = async (event) => {
    event.preventDefault();
    try {
      setSaving(true);
      setError("");
      setSuccess("");
      await createUserRequest({ ...form, organization: form.organization || null });
      setSuccess("Пользователь создан.");
      setForm({
        username: "",
        email: "",
        password: "",
        first_name: "",
        last_name: "",
        role: "customer",
        organization: "",
        phone: "",
        job_title: "",
        is_active: true,
      });
      closeModal();
      await loadAll();
    } catch (err) {
      setError(err?.response?.data ? JSON.stringify(err.response.data) : "Не удалось создать пользователя.");
    } finally {
      setSaving(false);
    }
  };

  const updateUser = async (userId, payload) => {
    try {
      setError("");
      setSuccess("");
      await updateAdminUserRequest(userId, payload);
      setSuccess("Пользователь обновлен.");
      await loadAll();
    } catch (err) {
      setError(err?.response?.data ? JSON.stringify(err.response.data) : "Не удалось обновить пользователя.");
    }
  };

  const changePassword = async (userId) => {
    const password = passwords[userId];
    if (!password) return;

    try {
      setError("");
      setSuccess("");
      await changeAdminUserPasswordRequest(userId, password);
      setPasswords((prev) => ({ ...prev, [userId]: "" }));
      setSuccess("Пароль обновлен.");
    } catch (err) {
      setError(err?.response?.data ? JSON.stringify(err.response.data) : "Не удалось сменить пароль.");
    }
  };

  const deleteUser = async (user) => {
    if (!window.confirm(`Удалить пользователя "${user.username}"? Пользователь будет отключен и не сможет войти в систему.`)) return;

    try {
      setError("");
      setSuccess("");
      await deleteAdminUserRequest(user.id);
      setSuccess("Пользователь удален.");
      await loadAll();
    } catch (err) {
      setError(err?.response?.data ? JSON.stringify(err.response.data) : "Не удалось удалить пользователя.");
    }
  };

  const renderModal = () => {
    if (!activeModal) return null;
    const title = activeModal === "organization" ? "Организации" : "Создать пользователя";

    return (
      <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeModal()}>
        <div className="modal-panel" role="dialog" aria-modal="true" aria-label={title}>
          <div className="modal-header">
            <h2>{title}</h2>
            <button className="ghost-button" type="button" onClick={closeModal}>Закрыть</button>
          </div>

          {activeModal === "organization" ? (
            <>
              <form onSubmit={createOrganization} className="form">
                <label>Название<input value={organizationForm.name} onChange={(event) => setOrganizationForm((prev) => ({ ...prev, name: event.target.value }))} required /></label>
                <label>Тип<select value={organizationForm.org_type} onChange={(event) => setOrganizationForm((prev) => ({ ...prev, org_type: event.target.value }))}>
                  <option value="customer">Заказчик</option>
                  <option value="integrator">Интегратор</option>
                </select></label>
                <button type="submit" disabled={saving}>Создать организацию</button>
              </form>
              <div className="modal-subsection">
                <h3>Организации</h3>
                <input
                  value={organizationSearch}
                  onChange={(event) => setOrganizationSearch(event.target.value)}
                  placeholder="Поиск организации по названию"
                />
                <div className="organization-list">
                  {filteredOrganizations.map((org) => (
                    <div className="organization-row" key={org.id}>
                      <div>
                        <strong>{org.name}</strong>
                        <span>
                          {org.org_type === "integrator" ? "Интегратор" : "Заказчик"}
                          {!org.is_active ? " · архив" : ""}
                        </span>
                      </div>
                      {org.is_active ? (
                        <button type="button" className="ghost-button" onClick={() => deleteOrganization(org)}>В архив</button>
                      ) : (
                        <button type="button" className="ghost-button" onClick={() => restoreOrganization(org)}>Восстановить</button>
                      )}
                    </div>
                  ))}
                  {!filteredOrganizations.length ? <p>Организации не найдены.</p> : null}
                </div>
              </div>
            </>
          ) : null}

          {activeModal === "user" ? (
            <form onSubmit={createUser} className="form grid-form">
              <label>Username<input name="username" value={form.username} onChange={handleChange} required /></label>
              <label>Email<input name="email" type="email" value={form.email} onChange={handleChange} required /></label>
              <label>Пароль<input name="password" type="password" value={form.password} onChange={handleChange} required /></label>
              <label>Имя<input name="first_name" value={form.first_name} onChange={handleChange} /></label>
              <label>Фамилия<input name="last_name" value={form.last_name} onChange={handleChange} /></label>
              <label>Роль<select name="role" value={form.role} onChange={handleChange}>{ROLE_OPTIONS.map((role) => <option key={role} value={role}>{getRoleLabel(role)}</option>)}</select></label>
              <label>Организация<select name="organization" value={form.organization} onChange={handleChange}><option value="">Без организации</option>{activeOrganizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}</select></label>
              <label>Телефон<input name="phone" value={form.phone} onChange={handleChange} /></label>
              <label>Должность<input name="job_title" value={form.job_title} onChange={handleChange} /></label>
              <label className="checkbox"><input type="checkbox" name="is_active" checked={form.is_active} onChange={handleChange} />Активен</label>
              <button type="submit" disabled={saving}>{saving ? "Создание..." : "Создать"}</button>
            </form>
          ) : null}
        </div>
      </div>
    );
  };

  if (me?.role !== "admin") {
    return (
      <Navbar>
        <div className="page"><div className="error">Нет доступа.</div></div>
      </Navbar>
    );
  }

  return (
    <Navbar>
      <div className="page">
        <div className="page-header">
          <h1>Пользователи и роли</h1>
          <div className="compact-actions">
            <button type="button" onClick={() => setActiveModal("user")}>Пользователь</button>
            <button type="button" onClick={() => setActiveModal("organization")}>Организация</button>
          </div>
        </div>

        {error ? <div className="error">{error}</div> : null}
        {success ? <div className="success">{success}</div> : null}

        <form className="card filters" onSubmit={loadAll}>
          <input
            value={filters.search}
            onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
            placeholder="Поиск по логину, email, имени"
          />
          <select value={filters.organization} onChange={(event) => setFilters((prev) => ({ ...prev, organization: event.target.value }))}>
            <option value="">Все организации</option>
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}{!org.is_active ? " (архив)" : ""}
              </option>
            ))}
          </select>
          <select value={filters.role} onChange={(event) => setFilters((prev) => ({ ...prev, role: event.target.value }))}>
            <option value="">Все роли</option>
            {ROLE_OPTIONS.map((role) => <option key={role} value={role}>{getRoleLabel(role)}</option>)}
          </select>
          <select value={filters.is_active} onChange={(event) => setFilters((prev) => ({ ...prev, is_active: event.target.value }))}>
            <option value="">Любой статус</option>
            <option value="true">Активные</option>
            <option value="false">Отключенные</option>
          </select>
          <button type="submit">Найти</button>
        </form>

        <div className="card">
          <h2>Все пользователи</h2>
          {loading ? <p>Загрузка...</p> : null}
          {!loading ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Логин</th>
                    <th>ФИО</th>
                    <th>Email</th>
                    <th>Организация</th>
                    <th>Роль</th>
                    <th>Активен</th>
                    <th>Пароль</th>
                    <th>Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => {
                    const isSelf = String(user.id) === String(me.id);
                    return (
                      <tr key={user.id}>
                        <td>{user.username}</td>
                        <td>{`${user.first_name || ""} ${user.last_name || ""}`.trim() || "-"}</td>
                        <td>{user.email}</td>
                        <td>
                          <select value={user.organization || ""} onChange={(event) => updateUser(user.id, { organization: event.target.value || null })}>
                            <option value="">Без организации</option>
                            {organizationOptionsForUser(user).map((org) => (
                              <option key={org.id} value={org.id} disabled={!org.is_active}>
                                {org.name}{!org.is_active ? " (архив)" : ""}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <select
                            value={user.role}
                            disabled={isSelf}
                            onChange={(event) => updateUser(user.id, { role: event.target.value })}
                          >
                            {ROLE_OPTIONS.map((role) => <option key={role} value={role}>{getRoleLabel(role)}</option>)}
                          </select>
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            checked={user.is_active}
                            onChange={(event) => updateUser(user.id, { is_active: event.target.checked })}
                          />
                        </td>
                        <td>
                          <div className="password-row">
                            <input
                              type="password"
                              value={passwords[user.id] || ""}
                              onChange={(event) => setPasswords((prev) => ({ ...prev, [user.id]: event.target.value }))}
                              placeholder="Новый пароль"
                            />
                            <button type="button" onClick={() => changePassword(user.id)}>Сменить</button>
                          </div>
                        </td>
                        <td>
                          <button type="button" className="ghost-button" disabled={isSelf} onClick={() => deleteUser(user)}>Удалить</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>

        {renderModal()}
      </div>
    </Navbar>
  );
}
