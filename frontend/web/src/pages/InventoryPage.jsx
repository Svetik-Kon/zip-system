import { useEffect, useMemo, useState } from "react";
import {
  createBalance,
  createCatalogItem,
  createContract,
  createEquipmentUnit,
  createLocation,
  createReservation,
  getBalances,
  getCatalogItems,
  getContracts,
  getEquipmentUnits,
  getLocations,
  getReservations,
  releaseReservation,
} from "../api/inventory";
import Navbar from "../components/Navbar";
import { getMe } from "../utils/auth";

const UNIT_STATUSES = {
  available: "Свободно",
  reserved: "Зарезервировано",
  issued: "Выдано",
  customer: "У заказчика",
  lab: "В лаборатории",
  written_off: "Списано",
  needs_check: "Требует проверки",
};

const TRACKING_LABELS = {
  serial: "Серийный учет",
  quantity: "Количественный учет",
};

const CSV_ALIASES = {
  sku: ["sku", "артикул"],
  name: ["name", "наименование", "название"],
  manufacturer: ["manufacturer", "производитель"],
  unit: ["unit", "единица", "ед. изм.", "ед_изм"],
  item_type: ["item_type", "тип"],
  tracking_type: ["tracking_type", "тип_учета"],
  model_name: ["model_name", "модель"],
  description: ["description", "описание"],
  location: ["location", "локация", "склад"],
  location_type: ["location_type", "тип_локации"],
  address: ["address", "адрес"],
  on_hand_quantity: ["on_hand_quantity", "в_наличии", "остаток"],
  reserved_quantity: ["reserved_quantity", "резерв"],
  customer_name: ["customer_name", "заказчик", "клиент"],
  reserved_until: ["reserved_until", "зарезервировано_до", "до_даты"],
  contract_number: ["contract_number", "договор", "номер_договора"],
};

