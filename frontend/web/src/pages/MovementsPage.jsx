import { useEffect, useMemo, useState } from "react";
import { createTransaction, getCatalogItems, getContracts, getEquipmentUnits, getLocations, getTransactions } from "../api/inventory";
import Navbar from "../components/Navbar";

const OPERATIONS = [
  { value: "supplier_receipt", label: "Приемка от поставщика", needsTo: true, needsReason: true },
  { value: "warehouse_transfer", label: "Перемещение между локациями", needsFrom: true, needsTo: true },
  { value: "customer_issue", label: "Выдача заказчику", needsFrom: true, needsCustomer: true, needsContract: true },
  { value: "lab_transfer", label: "Передача в лабораторию", needsFrom: true, needsTo: true, needsResponsible: true, needsDue: true },
  { value: "customer_return", label: "Возврат от заказчика", needsTo: true, needsCustomer: true },
  { value: "lab_return", label: "Возврат из лаборатории", needsFrom: true, needsTo: true, needsResponsible: true },
  { value: "write_off", label: "Списание", needsFrom: true, needsReason: true },
  { value: "stock_adjustment", label: "Инвентаризационная корректировка", needsTo: true, needsReason: true },
];

const TYPE_LABELS = {
  receipt: "Приход",
  transfer: "Перемещение",
  issue: "Выдача",
  return: "Возврат",
  adjustment: "Корректировка",
};

const INITIAL_FORM = {
  operation_kind: "supplier_receipt",
  source_location: "",
  destination_location: "",
  item: "",
  quantity: 1,
  equipment_units: [],
  related_request_id: "",
  customer_name: "",
  contract: "",
  responsible_person: "",
  due_date: "",
  reason: "",
  comment: "",
};

