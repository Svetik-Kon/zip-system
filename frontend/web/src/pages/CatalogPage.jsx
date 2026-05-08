import { useEffect, useState } from "react";
import { createCatalogItem, getCatalogItems } from "../api/inventory";
import Navbar from "../components/Navbar";
import { ITEM_TYPE_LABELS, getItemTypeLabel } from "../utils/dictionaries";

export default function CatalogPage() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({
    sku: "",
    name: "",
    model_name: "",
    manufacturer: "",
    unit: "шт.",
    item_type: "spare_part",
    description: "",
  });
  const [filters, setFilters] = useState({ search: "", item_type: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadItems();
  }, []);

  const loadItems = async (event) => {
    event?.preventDefault();
    try {
      setLoading(true);
      setError("");
      const params = {};
      if (filters.search) params.search = filters.search;
      if (filters.item_type) params.item_type = filters.item_type;
      setItems(await getCatalogItems(params));
    } catch {
      setError("Не удалось загрузить каталог.");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setForm({
      sku: "",
      name: "",
      model_name: "",
      manufacturer: "",
      unit: "шт.",
      item_type: "spare_part",
      description: "",
    });
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const getCreateError = (err) => {
    if (err?.response?.status === 403) {
      return "Нет прав на создание позиции. Выйди из системы и войди заново под администратором или сотрудником склада: токен мог остаться от старой роли.";
    }

    if (err?.response?.data?.sku) {
      return "Такой артикул уже есть. Укажи другой код позиции.";
    }

    return "Не удалось создать позицию каталога. Проверь, что артикул и наименование заполнены.";
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    try {
      setError("");
      await createCatalogItem({
        ...form,
        model_name: form.model_name || "",
        manufacturer: form.manufacturer || "",
        description: form.description || "",
      });
      resetForm();
      await loadItems();
    } catch (err) {
      setError(getCreateError(err));
    }
  };

  return (
    <Navbar>
      <div className="page">
        <div className="page-header"><h1>Каталог ЗИП</h1></div>
        {error ? <div className="error">{error}</div> : null}

        <form className="card filters" onSubmit={loadItems}>
          <input
            value={filters.search}
            onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
            placeholder="Поиск по артикулу, названию, модели, производителю"
          />
          <select value={filters.item_type} onChange={(event) => setFilters((prev) => ({ ...prev, item_type: event.target.value }))}>
            <option value="">Все типы</option>
            {Object.entries(ITEM_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <button type="submit">Найти</button>
        </form>

        <div className="card">
          <h2>Новая позиция</h2>
          <form className="form grid-form" onSubmit={handleSubmit}>
            <label>
              Артикул
              <input name="sku" value={form.sku} onChange={handleChange} placeholder="Например: RTR-CISCO-001" required />
            </label>
            <label>Наименование<input name="name" value={form.name} onChange={handleChange} required /></label>
            <label>Модель<input name="model_name" value={form.model_name} onChange={handleChange} placeholder="Например: ISR 4331" /></label>
            <label>Производитель<input name="manufacturer" value={form.manufacturer} onChange={handleChange} /></label>
            <label>Ед. изм.<input name="unit" value={form.unit} onChange={handleChange} /></label>
            <label>Тип<select name="item_type" value={form.item_type} onChange={handleChange}>{Object.entries(ITEM_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label>Описание<textarea name="description" value={form.description} onChange={handleChange} /></label>
            <button type="submit">Добавить</button>
          </form>
        </div>

        <div className="card">
          <h2>Номенклатура</h2>
          {loading ? <p>Загрузка...</p> : null}
          {!loading ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Артикул</th>
                    <th>Наименование</th>
                    <th>Модель</th>
                    <th>Тип</th>
                    <th>Производитель</th>
                    <th>Ед. изм.</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.sku}</td>
                      <td>{item.name}</td>
                      <td>{item.equipment_model_name || "-"}</td>
                      <td>{getItemTypeLabel(item.item_type)}</td>
                      <td>{item.manufacturer || "-"}</td>
                      <td>{item.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {!loading && !items.length ? <p>Позиции не найдены.</p> : null}
        </div>
      </div>
    </Navbar>
  );
}
