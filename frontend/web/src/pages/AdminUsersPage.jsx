import { useEffect, useState } from "react";
import { createUserRequest, getOrganizationsRequest } from "../api/auth";
import Navbar from "../components/Navbar";
import { getMe } from "../utils/auth";
import { getRoleLabel } from "../utils/dictionaries";

const ROLE_OPTIONS = [
  "admin",
  "customer",
  "manager",
  "warehouse",
  "engineer",
  "procurement",
];

export default function AdminUsersPage() {
  const me = getMe();

  const [organizations, setOrganizations] = useState([]);
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

  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    loadOrganizations();
  }, []);

  const loadOrganizations = async () => {
    try {
      setPageLoading(true);
      const data = await getOrganizationsRequest();
      setOrganizations(data);
    } catch (err) {
      setError("Не удалось загрузить организации.");
    } finally {
      setPageLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    try {
      setLoading(true);

      const payload = {
        ...form,
        organization: form.organization || null,
      };

      await createUserRequest(payload);

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
    } catch (err) {
      setError(
        err?.response?.data
          ? JSON.stringify(err.response.data)
          : "Не удалось создать пользователя."
      );
    } finally {
      setLoading(false);
    }
  };

  if (me?.role !== "admin") {
    return (
      <>
        <Navbar />
        <div className="page">
          <div className="error">Нет доступа.</div>
        </div>
      </>
    );
  }

  return (
    <>
      <Navbar />

      <div className="page">
        <h1>Создание пользователя</h1>

        {pageLoading ? <p>Загрузка...</p> : null}
        {error ? <div className="error">{error}</div> : null}
        {success ? <div className="success">{success}</div> : null}

        {!pageLoading ? (
          <div className="card">
            <form onSubmit={handleSubmit} className="form">
              <label>
                Username
                <input name="username" value={form.username} onChange={handleChange} required />
              </label>

              <label>
                Email
                <input name="email" type="email" value={form.email} onChange={handleChange} required />
              </label>

              <label>
                Пароль
                <input name="password" type="password" value={form.password} onChange={handleChange} required />
              </label>

              <label>
                Имя
                <input name="first_name" value={form.first_name} onChange={handleChange} />
              </label>

              <label>
                Фамилия
                <input name="last_name" value={form.last_name} onChange={handleChange} />
              </label>

              <label>
                Роль
                <select name="role" value={form.role} onChange={handleChange}>
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role} value={role}>
                      {getRoleLabel(role)}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Организация
                <select name="organization" value={form.organization} onChange={handleChange}>
                  <option value="">Без организации</option>
                  {organizations.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Телефон
                <input name="phone" value={form.phone} onChange={handleChange} />
              </label>

              <label>
                Должность
                <input name="job_title" value={form.job_title} onChange={handleChange} />
              </label>

              <label className="checkbox">
                <input
                  type="checkbox"
                  name="is_active"
                  checked={form.is_active}
                  onChange={handleChange}
                />
                Активен
              </label>

              <button type="submit" disabled={loading}>
                {loading ? "Создание..." : "Создать пользователя"}
              </button>
            </form>
          </div>
        ) : null}
      </div>
    </>
  );
}