import { useEffect, useMemo, useState } from "react";
import { createTransaction, getCatalogItems, getContracts, getEquipmentUnits, getLocations, getReservations, getTransactions } from "../api/inventory";
import { changeRequestStatus, getRequestById } from "../api/requests";
import Navbar from "../components/Navbar";

const OPERATIONS = [
  { value: "supplier_receipt", label: "Приемка от поставщика", needsTo: true, needsReason: true },
  { value: "warehouse_transfer", label: "Перемещение между локациями", needsFrom: true, needsTo: true },
  { value: "customer_issue", label: "Выдача заказчику", needsFrom: true, needsCustomer: true, needsContract: true },
  { value: "lab_transfer", label: "Передача в лабораторию", needsFrom: true, needsTo: true, needsResponsible: true, needsDue: true },
  { value: "customer_return", label: "Возврат от заказчика", needsTo: true, needsCustomer: true, needsContract: true },
  { value: "lab_return", label: "Возврат из лаборатории", needsFrom: true, needsTo: true, needsResponsible: true },
  { value: "write_off", label: "Списание", needsFrom: true, needsReason: true },
];

const CONTRACT_STATUS_LABELS = {
  active: "активен",
  expiring: "истекает",
  expired: "истек",
  closed: "закрыт",
};

const todayIso = () => new Date().toLocaleDateString("en-CA");

const isContractBlocked = (contract) => Boolean(contract && (
  ["expired", "closed"].includes(contract.status)
  || (contract.ends_at && contract.ends_at < todayIso())
));

const INITIAL_FORM = {
  operation_kind: "supplier_receipt",
  source_location: "",
  destination_location: "",
  item: "",
  quantity: 1,
  equipment_units: [],
  reservation: "",
  serial_numbers: "",
  related_request_id: "",
  customer_name: "",
  contract: "",
  responsible_person: "",
  due_date: "",
  reason: "",
  comment: "",
};

const APPROVED_FOR_CUSTOMER_ISSUE = ["awaiting_warehouse", "reserved", "ready_to_ship", "partially_fulfilled"];
const APPROVED_FOR_LAB_TRANSFER = ["diagnostics", "awaiting_warehouse", "in_lab"];

const CSV_ALIASES = {
  sku: ["sku", "артикул"],
  location: ["location", "локация", "склад", "куда"],
  quantity: ["quantity", "количество", "qty"],
  serial_number: ["serial_number", "серийный_номер", "серийник"],
  serial_numbers: ["serial_numbers", "серийные_номера", "серийники"],
  reason: ["reason", "основание"],
  comment: ["comment", "комментарий"],
};

function parseCsvLine(line, delimiter) {
  const values = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === "\"" && quoted && next === "\"") {
      value += "\"";
      index += 1;
    } else if (char === "\"") {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      values.push(value.trim());
      value = "";
    } else {
      value += char;
    }
  }

  values.push(value.trim());
  return values;
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [];
  const delimiter = lines[0].split(";").length >= lines[0].split(",").length ? ";" : ",";
  const headers = parseCsvLine(lines[0], delimiter).map((header) => header.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line, delimiter);
    return headers.reduce((row, header, index) => ({ ...row, [header]: values[index] || "" }), {});
  });
}

function field(row, name) {
  const aliases = CSV_ALIASES[name] || [name];
  const key = aliases.find((alias) => Object.prototype.hasOwnProperty.call(row, alias));
  return key ? row[key].trim() : "";
}