export default function MovementsPage() {
  const [items, setItems] = useState([]);
  const [locations, setLocations] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [equipmentUnits, setEquipmentUnits] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [filters, setFilters] = useState({ search: "", operation_kind: "" });
  const [form, setForm] = useState(INITIAL_FORM);
  const [error, setError] = useState("");

  const selectedOperation = OPERATIONS.find((operation) => operation.value === form.operation_kind) || OPERATIONS[0];

  const availableUnits = useMemo(() => equipmentUnits.filter((unit) => (
    ["available", "reserved", "lab", "customer", "needs_check"].includes(unit.status)
    && (!form.item || unit.item === form.item)
    && (!form.source_location || unit.location === form.source_location)
  )), [equipmentUnits, form.item, form.source_location]);

  const filteredTransactions = useMemo(() => {
    const text = filters.search.toLowerCase();
    return transactions.filter((transaction) => {
      const itemText = transaction.items?.map((item) => `${item.item_sku} ${item.item_name} ${item.equipment_unit_serials?.join(" ") || ""}`).join(" ") || "";
      const matchesSearch = !text || [
        transaction.source_location_name,
        transaction.destination_location_name,
        transaction.performed_by_username,
        transaction.responsible_person,
        transaction.customer_name,
        transaction.contract_display,
        transaction.related_request_id,
        itemText,
      ].some((value) => String(value || "").toLowerCase().includes(text));
      const matchesType = !filters.operation_kind || transaction.operation_kind === filters.operation_kind;
      return matchesSearch && matchesType;
    });
  }, [transactions, filters]);

  async function loadAll() {
    try {
      setError("");
      const [itemsResult, locationsResult, contractsResult, unitsResult, transactionsResult] = await Promise.all([
        getCatalogItems(),
        getLocations(),
        getContracts(),
        getEquipmentUnits(),
        getTransactions(),
      ]);
      setItems(itemsResult);
      setLocations(locationsResult);
      setContracts(contractsResult);
      setEquipmentUnits(unitsResult);
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

  const handleOperationChange = (event) => {
    setForm((prev) => ({
      ...INITIAL_FORM,
      operation_kind: event.target.value,
      item: prev.item,
      quantity: prev.quantity,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    try {
      setError("");
      const selectedUnits = form.equipment_units;
      await createTransaction({
        operation_kind: form.operation_kind,
        source_location: form.source_location || null,
        destination_location: form.destination_location || null,
        related_request_id: form.related_request_id || null,
        customer_name: form.customer_name,
        contract: form.contract || null,
        responsible_person: form.responsible_person,
        due_date: form.due_date || null,
        reason: form.reason,
        comment: form.comment,
        items: [{
          item: form.item,
          quantity: selectedUnits.length ? selectedUnits.length : Number(form.quantity),
          equipment_units: selectedUnits,
        }],
      });
      setForm(INITIAL_FORM);
      await loadAll();
    } catch (err) {
      setError(err?.response?.data ? JSON.stringify(err.response.data) : "Не удалось оформить движение. Проверь остаток, серийники и обязательные поля.");
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
            <label>Сценарий<select name="operation_kind" value={form.operation_kind} onChange={handleOperationChange}>{OPERATIONS.map((operation) => <option key={operation.value} value={operation.value}>{operation.label}</option>)}</select></label>
            {selectedOperation.needsFrom ? <label>Откуда<select name="source_location" value={form.source_location} onChange={handleChange} required><option value="">Не выбрано</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label> : null}
            {selectedOperation.needsTo ? <label>Куда<select name="destination_location" value={form.destination_location} onChange={handleChange} required><option value="">Не выбрано</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label> : null}
            <label>Позиция<select name="item" value={form.item} onChange={(event) => setForm((prev) => ({ ...prev, item: event.target.value, equipment_units: [] }))} required><option value="">Выбери позицию</option>{items.map((item) => <option key={item.id} value={item.id}>{item.sku} - {item.name}</option>)}</select></label>
            <label>Количество<input name="quantity" type="number" min="1" value={form.quantity} onChange={handleChange} disabled={form.equipment_units.length > 0} /></label>
            <label>
              Серийные номера
              <select multiple value={form.equipment_units} onChange={(event) => setForm((prev) => ({ ...prev, equipment_units: Array.from(event.target.selectedOptions, (option) => option.value) }))}>
                {availableUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.serial_number} / {unit.status}</option>)}
              </select>
            </label>
            {selectedOperation.needsCustomer ? <label>Заказчик<input name="customer_name" value={form.customer_name} onChange={handleChange} placeholder="Заполни, если договор не выбран" /></label> : null}
            {selectedOperation.needsContract ? <label>Договор<select name="contract" value={form.contract} onChange={handleChange}><option value="">Не выбран</option>{contracts.map((contract) => <option key={contract.id} value={contract.id}>{contract.customer_name} / {contract.number}</option>)}</select></label> : null}
            {selectedOperation.needsResponsible ? <label>Ответственный<input name="responsible_person" value={form.responsible_person} onChange={handleChange} placeholder="Например: Иванов И.И." required /></label> : null}
            {selectedOperation.needsDue ? <label>Вернуть/использовать до<input name="due_date" type="date" value={form.due_date} onChange={handleChange} /></label> : null}
            <label>UUID заявки<input name="related_request_id" value={form.related_request_id} onChange={handleChange} /></label>
            {selectedOperation.needsReason ? <label>Основание<input name="reason" value={form.reason} onChange={handleChange} required /></label> : <label>Основание<input name="reason" value={form.reason} onChange={handleChange} /></label>}
            <label>Комментарий<textarea name="comment" value={form.comment} onChange={handleChange} /></label>
            <button type="submit">Оформить</button>
          </form>
        </div>

        <div className="card filters">
          <input placeholder="Поиск по позиции, серийнику, локации, заказчику, договору" value={filters.search} onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))} />
          <select value={filters.operation_kind} onChange={(event) => setFilters((prev) => ({ ...prev, operation_kind: event.target.value }))}><option value="">Все сценарии</option>{OPERATIONS.map((operation) => <option key={operation.value} value={operation.value}>{operation.label}</option>)}</select>
        </div>

        <div className="card">
          <h2>Журнал движений</h2>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Дата</th><th>Сценарий</th><th>Тип</th><th>Откуда</th><th>Куда</th><th>Позиции</th><th>Серийники</th><th>Заказчик</th><th>Ответственный</th><th>До</th><th>Исполнитель</th></tr></thead>
              <tbody>
                {filteredTransactions.map((transaction) => (
                  <tr key={transaction.id}>
                    <td>{new Date(transaction.created_at).toLocaleString()}</td>
                    <td>{OPERATIONS.find((operation) => operation.value === transaction.operation_kind)?.label || transaction.operation_kind}</td>
                    <td>{TYPE_LABELS[transaction.transaction_type] || transaction.transaction_type}</td>
                    <td>{transaction.source_location_name || "-"}</td>
                    <td>{transaction.destination_location_name || "-"}</td>
                    <td>{transaction.items.map((item) => `${item.item_sku} x ${item.quantity}`).join(", ")}</td>
                    <td>{transaction.items.flatMap((item) => item.equipment_unit_serials || []).join(", ") || "-"}</td>
                    <td>{transaction.customer_name || transaction.contract_display || "-"}</td>
                    <td>{transaction.responsible_person || "-"}</td>
                    <td>{transaction.due_date || "-"}</td>
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
