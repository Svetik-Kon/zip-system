import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createRequest } from "../api/requests";
import { getMe } from "../utils/auth";
import Navbar from "../components/Navbar";
import { REQUEST_PRIORITY_LABELS, REQUEST_TYPE_LABELS } from "../utils/dictionaries";

export default function CreateRequestPage() {
  const navigate = useNavigate();
  const me = getMe();
  const isCustomer = me?.role === "customer";
  const [form, setForm] = useState({
    title: "",
    description: "",
    request_type: "repair_diagnostics",
    priority: "medium",
    equipment_name: "",
    equipment_model: "",
    serial_number: "",
    site_name: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const requestTypes = Object.entries(REQUEST_TYPE_LABELS).filter(([value]) => !isCustomer || value !== "internal_request");

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const created = await createRequest({
        title: form.title,
        description: form.description,
        request_type: form.request_type,
        priority: form.priority,
        equipment_name: form.equipment_name,
        equipment_model: form.equipment_model,
        serial_number: form.serial_number,
        site_name: form.site_name,
        items: [],
      });
      navigate(`/requests/${created.id}`);
    } catch {
      setError("Не удалось создать заявку.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Navbar>
      <div className="page">
        <div className="card">
          <h1>Создание заявки</h1>
          <form onSubmit={handleSubmit} className="form grid-form">
            <label>Заголовок<input name="title" value={form.title} onChange={handleChange} required /></label>
            <label>Тип заявки<select name="request_type" value={form.request_type} onChange={handleChange}>{requestTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label>Приоритет<select name="priority" value={form.priority} onChange={handleChange}>{Object.entries(REQUEST_PRIORITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label>Оборудование<input name="equipment_name" value={form.equipment_name} onChange={handleChange} /></label>
            <label>Модель<input name="equipment_model" value={form.equipment_model} onChange={handleChange} /></label>
            <label>Серийный номер<input name="serial_number" value={form.serial_number} onChange={handleChange} /></label>
            <label>Площадка / объект<input name="site_name" value={form.site_name} onChange={handleChange} /></label>
            <label>Описание<textarea name="description" value={form.description} onChange={handleChange} /></label>
            {error ? <div className="error">{error}</div> : null}
            <button type="submit" disabled={loading}>{loading ? "Создание..." : "Создать заявку"}</button>
          </form>
        </div>
      </div>
    </Navbar>
  );
}
