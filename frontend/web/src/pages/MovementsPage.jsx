import { useEffect, useMemo, useState } from "react";
import { createTransaction, getCatalogItems, getLocations, getTransactions } from "../api/inventory";
import Navbar from "../components/Navbar";

const TYPES = [
  { value: "receipt", label: "Приход" },
  { value: "transfer", label: "Перемещение" },
  { value: "issue", label: "Выдача" },
  { value: "return", label: "Возврат" },
  { value: "adjustment", label: "Корректировка" },
];

export default function MovementsPage() {
  const [items, setItems] = useState([]);
  const [locations, setLocations] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [filters, setFilters] = useState({ search: "", transaction_type: "" });
  const [form, setForm] = useState({
    transaction_type: "receipt",
    source_location: "",
    destination_location: "",
    item: "",
    quantity: 1,
    related_request_id: "",
    reason: "",
    comment: "",
  });
  const [error, setError] = useState("");

  const filteredTransactions = useMemo(() => {
    const text = filters.search.toLowerCase();
    return transactions.filter((transaction) => {
      const itemText = transaction.items?.map((item) => `${item.item_sku} ${item.item_name}`).join(" ") || "";
      const matchesSearch = !text || [transaction.source_location_name, transaction.destination_location_name, transaction.performed_by_username, transaction.related_request_id, itemText].some((value) => String(value || "").toLowerCase().includes(text));
      const matchesType = !filters.transaction_type || transaction.transaction_type === filters.transaction_type;
      return matchesSearch && matchesType;
    });
  }, [transactions, filters]);

  async function loadAll() {
    try {
      setError("");
      const [itemsResult, locationsResult, transactionsResult] = await Promise.all([getCatalogItems(), getLocations(), getTransactions()]);
      setItems(itemsResult);
      setLocations(locationsResult);
      setTransactions(transactionsResult);
    } catch {
      setError("Не удалось загрузить движения.");
    }
  }

  useEffect(() => {
    queueMicrotask(() => loadAll());
  }, []);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    try {
      setError("");
      await createTransaction({
        transaction_type: form.transaction_type,
        source_location: form.source_location || null,
        destination_location: form.destination_location || null,
        related_request_id: form.related_request_id || null,
        reason: form.reason,
        comment: form.comment,
        items: [{ item: form.item, quantity: Number(form.quantity) }],
      });
      setForm({ transaction_type: "receipt", source_location: "", destination_location: "", item: "", quantity: 1, related_request_id: "", reason: "", comment: "" });
      await loadAll();
    } catch (err) {
      setError(err?.response?.data ? JSON.stringify(err.response.data) : "Не удалось оформить движение. Проверь остаток и обязательные локации.");
    }
  };

  return (
    <Navbar>
      <div className="page">
        <div className="page-header"><h1>Движения ЗИП</h1></div>
        {error ? <div className="error">{error}</div> : null}

        <div className="card">
          <h2>Новая операция</h2>
          <form className="form grid-form" onSubmit={handleSubmit}>
            <label>Тип<select name="transaction_type" value={form.transaction_type} onChange={handleChange}>{TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
            <label>Откуда<select name="source_location" value={form.source_location} onChange={handleChange}><option value="">Не выбрано</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
            <label>Куда<select name="destination_location" value={form.destination_location} onChange={handleChange}><option value="">Не выбрано</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
            <label>Позиция<select name="item" value={form.item} onChange={handleChange} required><option value="">Выбери позицию</option>{items.map((item) => <option key={item.id} value={item.id}>{item.sku} - {item.name}</option>)}</select></label>
            <label>Количество<input name="quantity" type="number" min="1" value={form.quantity} onChange={handleChange} /></label>
            <label>UUID заявки<input name="related_request_id" value={form.related_request_id} onChange={handleChange} /></label>
            <label>Основание<input name="reason" value={form.reason} onChange={handleChange} /></label>
            <label>Комментарий<textarea name="comment" value={form.comment} onChange={handleChange} /></label>
            <button type="submit">Оформить</button>
          </form>
        </div>

        <div className="card filters">
          <input placeholder="Поиск по позиции, локации, исполнителю, заявке" value={filters.search} onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))} />
          <select value={filters.transaction_type} onChange={(event) => setFilters((prev) => ({ ...prev, transaction_type: event.target.value }))}><option value="">Все типы</option>{TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select>
        </div>

        <div className="card">
          <h2>Журнал движений</h2>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Дата</th><th>Тип</th><th>Откуда</th><th>Куда</th><th>Позиции</th><th>Исполнитель</th></tr></thead>
              <tbody>
                {filteredTransactions.map((transaction) => (
                  <tr key={transaction.id}>
                    <td>{new Date(transaction.created_at).toLocaleString()}</td>
                    <td>{TYPES.find((type) => type.value === transaction.transaction_type)?.label || transaction.transaction_type}</td>
                    <td>{transaction.source_location_name || "-"}</td>
                    <td>{transaction.destination_location_name || "-"}</td>
                    <td>{transaction.items.map((item) => `${item.item_sku} x ${item.quantity}`).join(", ")}</td>
                    <td>{transaction.performed_by_username || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!filteredTransactions.length ? <p>Движений не найдено.</p> : null}
        </div>
      </div>
    </Navbar>
  );
}
