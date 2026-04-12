import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createRequest } from "../api/requests";
import { getMe } from "../utils/auth";
import Navbar from "../components/Navbar";

export default function CreateRequestPage() {
  const navigate = useNavigate();
  const me = getMe();

  const [form, setForm] = useState({
    title: "",
    description: "",
    request_type: "repair_diagnostics",
    priority: "medium",
    equipment_name: "",
    equipment_model: "",
    serial_number: "",
    site_name: "",
    item_name: "",
    quantity: 1,
    allow_analog: false,
    item_comment: "",
  });

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const isCustomer = me?.role === "customer";

  const requestTypeOptions = isCustomer
    ? [
        { value: "repair_diagnostics", label: "Ремонт / диагностика" },
        { value: "equipment_replacement", label: "Замена оборудования" },
        { value: "software_update", label: "Обновление / запрос софта" },
      ]
    : [
        { value: "repair_diagnostics", label: "Ремонт / диагностика" },
        { value: "equipment_replacement", label: "Замена оборудования" },
        { value: "internal_request", label: "Внутренний запрос" },
        { value: "software_update", label: "Обновление / запрос софта" },
      ];

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
    setLoading(true);

    try {
      const payload = {
        title: form.title,
        description: form.description,
        request_type: form.request_type,
        priority: form.priority,
        equipment_name: form.equipment_name,
        equipment_model: form.equipment_model,
        serial_number: form.serial_number,
        site_name: form.site_name,
        items: form.item_name
          ? [
              {
                item_name: form.item_name,
                quantity: Number(form.quantity),
                allow_analog: form.allow_analog,
                comment: form.item_comment,
              },
            ]
          : [],
      };

      const created = await createRequest(payload);
      navigate(`/requests/${created.id}`);
    } catch (err) {
      setError("Не удалось создать заявку.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Navbar />

      <div className="page">
        <div className="card">
          <h1>Создание заявки</h1>

          <form onSubmit={handleSubmit} className="form">
            <label>
              Заголовок
              <input name="title" value={form.title} onChange={handleChange} />
            </label>

            <label>
              Описание
              <textarea
                name="description"
                value={form.description}
                onChange={handleChange}
              />
            </label>

            <label>
              Тип заявки
              <select
                name="request_type"
                value={form.request_type}
                onChange={handleChange}
              >
                {requestTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Приоритет
              <select
                name="priority"
                value={form.priority}
                onChange={handleChange}
              >
                <option value="low">Низкий</option>
                <option value="medium">Средний</option>
                <option value="high">Высокий</option>
                <option value="critical">Критический</option>
              </select>
            </label>

            <label>
              Оборудование
              <input
                name="equipment_name"
                value={form.equipment_name}
                onChange={handleChange}
              />
            </label>

            <label>
              Модель
              <input
                name="equipment_model"
                value={form.equipment_model}
                onChange={handleChange}
              />
            </label>

            <label>
              Серийный номер
              <input
                name="serial_number"
                value={form.serial_number}
                onChange={handleChange}
              />
            </label>

            <label>
              Площадка / объект
              <input
                name="site_name"
                value={form.site_name}
                onChange={handleChange}
              />
            </label>

            <hr />

            <h3>Позиция заявки</h3>

            <label>
              Наименование позиции
              <input
                name="item_name"
                value={form.item_name}
                onChange={handleChange}
              />
            </label>

            <label>
              Количество
              <input
                type="number"
                min="1"
                name="quantity"
                value={form.quantity}
                onChange={handleChange}
              />
            </label>

            <label className="checkbox">
              <input
                type="checkbox"
                name="allow_analog"
                checked={form.allow_analog}
                onChange={handleChange}
              />
              Разрешить аналог
            </label>

            <label>
              Комментарий к позиции
              <textarea
                name="item_comment"
                value={form.item_comment}
                onChange={handleChange}
              />
            </label>

            {error ? <div className="error">{error}</div> : null}

            <button type="submit" disabled={loading}>
              {loading ? "Создание..." : "Создать заявку"}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}