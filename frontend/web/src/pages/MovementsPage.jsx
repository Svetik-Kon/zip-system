import { useEffect, useMemo, useRef, useState } from "react";
import { createTransaction, getBalances, getCatalogItems, getContracts, getEquipmentUnits, getLocations, getReservations, getTransactions } from "../api/inventory";
import { getRequestById, getRequests } from "../api/requests";
import LookupSelect from "../components/LookupSelect";
import Navbar from "../components/Navbar";
import Pagination from "../components/Pagination";

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
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  related_request_number: "",
  customer_name: "",
  contract: "",
  responsible_person: "",
  due_date: "",
  reason: "",
  comment: "",
};

const REQUEST_STATUSES_BLOCKING_MOVEMENT = ["new", "in_review", "rejected", "cancelled"];

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
  const [balances, setBalances] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [equipmentUnits, setEquipmentUnits] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [filters, setFilters] = useState({ search: "", operation_kind: "" });
  const [form, setForm] = useState(INITIAL_FORM);
  const [serialUnitSearch, setSerialUnitSearch] = useState("");
  const [serialLookupOpen, setSerialLookupOpen] = useState(false);
  const [requestLookupResults, setRequestLookupResults] = useState([]);
  const [requestLookupLoading, setRequestLookupLoading] = useState(false);
  const [receiptImportOpen, setReceiptImportOpen] = useState(false);
  const [receiptImportFile, setReceiptImportFile] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);
  const serialLookupRef = useRef(null);

  const selectedOperation = OPERATIONS.find((operation) => operation.value === form.operation_kind) || OPERATIONS[0];
  const selectedItem = items.find((item) => item.id === form.item);
  const isSupplierReceipt = form.operation_kind === "supplier_receipt";
  const canMoveQuantityReservation = ["warehouse_transfer", "lab_transfer", "lab_return"].includes(form.operation_kind);
  const allowBlockedContracts = form.operation_kind === "customer_return";
  const isSerialItem = selectedItem?.tracking_type === "serial";
  const isQuantityItem = selectedItem?.tracking_type === "quantity";
  const isSerialReceipt = isSupplierReceipt && selectedItem?.tracking_type === "serial";
  const needsSourceStock = selectedOperation.needsFrom;
  const serialNumbers = form.serial_numbers
    .split(/\r?\n|,/)
    .map((value) => value.trim())
    .filter(Boolean);

  const itemHasSourceStock = (itemId, locationId = form.source_location) => {
    const item = items.find((entry) => entry.id === itemId);
    if (!needsSourceStock || !locationId || !item) return true;

    if (item.tracking_type === "serial") {
      return equipmentUnits.some((unit) => (
        unit.item === itemId
        && unit.location === locationId
        && ["available", "reserved", "lab", "customer", "needs_check"].includes(unit.status)
      ));
    }

    const hasAvailableBalance = balances.some((balance) => (
      balance.item === itemId
      && balance.location === locationId
      && Number(balance.available_quantity || 0) > 0
    ));
    const hasActiveReservation = reservations.some((reservation) => (
      reservation.status === "active"
      && reservation.reservation_type === "quantity"
      && reservation.item === itemId
      && reservation.location === locationId
    ));

    return hasAvailableBalance || hasActiveReservation;
  };

  const sourceLocationHasItem = (locationId) => {
    if (!needsSourceStock || !form.item) return true;
    return itemHasSourceStock(form.item, locationId);
  };

  const sourceLocationOptions = useMemo(() => locations
    .filter((location) => sourceLocationHasItem(location.id))
    .map((location) => {
      const itemBalance = form.item
        ? balances.find((balance) => balance.item === form.item && balance.location === location.id)
        : null;
      const serialCount = form.item
        ? equipmentUnits.filter((unit) => (
          unit.item === form.item
          && unit.location === location.id
          && ["available", "reserved", "lab", "customer", "needs_check"].includes(unit.status)
        )).length
        : 0;

      return {
        value: location.id,
        label: location.name,
        meta: itemBalance
          ? `доступно ${itemBalance.available_quantity}, резерв ${itemBalance.reserved_quantity}, всего ${itemBalance.on_hand_quantity}`
          : serialCount
            ? `${serialCount} серийных ед.`
            : "",
        searchText: [location.name, location.code, location.kind].filter(Boolean).join(" "),
      };
    }), [locations, balances, equipmentUnits, reservations, form.item, needsSourceStock]);

  const destinationLocationOptions = useMemo(() => locations.map((location) => ({
    value: location.id,
    label: location.name,
    searchText: [location.name, location.code, location.kind].filter(Boolean).join(" "),
  })), [locations]);

  const itemOptions = useMemo(() => items
    .filter((item) => !needsSourceStock || !form.source_location || itemHasSourceStock(item.id, form.source_location))
    .map((item) => {
      const balance = form.source_location
        ? balances.find((entry) => entry.item === item.id && entry.location === form.source_location)
        : null;
      const serialCount = form.source_location
        ? equipmentUnits.filter((unit) => (
          unit.item === item.id
          && unit.location === form.source_location
          && ["available", "reserved", "lab", "customer", "needs_check"].includes(unit.status)
        )).length
        : 0;

      return {
        value: item.id,
        label: item.sku,
        meta: [
          item.name,
          item.equipment_model_name,
          balance ? `доступно ${balance.available_quantity}, резерв ${balance.reserved_quantity}` : "",
          serialCount ? `${serialCount} серийных ед.` : "",
        ].filter(Boolean).join(" / "),
        searchText: [item.sku, item.name, item.equipment_model_name, item.manufacturer].filter(Boolean).join(" "),
      };
    }), [items, balances, equipmentUnits, reservations, form.source_location, needsSourceStock]);

  const contractOptions = useMemo(() => contracts.map((contract) => ({
    value: contract.id,
    label: `${contract.customer_name} / ${contract.number}`,
    meta: CONTRACT_STATUS_LABELS[contract.status] || contract.status,
    disabled: !allowBlockedContracts && isContractBlocked(contract),
    searchText: [contract.customer_name, contract.number, contract.status].filter(Boolean).join(" "),
  })), [contracts, allowBlockedContracts]);

  const requestOptions = useMemo(() => requestLookupResults.map((request) => ({
    value: request.number,
    label: request.number,
    meta: [request.title, request.status].filter(Boolean).join(" / "),
    searchText: [request.number, request.title, request.status, request.object_name].filter(Boolean).join(" "),
  })), [requestLookupResults]);

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

  const reservationOptions = useMemo(() => quantityReservations.map((reservation) => ({
    value: reservation.id,
    label: reservation.customer_name || "Заказчик не указан",
    meta: `${reservation.contract_display || reservation.contract_number || "без договора"} / ${reservation.quantity} шт.`,
    searchText: [
      reservation.customer_name,
      reservation.contract_display,
      reservation.contract_number,
      reservation.quantity,
    ].filter(Boolean).join(" "),
  })), [quantityReservations]);

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

  useEffect(() => {
    setPage(1);
  }, [filters.search, filters.operation_kind]);

  const pagedTransactions = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredTransactions.slice(start, start + pageSize);
  }, [filteredTransactions, page, pageSize]);

  async function loadAll() {
    try {
      setError("");
      const [itemsResult, locationsResult, balancesResult, contractsResult, unitsResult, reservationsResult, transactionsResult] = await Promise.all([
        getCatalogItems(),
        getLocations(),
        getBalances(),
        getContracts(),
        getEquipmentUnits(),
        getReservations(),
        getTransactions(),
      ]);
      setItems(itemsResult);
      setLocations(locationsResult);
      setBalances(balancesResult);
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

  useEffect(() => {
    const handleClick = (event) => {
      if (!serialLookupRef.current?.contains(event.target)) {
        setSerialLookupOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    const query = form.related_request_number.trim();
    if (query.length < 2 || uuidPattern.test(query)) {
      setRequestLookupResults([]);
      setRequestLookupLoading(false);
      return undefined;
    }

    const timer = setTimeout(async () => {
      try {
        setRequestLookupLoading(true);
        const result = await getRequests({ search: query });
        setRequestLookupResults(result.slice(0, 8));
      } catch {
        setRequestLookupResults([]);
      } finally {
        setRequestLookupLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [form.related_request_number]);

  useEffect(() => {
    if (!needsSourceStock || !form.item || !form.source_location) return;
    if (itemHasSourceStock(form.item, form.source_location)) return;

    setForm((prev) => ({
      ...prev,
      item: "",
      equipment_units: [],
      reservation: "",
      serial_numbers: "",
    }));
    setSerialUnitSearch("");
  }, [balances, equipmentUnits, reservations, form.item, form.source_location, needsSourceStock]);

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

  const handleLookupChange = (name, value) => {
    setForm((prev) => ({
      ...prev,
      [name]: value,
      ...(name === "source_location" ? { reservation: "", equipment_units: [] } : {}),
    }));
    if (name === "source_location") setSerialUnitSearch("");
  };

  const selectItem = (itemId) => {
    setForm((prev) => ({ ...prev, item: itemId, equipment_units: [], reservation: "", serial_numbers: "" }));
    setSerialUnitSearch("");
  };

  const findActiveReservationForUnit = (unit) => reservations.find((reservation) => (
    reservation.status === "active"
    && (
      reservation.equipment_units?.includes(unit.id)
      || reservation.equipment_unit_serials?.includes(unit.serial_number)
    )
  ));

  const addSerialUnit = async (unit) => {
    setForm((prev) => ({
      ...prev,
      source_location: prev.source_location || unit.location || "",
      equipment_units: prev.equipment_units.includes(unit.id)
        ? prev.equipment_units
        : [...prev.equipment_units, unit.id],
    }));
    setSerialUnitSearch("");
    setSerialLookupOpen(false);

    const reservation = findActiveReservationForUnit(unit);
    if (!reservation?.request_id) return;

    try {
      const request = await getRequestById(reservation.request_id);
      setForm((prev) => ({
        ...prev,
        related_request_number: prev.related_request_number || request.number || "",
        customer_name: prev.customer_name || reservation.customer_name || "",
        contract: prev.contract || reservation.contract || "",
      }));
    } catch {
      // Автоподстановка не должна блокировать сам выбор серийного номера.
    }
  };

  const removeSerialUnit = (unitId) => {
    setForm((prev) => ({ ...prev, equipment_units: prev.equipment_units.filter((id) => id !== unitId) }));
  };

  const resolveRequest = async (requestNumber) => {
    const value = requestNumber.trim();
    if (!value) return null;
    if (uuidPattern.test(value)) return getRequestById(value);

    const foundRequests = await getRequests({ search: value });
    const exactMatch = foundRequests.find((item) => item.number?.toLowerCase() === value.toLowerCase());
    const selectedRequest = exactMatch || (foundRequests.length === 1 ? foundRequests[0] : null);

    if (!selectedRequest) {
      throw new Error("Заявка с таким номером не найдена. Проверь номер вида REQ-00001.");
    }

    return getRequestById(selectedRequest.id);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    try {
      setError("");
      let relatedRequest = null;
      const relatedRequestInput = form.related_request_number.trim();
      if (relatedRequestInput) {
        relatedRequest = await resolveRequest(relatedRequestInput);
        if (REQUEST_STATUSES_BLOCKING_MOVEMENT.includes(relatedRequest.status)) {
          setError("По этой заявке нельзя оформить движение: она не согласована, отклонена или отменена.");
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
      if (needsSourceStock && isQuantityItem && !form.reservation && form.source_location) {
        const sourceBalance = balances.find((balance) => balance.item === form.item && balance.location === form.source_location);
        const requestedQuantity = Number(form.quantity);
        if (!sourceBalance || Number(sourceBalance.available_quantity || 0) < requestedQuantity) {
          setError("На выбранной локации нет достаточного свободного остатка по этой позиции. Выбери другую локацию, позицию или активный резерв.");
          return;
        }
      }
      await createTransaction({
        operation_kind: form.operation_kind,
        source_location: form.source_location || null,
        destination_location: form.destination_location || null,
        related_request_id: relatedRequest?.id || null,
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
      setForm(INITIAL_FORM);
      await loadAll();
    } catch (err) {
      setError(err?.response?.data ? JSON.stringify(err.response.data) : err.message || "Не удалось оформить движение. Проверь остаток, серийники и обязательные поля.");
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
            {selectedOperation.needsFrom ? (
              <LookupSelect
                label="Откуда"
                value={form.source_location}
                options={sourceLocationOptions}
                onChange={(value) => handleLookupChange("source_location", value)}
                placeholder={form.item ? "Локации с этой позицией" : "Найти локацию"}
                emptyText={form.item ? "На локациях нет доступного остатка по выбранной позиции" : "Локации не найдены"}
                required
              />
            ) : null}
            {selectedOperation.needsTo ? (
              <LookupSelect
                label="Куда"
                value={form.destination_location}
                options={destinationLocationOptions}
                onChange={(value) => handleLookupChange("destination_location", value)}
                placeholder="Найти локацию"
                required
              />
            ) : null}
            <LookupSelect
              label="Позиция"
              value={form.item}
              options={itemOptions}
              onChange={(value, option) => selectItem(value, option)}
              placeholder={form.source_location ? "Позиции на выбранной локации" : "Начни вводить SKU, название или модель"}
              emptyText={form.source_location ? "На выбранной локации нет доступных позиций" : "Позиции не найдены"}
              required
              limit={10}
            />
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
              <LookupSelect
                label="Резерв"
                value={form.reservation}
                options={reservationOptions}
                onChange={(value) => handleLookupChange("reservation", value)}
                placeholder="Свободный остаток или поиск резерва"
                emptyText="Активные резервы не найдены"
              />
            ) : null}
            {!isSupplierReceipt && isSerialItem ? (
              <label className="lookup-field serial-lookup" ref={serialLookupRef}>
                Серийные номера
                <input
                  value={serialUnitSearch}
                  onFocus={() => setSerialLookupOpen(true)}
                  onChange={(event) => {
                    setSerialUnitSearch(event.target.value);
                    setSerialLookupOpen(true);
                  }}
                  placeholder="Найти серийник, статус, локацию или заказчика"
                />
                {serialLookupOpen ? (
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
            {selectedOperation.needsContract ? (
              <LookupSelect
                label="Договор"
                value={form.contract}
                options={contractOptions}
                onChange={(value) => handleLookupChange("contract", value)}
                placeholder="Найти договор или заказчика"
              />
            ) : null}
            {selectedOperation.needsResponsible ? <label>Ответственный<input name="responsible_person" value={form.responsible_person} onChange={handleChange} placeholder="Например: Иванов И.И." required /></label> : null}
            {selectedOperation.needsDue ? <label>Вернуть/использовать до<input name="due_date" type="date" value={form.due_date} onChange={handleChange} /></label> : null}
            <LookupSelect
              label="Номер заявки"
              value={form.related_request_number}
              displayValue={form.related_request_number}
              options={requestOptions}
              onChange={(value, option) => {
                setForm((prev) => ({ ...prev, related_request_number: option ? value : "" }));
              }}
              onQueryChange={(value) => {
                setForm((prev) => ({ ...prev, related_request_number: value }));
              }}
              placeholder={requestLookupLoading ? "Поиск заявки..." : "Необязательно, например REQ-00001"}
              emptyText={form.related_request_number.trim().length < 2 ? "Введите минимум 2 символа" : "Заявки не найдены"}
              limit={8}
            />
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
                {pagedTransactions.map((transaction) => (
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
          <Pagination
            total={filteredTransactions.length}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
          {!filteredTransactions.length ? <p>Движений не найдено.</p> : null}
        </div>
      </div>
    </Navbar>
  );
}
