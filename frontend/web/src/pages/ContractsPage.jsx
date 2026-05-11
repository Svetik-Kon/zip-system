import { useEffect, useMemo, useState } from "react";
import { createContract, getContracts, updateContract } from "../api/inventory";
import { getOrganizationsRequest } from "../api/auth";
import Navbar from "../components/Navbar";

const CONTRACT_STATUS_LABELS = {
  active: "Активен",
  expiring: "Истекает",
  expired: "Истек",
  closed: "Закрыт",
};

const fileUrl = (value) => {
  if (!value) return "";
  if (String(value).startsWith("http")) return value;
  if (String(value).startsWith("/")) return `http://localhost:8003${value}`;
  return `http://localhost:8003/${value}`;
};

const emptyForm = {
  organization_id: "",
  number: "",
  starts_at: "",
  ends_at: "",
  status: "active",
  file: null,
  comment: "",
};

function appendIfValue(formData, key, value) {
  if (value !== undefined && value !== null && value !== "") {
    formData.append(key, value);
  }
}

export default function ContractsPage() {
  const [contracts, setContracts] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [filters, setFilters] = useState({ search: "", status: "", organization_id: "" });
  const [form, setForm] = useState(emptyForm);
  const [activeModal, setActiveModal] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const customerOrganizations = useMemo(
    () => organizations.filter((org) => org.is_active && org.org_type === "customer"),
    [organizations],
  );

  const organizationById = useMemo(
    () => new Map(organizations.map((org) => [org.id, org])),
    [organizations],
  );

  const loadAll = async (event) => {
    event?.preventDefault();
    try {
      setLoading(true);
      setError("");
      const params = {};
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params[key] = value;
      });
      const [contractResult, organizationResult] = await Promise.all([
        getContracts(params),
        getOrganizationsRequest(),
      ]);
      setContracts(contractResult);
      setOrganizations(organizationResult);
    } catch (err) {
      setError(err?.response?.data ? JSON.stringify(err.response.data) : "Не удалось загрузить договоры.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const closeModal = () => setActiveModal("");

  const handleOrganizationChange = (organizationId) => {
    const organization = customerOrganizations.find((org) => org.id === organizationId);
    setForm((prev) => ({
      ...prev,
      organization_id: organizationId,
      customer_name: organization?.name || "",
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const organization = organizationById.get(form.organization_id);
    if (!organization) {
      setError("Выбери организацию-заказчика.");
      return;
    }

    const formData = new FormData();
    formData.append("customer_name", organization.name);
    formData.append("number", form.number);
    formData.append("status", form.status);
    appendIfValue(formData, "organization_id", form.organization_id);
    appendIfValue(formData, "starts_at", form.starts_at);
    appendIfValue(formData, "ends_at", form.ends_at);
    appendIfValue(formData, "file", form.file);
    appendIfValue(formData, "comment", form.comment);

    try {
      setSaving(true);
      setError("");
      setMessage("");
      await createContract(formData);
      setForm(emptyForm);
      event.target.reset();
      closeModal();
      setMessage("Договор сохранен.");
      await loadAll();
    } catch (err) {
      setError(err?.response?.data ? JSON.stringify(err.response.data) : "Не удалось сохранить договор.");
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (contract, status) => {
    try {
      setError("");
      setMessage("");
      await updateContract(contract.id, { status });
      setMessage("Статус договора обновлен.");
      await loadAll();
    } catch (err) {
      setError(err?.response?.data ? JSON.stringify(err.response.data) : "Не удалось обновить статус договора.");
    }
  };

  const renderModal = () => {
    if (activeModal !== "create") return null;

    return (
      <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeModal()}>
        <div className="modal-panel" role="dialog" aria-modal="true" aria-label="Новый договор">
          <div className="modal-header">
            <h2>Новый договор</h2>
            <button className="ghost-button" type="button" onClick={closeModal}>Закрыть</button>
          </div>
          <form className="form" onSubmit={handleSubmit}>
            <select value={form.organization_id} onChange={(event) => handleOrganizationChange(event.target.value)}>
              <option value="">Организация заказчика</option>
              {customerOrganizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
            </select>
            <input placeholder="Номер договора" value={form.number} onChange={(event) => setForm((prev) => ({ ...prev, number: event.target.value }))} required />
            <label>Начало<input type="date" value={form.starts_at} onChange={(event) => setForm((prev) => ({ ...prev, starts_at: event.target.value }))} /></label>
            <label>Окончание<input type="date" value={form.ends_at} onChange={(event) => setForm((prev) => ({ ...prev, ends_at: event.target.value }))} /></label>
            <select value={form.status} onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}>
              {Object.entries(CONTRACT_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <label>Файл договора<input type="file" onChange={(event) => setForm((prev) => ({ ...prev, file: event.target.files?.[0] || null }))} /></label>
            <textarea placeholder="Комментарий" value={form.comment} onChange={(event) => setForm((prev) => ({ ...prev, comment: event.target.value }))} />
            <button type="submit" disabled={saving}>{saving ? "Сохранение..." : "Сохранить договор"}</button>
          </form>
        </div>
      </div>
    );
  };

  return (
    <Navbar>
      <div className="page">
        <div className="page-header">
          <h1>Договоры</h1>
          <div className="compact-actions">
            <button type="button" onClick={() => setActiveModal("create")}>Договор</button>
          </div>
        </div>

        {error ? <div className="error">{error}</div> : null}
        {message ? <div className="success">{message}</div> : null}

        <form className="card filters" onSubmit={loadAll}>
          <input value={filters.search} onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))} placeholder="Поиск по заказчику или номеру договора" />
          <select value={filters.organization_id} onChange={(event) => setFilters((prev) => ({ ...prev, organization_id: event.target.value }))}>
            <option value="">Все организации</option>
            {customerOrganizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
          </select>
          <select value={filters.status} onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}>
            <option value="">Все статусы</option>
            {Object.entries(CONTRACT_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <button type="submit">Найти</button>
        </form>

        <div className="card">
          <h2>Реестр договоров</h2>
          {loading ? <p>Загрузка...</p> : null}
          {!loading ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Организация</th>
                    <th>Номер</th>
                    <th>Срок</th>
                    <th>Статус</th>
                    <th>Файл</th>
                    <th>Комментарий</th>
                  </tr>
                </thead>
                <tbody>
                  {contracts.map((contract) => (
                    <tr key={contract.id}>
                      <td>{organizationById.get(contract.organization_id)?.name || "Без организации"}</td>
                      <td>{contract.number}</td>
                      <td>{contract.starts_at || "-"} - {contract.ends_at || "-"}</td>
                      <td>
                        <select value={contract.status} onChange={(event) => handleStatusChange(contract, event.target.value)}>
                          {Object.entries(CONTRACT_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                      </td>
                      <td>{contract.file ? <a href={fileUrl(contract.file)} target="_blank" rel="noreferrer">Открыть</a> : "-"}</td>
                      <td>{contract.comment || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {!loading && !contracts.length ? <p>Договоры не найдены.</p> : null}
        </div>

        {renderModal()}
      </div>
    </Navbar>
  );
}