const getInventoryFileUrl = (value) => {
  if (!value) return "";
  if (String(value).startsWith("http")) return value;
  if (String(value).startsWith("/")) return `http://localhost:8003${value}`;
  return `http://localhost:8003/${value}`;
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

function toCount(value, fallback = 0) {
  const number = Number(String(value || "").replace(",", "."));
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : fallback;
}

function appendIfValue(formData, name, value) {
  if (value !== null && value !== undefined && value !== "") {
    formData.append(name, value);
  }
}

function matchesText(values, text) {
  return !text || values.some((value) => String(value || "").toLowerCase().includes(text));
}

function splitSerials(value) {
  return value
    .split(/[\n,;]+/)
    .map((serial) => serial.trim())
    .filter(Boolean);
}

export default function InventoryPage() {
  const me = getMe();
  const [items, setItems] = useState([]);
  const [locations, setLocations] = useState([]);
  const [balances, setBalances] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [equipmentUnits, setEquipmentUnits] = useState([]);
  const [filters, setFilters] = useState({ search: "", location: "", available: "" });
  const [activeModal, setActiveModal] = useState("");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [selectedUnitId, setSelectedUnitId] = useState("");
  const [locationForm, setLocationForm] = useState({ name: "", location_type: "warehouse", address: "" });
  const [contractForm, setContractForm] = useState({ customer_name: "", number: "", starts_at: "", ends_at: "", status: "active", file: null, comment: "" });
  const [receiptForm, setReceiptForm] = useState({ item: "", location: "", quantity: 1, serial_numbers: "", notes: "" });
  const [reserveForm, setReserveForm] = useState({
    reservation_type: "quantity",
    item: "",
    location: "",
    quantity: 1,
    equipment_units: [],
    request_id: "",
    customer_name: "",
    reserved_until: "",
    contract: "",
    contract_number: "",
    contract_file: null,
    comment: "",
  });
  const [releaseQuantities, setReleaseQuantities] = useState({});
  const [importFile, setImportFile] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAll();
  }, []);

  const searchText = filters.search.toLowerCase();

  const itemRows = useMemo(() => items.map((item) => {
    const itemBalances = balances.filter((balance) => balance.item === item.id);
    const itemUnits = equipmentUnits.filter((unit) => unit.item === item.id);
    const itemReservations = reservations.filter((reservation) => reservation.item === item.id && reservation.status === "active");
    const onHand = itemBalances.reduce((sum, balance) => sum + Number(balance.on_hand_quantity || 0), 0);
    const reserved = itemBalances.reduce((sum, balance) => sum + Number(balance.reserved_quantity || 0), 0);
    const available = itemBalances.reduce((sum, balance) => sum + Number(balance.available_quantity || 0), 0);
    const locationsText = itemBalances.map((balance) => balance.location_name).filter(Boolean).join(", ");
    const serialsText = itemUnits.map((unit) => unit.serial_number).join(" ");

    return {
      ...item,
      balances: itemBalances,
      units: itemUnits,
      reservations: itemReservations,
      onHand,
      reserved,
      available,
      locationsText,
      serialsText,
    };
  }), [items, balances, equipmentUnits, reservations]);

  const filteredItems = useMemo(() => itemRows.filter((item) => {
    const matchesSearch = matchesText([
      item.sku,
      item.name,
      item.manufacturer,
      item.equipment_model_name,
      item.locationsText,
      item.serialsText,
      item.reservations.map((reservation) => `${reservation.customer_name} ${reservation.contract_display || reservation.contract_number}`).join(" "),
    ], searchText);
    const matchesLocation = !filters.location || item.balances.some((balance) => balance.location === filters.location);
    const matchesAvailable = filters.available !== "true" || item.available > 0;
    return matchesSearch && matchesLocation && matchesAvailable;
  }), [itemRows, filters, searchText]);

  const selectedItem = useMemo(() => {
    if (!filteredItems.length) return null;
    return filteredItems.find((item) => item.id === selectedItemId) || filteredItems[0];
  }, [filteredItems, selectedItemId]);

  const selectedUnit = useMemo(() => {
    if (!selectedItem?.units.length) return null;
    return selectedItem.units.find((unit) => unit.id === selectedUnitId) || selectedItem.units[0];
  }, [selectedItem, selectedUnitId]);

  const selectedUnitReservations = useMemo(() => {
    if (!selectedUnit) return [];
    return reservations.filter((reservation) => (
      reservation.status === "active"
      && (
        reservation.equipment_units?.includes(selectedUnit.id)
        || reservation.equipment_unit_serials?.includes(selectedUnit.serial_number)
      )
    ));
  }, [reservations, selectedUnit]);

  const availableUnits = useMemo(() => equipmentUnits.filter((unit) => (
    unit.status === "available"
    && (!reserveForm.item || unit.item === reserveForm.item)
    && (!reserveForm.location || unit.location === reserveForm.location)
  )), [equipmentUnits, reserveForm.item, reserveForm.location]);

  const summary = useMemo(() => ({
    positions: items.length,
    onHand: itemRows.reduce((sum, item) => sum + item.onHand, 0),
    available: itemRows.reduce((sum, item) => sum + item.available, 0),
    units: equipmentUnits.length,
    activeReservations: reservations.filter((reservation) => reservation.status === "active").length,
  }), [items, itemRows, equipmentUnits, reservations]);

  const loadAll = async () => {
    try {
      setLoading(true);
      setError("");
      const [itemsResult, locationsResult, balancesResult, reservationsResult, contractsResult, unitsResult] = await Promise.all([
        getCatalogItems(),
        getLocations(),
        getBalances(),
        getReservations(),
        getContracts(),
        getEquipmentUnits(),
      ]);
      setItems(itemsResult);
      setLocations(locationsResult);
      setBalances(balancesResult);
      setReservations(reservationsResult);
      setContracts(contractsResult);
      setEquipmentUnits(unitsResult);
    } catch (err) {
      setError(err?.response?.data ? JSON.stringify(err.response.data) : "Не удалось загрузить склад.");
    } finally {
      setLoading(false);
    }
  };

  const closeModal = () => setActiveModal("");

  const currentBalance = (itemId, locationId) => balances.find((balance) => balance.item === itemId && balance.location === locationId);

  const handleLocationSubmit = async (event) => {
    event.preventDefault();
    await createLocation({ ...locationForm, organization_id: me?.organization_id || null });
    setLocationForm({ name: "", location_type: "warehouse", address: "" });
    closeModal();
    await loadAll();
  };

  const handleContractSubmit = async (event) => {
    event.preventDefault();
    const formData = new FormData();
    formData.append("customer_name", contractForm.customer_name);
    formData.append("number", contractForm.number);
    formData.append("status", contractForm.status);
    appendIfValue(formData, "organization_id", me?.organization_id || "");
    appendIfValue(formData, "starts_at", contractForm.starts_at);
    appendIfValue(formData, "ends_at", contractForm.ends_at);
    appendIfValue(formData, "file", contractForm.file);
    appendIfValue(formData, "comment", contractForm.comment);
    await createContract(formData);
    setContractForm({ customer_name: "", number: "", starts_at: "", ends_at: "", status: "active", file: null, comment: "" });
    event.target.reset();
    closeModal();
    await loadAll();
  };

  const handleReceiptSubmit = async (event) => {
    event.preventDefault();
    const item = items.find((entry) => entry.id === receiptForm.item);
    if (!item) return;

    if (item.tracking_type === "serial") {
      const serials = splitSerials(receiptForm.serial_numbers);
      if (!serials.length) {
        setError("Для серийной позиции укажи хотя бы один серийный номер.");
        return;
      }

      for (const serial of serials) {
        await createEquipmentUnit({
          item: receiptForm.item,
          location: receiptForm.location,
          serial_number: serial,
          inventory_number: "",
          notes: receiptForm.notes,
        });
      }
    } else {
      const existing = currentBalance(receiptForm.item, receiptForm.location);
      await createBalance({
        item: receiptForm.item,
        location: receiptForm.location,
        on_hand_quantity: Number(existing?.on_hand_quantity || 0) + Number(receiptForm.quantity || 0),
        reserved_quantity: Number(existing?.reserved_quantity || 0),
      });
    }

    setReceiptForm({ item: "", location: "", quantity: 1, serial_numbers: "", notes: "" });
    closeModal();
    await loadAll();
  };

  const buildReservationPayload = (data) => {
    const formData = new FormData();
    formData.append("reservation_type", data.reservation_type);
    formData.append("item", data.item);
    formData.append("location", data.location);
    if (data.reservation_type === "serial") {
      data.equipment_units.forEach((unitId) => formData.append("equipment_units", unitId));
      formData.append("quantity", data.equipment_units.length || 1);
    } else {
      formData.append("quantity", Number(data.quantity));
    }
    appendIfValue(formData, "request_id", data.request_id);
    appendIfValue(formData, "customer_name", data.customer_name);
    appendIfValue(formData, "reserved_until", data.reserved_until);
    appendIfValue(formData, "contract", data.contract);
    appendIfValue(formData, "contract_number", data.contract_number);
    appendIfValue(formData, "contract_file", data.contract_file);
    appendIfValue(formData, "comment", data.comment);
    return formData;
  };

  const handleReserveSubmit = async (event) => {
    event.preventDefault();
    await createReservation(buildReservationPayload(reserveForm));
    setReserveForm({
      reservation_type: "quantity",
      item: "",
      location: "",
      quantity: 1,
      equipment_units: [],
      request_id: "",
      customer_name: "",
      reserved_until: "",
      contract: "",
      contract_number: "",
      contract_file: null,
      comment: "",
    });
    event.target.reset();
    closeModal();
    await loadAll();
  };

  const handleReleaseReservation = async (reservation, status = "released", quantity = null) => {
    const actionText = quantity
      ? `уменьшить резерв на ${quantity} шт.`
      : status === "expired" ? "отметить резерв как истекший" : "снять резерв полностью";
    if (!window.confirm(`Точно ${actionText}?`)) return;

    await releaseReservation(reservation.id, {
      status,
      quantity,
      comment: quantity
        ? `Частично снят резерв: ${quantity} шт.`
        : status === "expired" ? "Резерв снят из-за окончания срока/договора." : "Резерв снят вручную.",
    });
    setReleaseQuantities((prev) => ({ ...prev, [reservation.id]: "" }));
    setMessage(quantity ? "Резерв уменьшен, доступность пересчитана." : "Резерв снят, доступность пересчитана.");
    await loadAll();
  };

  const openReceiptForItem = (item = selectedItem) => {
    setReceiptForm({ item: item?.id || "", location: "", quantity: 1, serial_numbers: "", notes: "" });
    setActiveModal("receipt");
  };

  const openReserveForItem = (item = selectedItem) => {
    const firstBalance = item?.balances?.find((balance) => balance.available_quantity > 0) || item?.balances?.[0];
    setReserveForm({
      reservation_type: item?.tracking_type === "serial" ? "serial" : "quantity",
      item: item?.id || "",
      location: firstBalance?.location || "",
      quantity: 1,
      equipment_units: [],
      request_id: "",
      customer_name: "",
      reserved_until: "",
      contract: "",
      contract_number: "",
      contract_file: null,
      comment: "",
    });
    setActiveModal("reserve");
  };

  const openReserveForUnit = (unit) => {
    setReserveForm({
      reservation_type: "serial",
      item: unit.item,
      location: unit.location || "",
      quantity: 1,
      equipment_units: [unit.id],
      request_id: "",
      customer_name: "",
      reserved_until: "",
      contract: "",
      contract_number: "",
      contract_file: null,
      comment: "",
    });
    setActiveModal("reserve");
  };

  const handleImportSubmit = async (event) => {
    event.preventDefault();
    if (!importFile) {
      setError("Выбери CSV-файл для импорта.");
      return;
    }

    try {
      setError("");
      setMessage("Импорт выполняется...");
      const rows = parseCsv(await importFile.text());
      if (!rows.length) {
        setError("В CSV нет строк для загрузки.");
        setMessage("");
        return;
      }

      const itemMap = new Map((await getCatalogItems()).map((item) => [item.sku.toLowerCase(), item]));
      const locationMap = new Map((await getLocations()).map((location) => [location.name.toLowerCase(), location]));

      for (const row of rows) {
        const sku = field(row, "sku");
        const name = field(row, "name");
        const locationName = field(row, "location");

        if (!sku || !name || !locationName) {
          throw new Error("Для каждой строки нужны sku, name и location.");
        }

        let item = itemMap.get(sku.toLowerCase());
        if (!item) {
          const itemType = field(row, "item_type") || "spare_part";
          item = await createCatalogItem({
            sku,
            name,
            manufacturer: field(row, "manufacturer"),
            unit: field(row, "unit") || "шт.",
            item_type: itemType,
            tracking_type: field(row, "tracking_type") || (itemType === "equipment" ? "serial" : "quantity"),
            model_name: field(row, "model_name"),
            description: field(row, "description"),
          });
          itemMap.set(item.sku.toLowerCase(), item);
        }

        let location = locationMap.get(locationName.toLowerCase());
        if (!location) {
          location = await createLocation({
            organization_id: me?.organization_id || null,
            name: locationName,
            location_type: field(row, "location_type") || "warehouse",
            address: field(row, "address"),
          });
          locationMap.set(location.name.toLowerCase(), location);
        }

        await createBalance({
          item: item.id,
          location: location.id,
          on_hand_quantity: toCount(field(row, "on_hand_quantity")),
        });

        const reservedQuantity = toCount(field(row, "reserved_quantity"));
        if (reservedQuantity > 0) {
          await createReservation(buildReservationPayload({
            reservation_type: "quantity",
            item: item.id,
            location: location.id,
            quantity: reservedQuantity,
            equipment_units: [],
            customer_name: field(row, "customer_name"),
            reserved_until: field(row, "reserved_until"),
            contract_number: field(row, "contract_number"),
            comment: "Создано при импорте остатков.",
          }));
        }
      }

      setImportFile(null);
      setMessage(`Импортировано строк: ${rows.length}.`);
      closeModal();
      await loadAll();
    } catch (err) {
      setMessage("");
      setError(err?.response?.data ? JSON.stringify(err.response.data) : err.message || "Не удалось импортировать CSV.");
    }
  };

  const itemOptions = items.map((item) => <option key={item.id} value={item.id}>{item.sku} - {item.name}</option>);
  const locationOptions = locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>);
  const contractOptions = contracts.map((contract) => <option key={contract.id} value={contract.id}>{contract.customer_name} / {contract.number}</option>);
  const receiptItem = items.find((item) => item.id === receiptForm.item);

  const renderModal = () => {
    if (!activeModal) return null;
    const titles = {
      location: "Новая локация",
      contract: "Новый договор",
      receipt: "Приход на склад",
      reserve: "Создать резерв",
      import: "Импорт CSV",
    };

    return (
      <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeModal()}>
        <div className="modal-panel" role="dialog" aria-modal="true" aria-label={titles[activeModal]}>
          <div className="modal-header">
            <h2>{titles[activeModal]}</h2>
            <button className="ghost-button" type="button" onClick={closeModal}>Закрыть</button>
          </div>

          {activeModal === "location" ? (
            <form className="form" onSubmit={handleLocationSubmit}>
              <input placeholder="Название" value={locationForm.name} onChange={(event) => setLocationForm((prev) => ({ ...prev, name: event.target.value }))} required />
              <select value={locationForm.location_type} onChange={(event) => setLocationForm((prev) => ({ ...prev, location_type: event.target.value }))}>
                <option value="warehouse">Склад</option>
                <option value="site">Площадка</option>
                <option value="lab">Лаборатория</option>
                <option value="transit">Транзит</option>
                <option value="vehicle">Автомобиль</option>
              </select>
              <input placeholder="Адрес" value={locationForm.address} onChange={(event) => setLocationForm((prev) => ({ ...prev, address: event.target.value }))} />
              <button type="submit">Добавить</button>
            </form>
          ) : null}

          {activeModal === "contract" ? (
            <form className="form" onSubmit={handleContractSubmit}>
              <input placeholder="Заказчик" value={contractForm.customer_name} onChange={(event) => setContractForm((prev) => ({ ...prev, customer_name: event.target.value }))} required />
              <input placeholder="Номер договора" value={contractForm.number} onChange={(event) => setContractForm((prev) => ({ ...prev, number: event.target.value }))} required />
              <label>Начало<input type="date" value={contractForm.starts_at} onChange={(event) => setContractForm((prev) => ({ ...prev, starts_at: event.target.value }))} /></label>
              <label>Окончание<input type="date" value={contractForm.ends_at} onChange={(event) => setContractForm((prev) => ({ ...prev, ends_at: event.target.value }))} /></label>
              <select value={contractForm.status} onChange={(event) => setContractForm((prev) => ({ ...prev, status: event.target.value }))}>
                <option value="active">Активен</option>
                <option value="expiring">Истекает</option>
                <option value="expired">Истек</option>
                <option value="closed">Закрыт</option>
              </select>
              <label>Файл договора<input type="file" onChange={(event) => setContractForm((prev) => ({ ...prev, file: event.target.files?.[0] || null }))} /></label>
              <textarea placeholder="Комментарий" value={contractForm.comment} onChange={(event) => setContractForm((prev) => ({ ...prev, comment: event.target.value }))} />
              <button type="submit">Сохранить договор</button>
            </form>
          ) : null}

          {activeModal === "receipt" ? (
            <form className="form" onSubmit={handleReceiptSubmit}>
              <select value={receiptForm.item} onChange={(event) => setReceiptForm((prev) => ({ ...prev, item: event.target.value, serial_numbers: "" }))} required><option value="">Позиция</option>{itemOptions}</select>
              <select value={receiptForm.location} onChange={(event) => setReceiptForm((prev) => ({ ...prev, location: event.target.value }))} required><option value="">Локация</option>{locationOptions}</select>
              {receiptItem?.tracking_type === "serial" ? (
                <label>
                  Серийные номера
                  <textarea placeholder="Каждый серийный номер с новой строки" value={receiptForm.serial_numbers} onChange={(event) => setReceiptForm((prev) => ({ ...prev, serial_numbers: event.target.value }))} required />
                </label>
              ) : (
                <label>Количество<input type="number" min="1" value={receiptForm.quantity} onChange={(event) => setReceiptForm((prev) => ({ ...prev, quantity: event.target.value }))} /></label>
              )}
              <textarea placeholder="Примечание к приходу" value={receiptForm.notes} onChange={(event) => setReceiptForm((prev) => ({ ...prev, notes: event.target.value }))} />
              <button type="submit">Принять на склад</button>
            </form>
          ) : null}

          {activeModal === "reserve" ? (
            <form className="form" onSubmit={handleReserveSubmit}>
              <select value={reserveForm.reservation_type} onChange={(event) => setReserveForm((prev) => ({ ...prev, reservation_type: event.target.value, equipment_units: [] }))}>
                <option value="quantity">По количеству</option>
                <option value="serial">По серийным номерам</option>
              </select>
              <select value={reserveForm.item} onChange={(event) => setReserveForm((prev) => ({ ...prev, item: event.target.value, equipment_units: [] }))} required><option value="">Позиция</option>{itemOptions}</select>
              <select value={reserveForm.location} onChange={(event) => setReserveForm((prev) => ({ ...prev, location: event.target.value, equipment_units: [] }))} required><option value="">Локация</option>{locationOptions}</select>
              {reserveForm.reservation_type === "serial" ? (
                <label>
                  Серийные номера
                  <select multiple value={reserveForm.equipment_units} onChange={(event) => setReserveForm((prev) => ({ ...prev, equipment_units: Array.from(event.target.selectedOptions, (option) => option.value) }))} required>
                    {availableUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.serial_number} {unit.inventory_number ? `/${unit.inventory_number}` : ""}</option>)}
                  </select>
                </label>
              ) : (
                <label>Количество<input type="number" min="1" value={reserveForm.quantity} onChange={(event) => setReserveForm((prev) => ({ ...prev, quantity: event.target.value }))} /></label>
              )}
              <select value={reserveForm.contract} onChange={(event) => setReserveForm((prev) => ({ ...prev, contract: event.target.value }))}><option value="">Договор</option>{contractOptions}</select>
              <input placeholder="Заказчик" value={reserveForm.customer_name} onChange={(event) => setReserveForm((prev) => ({ ...prev, customer_name: event.target.value }))} />
              <label>Зарезервировано до<input type="date" value={reserveForm.reserved_until} onChange={(event) => setReserveForm((prev) => ({ ...prev, reserved_until: event.target.value }))} /></label>
              <input placeholder="Номер договора, если нет в справочнике" value={reserveForm.contract_number} onChange={(event) => setReserveForm((prev) => ({ ...prev, contract_number: event.target.value }))} />
              <input placeholder="UUID заявки" value={reserveForm.request_id} onChange={(event) => setReserveForm((prev) => ({ ...prev, request_id: event.target.value }))} />
              <textarea placeholder="Комментарий" value={reserveForm.comment} onChange={(event) => setReserveForm((prev) => ({ ...prev, comment: event.target.value }))} />
              <button type="submit">Зарезервировать</button>
            </form>
          ) : null}

          {activeModal === "import" ? (
            <form className="form" onSubmit={handleImportSubmit}>
              <input type="file" accept=".csv,text/csv" onChange={(event) => setImportFile(event.target.files?.[0] || null)} />
              <a className="button-link secondary" href="/sample-inventory.csv" download>Скачать шаблон CSV</a>
              <button type="submit">Загрузить</button>
            </form>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <Navbar>
      <div className="page">
        <div className="page-header">
          <h1>Склад</h1>
          <div className="compact-actions">
            <button type="button" onClick={() => openReceiptForItem()}>Приход</button>
            <button type="button" onClick={() => openReserveForItem()}>Резерв</button>
            <button type="button" onClick={() => setActiveModal("location")}>Локация</button>
            <button type="button" onClick={() => setActiveModal("contract")}>Договор</button>
            <button type="button" className="ghost-button" onClick={() => setActiveModal("import")}>CSV</button>
          </div>
        </div>

        {error ? <div className="error">{error}</div> : null}
        {message ? <div className="success">{message}</div> : null}
        {loading ? <p>Загрузка...</p> : null}

        <div className="card inventory-search">
          <input
            placeholder="Найти позицию, SKU, модель, серийник, заказчика, договор или локацию"
            value={filters.search}
            onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
          />
          <select value={filters.location} onChange={(event) => setFilters((prev) => ({ ...prev, location: event.target.value }))}><option value="">Все локации</option>{locationOptions}</select>
          <select value={filters.available} onChange={(event) => setFilters((prev) => ({ ...prev, available: event.target.value }))}><option value="">Все остатки</option><option value="true">Только доступные</option></select>
        </div>

        <div className="metric-grid inventory-summary">
          <div className="metric-card"><span>Позиции</span><strong>{summary.positions}</strong></div>
          <div className="metric-card"><span>Всего на складе</span><strong>{summary.onHand}</strong></div>
          <div className="metric-card"><span>Доступно</span><strong>{summary.available}</strong></div>
          <div className="metric-card"><span>Серийных карточек</span><strong>{summary.units}</strong></div>
          <div className="metric-card"><span>Активных резервов</span><strong>{summary.activeReservations}</strong></div>
        </div>

        <div className="inventory-workspace">
          <section className="card equipment-register">
            <h2>Номенклатура и доступность</h2>
            <div className="item-register-head">
              <span title="Артикул позиции в каталоге ЗИП.">SKU</span>
              <span title="Название позиции из каталога.">Позиция</span>
              <span title="Серийный учет: каждая единица ведется по серийному номеру. Количественный учет: учитывается только количество.">Тип учета</span>
              <span title="Физически находится на складах и локациях.">Всего</span>
              <span title="Закреплено за заявками, заказчиками или договорами и недоступно для выдачи другим.">Резерв</span>
              <span title="Можно использовать сейчас: всего минус резерв.">Доступно</span>
            </div>
            <div className="item-register-list">
              {filteredItems.map((item) => (
                <button
                  className={`item-register-row ${selectedItem?.id === item.id ? "active" : ""}`}
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setSelectedItemId(item.id);
                    setSelectedUnitId("");
                  }}
                >
                  <span className="row-serial">{item.sku}</span>
                  <span>{item.name}</span>
                  <span>{TRACKING_LABELS[item.tracking_type] || item.tracking_type}</span>
                  <span>{item.onHand}</span>
                  <span>{item.reserved}</span>
                  <span>{item.available}</span>
                </button>
              ))}
            </div>
            {!filteredItems.length ? <p>Позиции не найдены.</p> : null}
          </section>

          <aside className="card equipment-detail">
            {selectedItem ? (
              <>
                <div className="equipment-card-head">
                  <div>
                    <strong>{selectedItem.sku}</strong>
                    <span>{TRACKING_LABELS[selectedItem.tracking_type] || selectedItem.tracking_type}</span>
                  </div>
                  <mark className="status-badge">{selectedItem.available} доступно</mark>
                </div>
                <div className="equipment-title">{selectedItem.name}</div>
                <dl className="equipment-details">
                  <div><dt>Производитель</dt><dd>{selectedItem.manufacturer || "-"}</dd></div>
                  <div><dt>Модель</dt><dd>{selectedItem.equipment_model_name || "-"}</dd></div>
                  <div><dt>Всего</dt><dd>{selectedItem.onHand}</dd></div>
                  <div><dt>Резерв</dt><dd>{selectedItem.reserved}</dd></div>
                </dl>
                <div className="detail-actions">
                  <button type="button" onClick={() => openReceiptForItem(selectedItem)}>Принять</button>
                  <button type="button" className="ghost-button" onClick={() => openReserveForItem(selectedItem)}>Зарезервировать</button>
                </div>

                <div className="detail-section">
                  <h3>Локации</h3>
                  {selectedItem.balances.map((balance) => (
                    <div className="mini-row" key={balance.id}>
                      <span>{balance.location_name}</span>
                      <span>{balance.on_hand_quantity} / резерв {balance.reserved_quantity} / доступно {balance.available_quantity}</span>
                    </div>
                  ))}
                  {!selectedItem.balances.length ? <p className="field-note">Остатков по локациям нет.</p> : null}
                </div>

                {selectedItem.tracking_type === "serial" ? (
                  <div className="detail-section">
                    <h3>Серийные номера</h3>
                    <div className="serial-list">
                      {selectedItem.units.map((unit) => (
                        <button
                          className={`serial-row ${selectedUnit?.id === unit.id ? "active" : ""}`}
                          key={unit.id}
                          type="button"
                          onClick={() => setSelectedUnitId(unit.id)}
                        >
                          <span>{unit.serial_number}</span>
                          <mark className={`status-badge status-${unit.status}`}>{UNIT_STATUSES[unit.status] || unit.status}</mark>
                        </button>
                      ))}
                    </div>
                    {!selectedItem.units.length ? <p className="field-note">Серийные карточки еще не заведены.</p> : null}
                  </div>
                ) : null}

                {selectedUnit ? (
                  <div className="detail-section selected-unit-card">
                    <h3>{selectedUnit.serial_number}</h3>
                    <dl className="equipment-details">
                      <div><dt>Локация</dt><dd>{selectedUnit.location_name || "-"}</dd></div>
                      <div><dt>Статус</dt><dd>{UNIT_STATUSES[selectedUnit.status] || selectedUnit.status}</dd></div>
                      <div><dt>Заказчик</dt><dd>{selectedUnit.customer_name || "-"}</dd></div>
                      <div><dt>Договор</dt><dd>{selectedUnit.contract_number || "-"}</dd></div>
                      <div><dt>До</dt><dd>{selectedUnit.reserved_until || "-"}</dd></div>
                      <div><dt>Ответственный</dt><dd>{selectedUnit.responsible_person || "-"}</dd></div>
                    </dl>
                    <div className="detail-actions">
                      {selectedUnit.status === "available" ? <button type="button" onClick={() => openReserveForUnit(selectedUnit)}>Зарезервировать этот серийник</button> : null}
                      {selectedUnitReservations.map((reservation) => (
                        <button key={reservation.id} type="button" className="ghost-button" onClick={() => handleReleaseReservation(reservation)}>
                          Снять резерв
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="detail-section">
                  <h3>Активные резервы</h3>
                  {selectedItem.reservations.map((reservation) => (
                    <div className="reservation-detail-row" key={reservation.id}>
                      <div className="reservation-main">
                        <strong>{reservation.customer_name || "Заказчик не указан"}</strong>
                        <small>{reservation.contract_display || reservation.contract_number || "Договор не указан"}</small>
                        <span className="reservation-meta">
                          {reservation.equipment_unit_serials?.join(", ") || `${reservation.quantity} шт.`}
                          <br />
                          до {reservation.reserved_until || "-"}
                        </span>
                      </div>
                      <div className="reservation-controls">
                        {reservation.reservation_type === "quantity" ? (
                          <div className="reservation-reduce">
                            <input
                              min="1"
                              max={reservation.quantity}
                              placeholder="Снять шт."
                              type="number"
                              value={releaseQuantities[reservation.id] || ""}
                              onChange={(event) => setReleaseQuantities((prev) => ({ ...prev, [reservation.id]: event.target.value }))}
                            />
                            <button
                              className="ghost-button"
                              disabled={!releaseQuantities[reservation.id]}
                              type="button"
                              onClick={() => handleReleaseReservation(reservation, "released", Number(releaseQuantities[reservation.id]))}
                            >
                              Уменьшить
                            </button>
                          </div>
                        ) : null}
                        <div className="reservation-actions">
                          <button type="button" onClick={() => handleReleaseReservation(reservation)}>Снять все</button>
                          <button type="button" className="ghost-button" onClick={() => handleReleaseReservation(reservation, "expired")}>Истек</button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {!selectedItem.reservations.length ? <p className="field-note">Активных резервов по позиции нет.</p> : null}
                </div>
              </>
            ) : (
              <p>Выбери позицию из реестра.</p>
            )}
          </aside>
        </div>

        {renderModal()}
      </div>
    </Navbar>
  );
}
