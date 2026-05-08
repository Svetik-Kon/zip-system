import { useEffect, useState } from "react";
import {
  changeAdminUserPasswordRequest,
  createUserRequest,
  getAdminUsersRequest,
  getOrganizationsRequest,
  updateAdminUserRequest,
} from "../api/auth";
import Navbar from "../components/Navbar";
import { getMe } from "../utils/auth";
import { ROLE_LABELS, getRoleLabel } from "../utils/dictionaries";

const ROLE_OPTIONS = Object.keys(ROLE_LABELS);

export default function AdminUsersPage() {
  const me = getMe();
  const [users, setUsers] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [filters, setFilters] = useState({ search: "", role: "", is_active: "" });
  const [passwords, setPasswords] = useState({});
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
        </div>

        {error ? <div className="error">{error}</div> : null}
        {success ? <div className="success">{success}</div> : null}

        <form className="card filters" onSubmit={loadAll}>
          <input
            value={filters.search}
            onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
            placeholder="Поиск по логину, email, имени"
          />
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
          <h2>Создать пользователя</h2>
          <form onSubmit={createUser} className="form grid-form">
            <label>Username<input name="username" value={form.username} onChange={handleChange} required /></label>
            <label>Email<input name="email" type="email" value={form.email} onChange={handleChange} required /></label>
            <label>Пароль<input name="password" type="password" value={form.password} onChange={handleChange} required /></label>
            <label>Имя<input name="first_name" value={form.first_name} onChange={handleChange} /></label>
            <label>Фамилия<input name="last_name" value={form.last_name} onChange={handleChange} /></label>
            <label>Роль<select name="role" value={form.role} onChange={handleChange}>{ROLE_OPTIONS.map((role) => <option key={role} value={role}>{getRoleLabel(role)}</option>)}</select></label>
            <label>Организация<select name="organization" value={form.organization} onChange={handleChange}><option value="">Без организации</option>{organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}</select></label>
            <label>Телефон<input name="phone" value={form.phone} onChange={handleChange} /></label>
            <label>Должность<input name="job_title" value={form.job_title} onChange={handleChange} /></label>
            <label className="checkbox"><input type="checkbox" name="is_active" checked={form.is_active} onChange={handleChange} />Активен</label>
            <button type="submit" disabled={saving}>{saving ? "Создание..." : "Создать"}</button>
          </form>
        </div>

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
                        <td>{user.organization_name || "-"}</td>
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
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </div>
    </Navbar>
  );
}