function toPositiveCount(value, fallback = 1) {
  const number = Number(String(value || "").replace(",", "."));
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

function splitSerials(value) {
  return String(value || "")
    .split(/\r?\n|\||,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function MovementsPage() {
  const [items, setItems] = useState([]);
  const [locations, setLocations] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [equipmentUnits, setEquipmentUnits] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [filters, setFilters] = useState({ search: "", operation_kind: "" });
  const [form, setForm] = useState(INITIAL_FORM);
  const [itemSearch, setItemSearch] = useState("");
  const [serialUnitSearch, setSerialUnitSearch] = useState("");
  const [receiptImportOpen, setReceiptImportOpen] = useState(false);
  const [receiptImportFile, setReceiptImportFile] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selectedOperation = OPERATIONS.find((operation) => operation.value === form.operation_kind) || OPERATIONS[0];
  const selectedItem = items.find((item) => item.id === form.item);
  const isSupplierReceipt = form.operation_kind === "supplier_receipt";
  const canMoveQuantityReservation = ["warehouse_transfer", "lab_transfer", "lab_return"].includes(form.operation_kind);
  const allowBlockedContracts = form.operation_kind === "customer_return";
  const isSerialItem = selectedItem?.tracking_type === "serial";
  const isQuantityItem = selectedItem?.tracking_type === "quantity";
  const isSerialReceipt = isSupplierReceipt && selectedItem?.tracking_type === "serial";
  const serialNumbers = form.serial_numbers
    .split(/\r?\n|,/)
    .map((value) => value.trim())
    .filter(Boolean);

  const itemSearchResults = useMemo(() => {
    const text = itemSearch.trim().toLowerCase();
    if (!text) return items.slice(0, 8);
    return items.filter((item) => [
      item.sku,
      item.name,
      item.equipment_model_name,
      item.manufacturer,
    ].some((value) => String(value || "").toLowerCase().includes(text))).slice(0, 12);
  }, [items, itemSearch]);

  const availableUnits = useMemo(() => equipmentUnits.filter((unit) => (
    ["available", "reserved", "lab", "customer", "needs_check"].includes(unit.status)
    && (!form.item || unit.item === form.item)
    && (!form.source_location || unit.location === form.source_location)
  )), [equipmentUnits, form.item, form.source_location]);

  const selectedUnits = useMemo(
    () => equipmentUnits.filter((unit) => form.equipment_units.includes(unit.id)),
    [equipmentUnits, form.equipment_units],
  );

  const serialSearchResults = useMemo(() => {
    const text = serialUnitSearch.trim().toLowerCase();
    return availableUnits.filter((unit) => (
      !form.equipment_units.includes(unit.id)
      && (!text || [
        unit.serial_number,
        unit.inventory_number,
        unit.status,
        unit.location_name,
        unit.customer_name,
        unit.contract_number,
      ].some((value) => String(value || "").toLowerCase().includes(text)))
    )).slice(0, 12);
  }, [availableUnits, form.equipment_units, serialUnitSearch]);

  const quantityReservations = useMemo(() => reservations.filter((reservation) => (
    reservation.status === "active"
    && reservation.reservation_type === "quantity"
    && (!form.item || reservation.item === form.item)
    && (!form.source_location || reservation.location === form.source_location)
  )), [reservations, form.item, form.source_location]);

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
      const [itemsResult, locationsResult, contractsResult, unitsResult, reservationsResult, transactionsResult] = await Promise.all([
        getCatalogItems(),
        getLocations(),
        getContracts(),
        getEquipmentUnits(),
        getReservations(),
        getTransactions(),
      ]);
      setItems(itemsResult);
      setLocations(locationsResult);
      setContracts(contractsResult);
      setEquipmentUnits(unitsResult);
      setReservations(reservationsResult);
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
    setForm((prev) => ({
      ...prev,
      [name]: value,
      ...(name === "source_location" ? { reservation: "", equipment_units: [] } : {}),
    }));
    if (name === "source_location") setSerialUnitSearch("");
  };

  const handleOperationChange = (event) => {
    setForm((prev) => ({
      ...INITIAL_FORM,
      operation_kind: event.target.value,
      item: prev.item,
      quantity: prev.quantity,
      reservation: "",
    }));
  };

  const selectItem = (item) => {
    setForm((prev) => ({ ...prev, item: item.id, equipment_units: [], reservation: "", serial_numbers: "" }));
    setSerialUnitSearch("");
    setItemSearch(`${item.sku} - ${item.name}${item.equipment_model_name ? ` / ${item.equipment_model_name}` : ""}`);
  };

  const addSerialUnit = (unit) => {
    setForm((prev) => ({ ...prev, equipment_units: [...prev.equipment_units, unit.id] }));
    setSerialUnitSearch("");
  };

  const removeSerialUnit = (unitId) => {
    setForm((prev) => ({ ...prev, equipment_units: prev.equipment_units.filter((id) => id !== unitId) }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    try {
      setError("");
      let relatedRequest = null;
      if (["customer_issue", "lab_transfer"].includes(form.operation_kind)) {
        if (!form.related_request_id.trim()) {
          setError("Для выдачи заказчику и передачи в лабораторию нужно указать UUID согласованной заявки.");
          return;
        }
        relatedRequest = await getRequestById(form.related_request_id.trim());
        const allowedStatuses = form.operation_kind === "customer_issue" ? APPROVED_FOR_CUSTOMER_ISSUE : APPROVED_FOR_LAB_TRANSFER;
        if (!allowedStatuses.includes(relatedRequest.status)) {
          setError("Заявка еще не согласована для этой операции. Сначала переведите ее через согласование в подходящий рабочий статус.");
          return;
        }
      }
      const selectedUnitIds = form.equipment_units;
      const selectedReservations = reservations.filter((reservation) => (
        reservation.status === "active"
        && selectedUnitIds.some((unitId) => reservation.equipment_units?.includes(unitId))
      ));
      const conflictingReservations = form.operation_kind === "customer_issue"
        ? selectedReservations.filter((reservation) => (
          (reservation.contract && form.contract && reservation.contract !== form.contract)
          || (!reservation.contract && reservation.customer_name && form.customer_name && reservation.customer_name.trim().toLowerCase() !== form.customer_name.trim().toLowerCase())
          || (!form.contract && !form.customer_name)
        ))
        : [];
      const hardConflict = conflictingReservations.find((reservation) => reservation.is_hard);
      if (hardConflict) {
        setError("Выбранный серийник жестко закреплен под другого заказчика или договор. Сначала снимите резерв или измените закрепление.");
        return;
      }
      const overrideReservationConflict = conflictingReservations.length > 0;
      if (overrideReservationConflict && !window.confirm("Это оборудование зарезервировано под другого заказчика или договор. Точно выдать его другому? Обязательно найдите или закупите замену этому резерву.")) {
        return;
      }
      if (form.operation_kind === "write_off" && !window.confirm("Списание нельзя отменить. Точно списать выбранное оборудование?")) {
        return;
      }
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
        override_reservation_conflict: overrideReservationConflict,
        items: [{
          item: form.item,
          quantity: serialNumbers.length ? serialNumbers.length : selectedUnitIds.length ? selectedUnitIds.length : Number(form.quantity),
          equipment_units: selectedUnitIds,
          reservation: form.reservation || null,
          serial_numbers: serialNumbers,
        }],
      });
      if (form.operation_kind === "customer_issue" && relatedRequest?.id && relatedRequest.status !== "awaiting_confirmation") {
        await changeRequestStatus(relatedRequest.id, { status: "awaiting_confirmation", comment: "Оборудование выдано заказчику, ожидается подтверждение получения." });
      }
      if (form.operation_kind === "lab_transfer" && relatedRequest?.id && relatedRequest.status !== "in_lab") {
        await changeRequestStatus(relatedRequest.id, { status: "in_lab", comment: "Оборудование передано в лабораторию." });
      }
      setForm(INITIAL_FORM);
      setItemSearch("");
      await loadAll();
    } catch (err) {
      setError(err?.response?.data ? JSON.stringify(err.response.data) : "Не удалось оформить движение. Проверь остаток, серийники и обязательные поля.");
    }
  };

  const handleReceiptImportSubmit = async (event) => {
    event.preventDefault();
    if (!receiptImportFile) {
      setError("Выбери CSV-файл приемки.");
      return;
    }

    try {
      setError("");
      setMessage("Импорт приемки выполняется...");
      const rows = parseCsv(await receiptImportFile.text());
      if (!rows.length) {
        setError("В CSV нет строк для загрузки.");
        setMessage("");
        return;
      }

      const itemBySku = new Map(items.map((item) => [item.sku.toLowerCase(), item]));
      const locationByName = new Map(locations.map((location) => [location.name.toLowerCase(), location]));
      let importedCount = 0;

      for (const row of rows) {
        const sku = field(row, "sku");
        const locationName = field(row, "location");
        const item = itemBySku.get(sku.toLowerCase());
        const location = locationByName.get(locationName.toLowerCase());

        if (!sku || !locationName) {
          throw new Error("Для каждой строки нужны sku и location.");
        }
        if (!item) {
          throw new Error(`SKU ${sku} не найден в каталоге. Сначала заведи позицию в каталоге.`);
        }
        if (!location) {
          throw new Error(`Локация ${locationName} не найдена. Сначала заведи локацию.`);
        }

        const serials = splitSerials(`${field(row, "serial_number")}\n${field(row, "serial_numbers")}`);
        const quantity = item.tracking_type === "serial" ? serials.length : toPositiveCount(field(row, "quantity"), 1);

        if (item.tracking_type === "serial" && !serials.length) {
          throw new Error(`Для серийной позиции ${sku} нужно указать serial_number или serial_numbers.`);
        }

        await createTransaction({
          operation_kind: "supplier_receipt",
          source_location: null,
          destination_location: location.id,
          related_request_id: null,
          customer_name: "",
          contract: null,
          responsible_person: "",
          due_date: null,
          reason: field(row, "reason") || "Массовая приемка по CSV",
          comment: field(row, "comment"),
          items: [{
            item: item.id,
            quantity,
            equipment_units: [],
            reservation: null,
            serial_numbers: serials,
          }],
        });
        importedCount += 1;
      }

      setReceiptImportFile(null);
      setReceiptImportOpen(false);
      setMessage(`Импортировано строк приемки: ${importedCount}.`);
      await loadAll();
    } catch (err) {
      setMessage("");
      setError(err?.response?.data ? JSON.stringify(err.response.data) : err.message || "Не удалось импортировать CSV приемки.");
    }
  };

  return (
    <Navbar>
      <div className="page">
        <div className="page-header">
          <h1>Движения ЗИП</h1>
          <div className="compact-actions">
            <button type="button" className="ghost-button" onClick={() => setReceiptImportOpen(true)}>Приемка CSV</button>
          </div>
        </div>
        {error ? <div className="error">{error}</div> : null}
        {message ? <div className="success">{message}</div> : null}

        {receiptImportOpen ? (
          <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setReceiptImportOpen(false)}>
            <div className="modal-panel" role="dialog" aria-modal="true" aria-label="Импорт приемки CSV">
              <div className="modal-header">
                <h2>Приемка CSV</h2>
                <button className="ghost-button" type="button" onClick={() => setReceiptImportOpen(false)}>Закрыть</button>
              </div>
              <form className="form" onSubmit={handleReceiptImportSubmit}>
                <input type="file" accept=".csv,text/csv" onChange={(event) => setReceiptImportFile(event.target.files?.[0] || null)} />
                <p className="field-note">SKU и локации должны уже существовать. Для серийного учета укажи серийники, для количественного - количество.</p>
                <a className="button-link secondary" href="/sample-receipt.csv" download>Скачать шаблон CSV</a>
                <button type="submit">Загрузить приемку</button>
              </form>
            </div>
          </div>
        ) : null}

        <div className="card movement-card">
          <h2>Новая операция</h2>
          <form className="form movement-form" onSubmit={handleSubmit}>
            <label>Сценарий<select name="operation_kind" value={form.operation_kind} onChange={handleOperationChange}>{OPERATIONS.map((operation) => <option key={operation.value} value={operation.value}>{operation.label}</option>)}</select></label>
            {selectedOperation.needsFrom ? <label>Откуда<select name="source_location" value={form.source_location} onChange={handleChange} required><option value="">Не выбрано</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label> : null}
            {selectedOperation.needsTo ? <label>Куда<select name="destination_location" value={form.destination_location} onChange={handleChange} required><option value="">Не выбрано</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label> : null}
            <label className="lookup-field">
              Позиция
              <input
                value={itemSearch}
                onChange={(event) => {
                  setItemSearch(event.target.value);
                  setForm((prev) => ({ ...prev, item: "", equipment_units: [], reservation: "", serial_numbers: "" }));
                }}
                placeholder="Начни вводить SKU, название или модель"
                required={!form.item}
              />
              {!form.item && itemSearchResults.length ? (
                <div className="lookup-list">
                  {itemSearchResults.map((item) => (
                    <button key={item.id} type="button" onClick={() => selectItem(item)}>
                      <strong>{item.sku}</strong>
                      <span>{item.name}{item.equipment_model_name ? ` / ${item.equipment_model_name}` : ""}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </label>
            {isSerialReceipt ? (
              <label>
                Серийные номера
                <textarea name="serial_numbers" value={form.serial_numbers} onChange={handleChange} placeholder="Каждый серийный номер с новой строки" required />
              </label>
            ) : null}
            {selectedItem && isQuantityItem ? (
              <label>Количество<input name="quantity" type="number" min="1" value={form.quantity} onChange={handleChange} /></label>
            ) : null}
            {canMoveQuantityReservation && isQuantityItem ? (
              <label>
                Резерв
                <select name="reservation" value={form.reservation} onChange={handleChange}>
                  <option value="">Свободный остаток</option>
                  {quantityReservations.map((reservation) => (
                    <option key={reservation.id} value={reservation.id}>
                      {reservation.customer_name || "Заказчик не указан"} / {reservation.contract_display || reservation.contract_number || "без договора"} / {reservation.quantity} шт.
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {!isSupplierReceipt && isSerialItem ? (
              <label className="lookup-field serial-lookup">
                Серийные номера
                <input
                  value={serialUnitSearch}
                  onChange={(event) => setSerialUnitSearch(event.target.value)}
                  placeholder="Найти серийник, статус, локацию или заказчика"
                />
                {serialUnitSearch || serialSearchResults.length ? (
                  <div className="lookup-list serial-lookup-list">
                    {serialSearchResults.map((unit) => (
                      <button key={unit.id} type="button" onClick={() => addSerialUnit(unit)}>
                        <strong>{unit.serial_number}</strong>
                        <span>{unit.location_name || "-"} / {unit.status}{unit.customer_name ? ` / ${unit.customer_name}` : ""}</span>
                      </button>
                    ))}
                    {!serialSearchResults.length ? <span className="lookup-empty">Серийники не найдены</span> : null}
                  </div>
                ) : null}
                {selectedUnits.length ? (
                  <div className="selected-chip-list">
                    {selectedUnits.map((unit) => (
                      <button key={unit.id} type="button" className="selected-chip" onClick={() => removeSerialUnit(unit.id)}>
                        {unit.serial_number} <span>×</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </label>
            ) : null}
            {selectedOperation.needsCustomer ? <label>Заказчик<input name="customer_name" value={form.customer_name} onChange={handleChange} placeholder="Заполни, если договор не выбран" /></label> : null}
            {selectedOperation.needsContract ? <label>Договор<select name="contract" value={form.contract} onChange={handleChange}><option value="">Не выбран</option>{contracts.map((contract) => <option key={contract.id} value={contract.id} disabled={!allowBlockedContracts && isContractBlocked(contract)}>{contract.customer_name} / {contract.number} ({CONTRACT_STATUS_LABELS[contract.status] || contract.status})</option>)}</select></label> : null}
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
              <thead><tr><th>Дата</th><th>Сценарий</th><th>Откуда</th><th>Куда</th><th>Позиции</th><th>Серийники</th><th>Заказчик</th><th>Ответственный</th><th>До</th><th>Обоснование / комментарий</th><th>Исполнитель</th></tr></thead>
              <tbody>
                {filteredTransactions.map((transaction) => (
                  <tr key={transaction.id}>
                    <td>{new Date(transaction.created_at).toLocaleString()}</td>
                    <td>{OPERATIONS.find((operation) => operation.value === transaction.operation_kind)?.label || transaction.operation_kind}</td>
                    <td>{transaction.source_location_name || "-"}</td>
                    <td>{transaction.destination_location_name || "-"}</td>
                    <td>{transaction.items.map((item) => `${item.item_sku} x ${item.quantity}`).join(", ")}</td>
                    <td>{transaction.items.flatMap((item) => item.equipment_unit_serials || []).join(", ") || "-"}</td>
                    <td>{transaction.customer_name || transaction.contract_display || "-"}</td>
                    <td>{transaction.responsible_person || "-"}</td>
                    <td>{transaction.due_date || "-"}</td>
                    <td>{[transaction.reason, transaction.comment].filter(Boolean).join(" / ") || "-"}</td>
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
