import { useEffect, useMemo, useState } from "react";
import {
  createLocation,
  createReservation,
  getBalances,
  getCatalogItems,
  getContracts,
  getEquipmentUnits,
  getLocations,
  getReservations,
  increaseReservation,
  releaseReservation,
  updateEquipmentUnit,
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

const cleanReservationComment = (value = "") => String(value)
  .split(/\r?\n/)
  .filter((line) => (
    !line.trim().startsWith("Частично снят резерв:")
    && !line.trim().startsWith("Partially released quantity:")
  ))
  .join("\n")
  .trim();

const inventoryFileUrl = (value) => {
  if (!value) return "";
  if (String(value).startsWith("http")) return value;
  if (String(value).startsWith("/")) return `http://localhost:8003${value}`;
  return `http://localhost:8003/${value}`;
};

function appendIfValue(formData, name, value) {
  if (value !== null && value !== undefined && value !== "") {
    formData.append(name, value);
  }
}

function matchesText(values, text) {
  return !text || values.some((value) => String(value || "").toLowerCase().includes(text));
}

export default function InventoryPage() {
  const me = getMe();
  const canEditInventory = ["admin", "warehouse"].includes(me?.role);
  const [items, setItems] = useState([]);
  const [locations, setLocations] = useState([]);
  const [balances, setBalances] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [equipmentUnits, setEquipmentUnits] = useState([]);
  const [filters, setFilters] = useState({ search: "", location: "", available: "" });
  const [activeModal, setActiveModal] = useState("");
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState("");
  const [selectedUnitId, setSelectedUnitId] = useState("");
  const [serialSearch, setSerialSearch] = useState("");
  const [reservationSearch, setReservationSearch] = useState("");
  const [locationForm, setLocationForm] = useState({ name: "", location_type: "warehouse", address: "" });
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
    is_hard: false,
    comment: "",
  });
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

  const getReservationAvailableQuantity = (reservation) => {
    const balance = selectedItem?.balances.find((entry) => entry.location === reservation.location);
    return Number(balance?.available_quantity || 0);
  };

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

  const filteredSelectedUnits = useMemo(() => {
    if (!selectedItem) return [];
    const text = serialSearch.trim().toLowerCase();
    if (!text) return selectedItem.units;
    return selectedItem.units.filter((unit) => [
      unit.serial_number,
      unit.inventory_number,
      unit.location_name,
      unit.customer_name,
      unit.contract_number,
      unit.responsible_person,
      UNIT_STATUSES[unit.status],
    ].some((value) => String(value || "").toLowerCase().includes(text)));
  }, [selectedItem, serialSearch]);

  const filteredSelectedReservations = useMemo(() => {
    if (!selectedItem) return [];
    const text = reservationSearch.trim().toLowerCase();
    if (!text) return selectedItem.reservations;
    return selectedItem.reservations.filter((reservation) => [
      reservation.customer_name,
      reservation.contract_display,
      reservation.contract_number,
      reservation.location_name,
      reservation.reserved_until,
      reservation.comment,
      reservation.equipment_unit_serials?.join(" "),
      reservation.quantity,
    ].some((value) => String(value || "").toLowerCase().includes(text)));
  }, [selectedItem, reservationSearch]);

  const unitHardReserved = (unit) => selectedItem?.reservations.some((reservation) => (
    reservation.is_hard
    && (
      reservation.equipment_units?.includes(unit.id)
      || reservation.equipment_unit_serials?.includes(unit.serial_number)
    )
  ));

  const contractsById = useMemo(() => new Map(contracts.map((contract) => [contract.id, contract])), [contracts]);
  const contractFileLink = (contractId) => inventoryFileUrl(contractsById.get(contractId)?.file);
  const reservationHasBlockedContract = (reservation) => {
    const contract = contractsById.get(reservation.contract);
    return isContractBlocked(contract) || ["expired", "closed"].includes(reservation.contract_status) || (
      reservation.contract_ends_at && reservation.contract_ends_at < todayIso()
    );
  };

  const handleContractSelect = (contractId) => {
    const contract = contractsById.get(contractId);
    setReserveForm((prev) => ({
      ...prev,
      contract: contractId,
      customer_name: contract?.customer_name || prev.customer_name,
      contract_number: contract ? "" : prev.contract_number,
    }));
  };

  const availableUnits = useMemo(() => equipmentUnits.filter((unit) => (
    ["available", "needs_check"].includes(unit.status)
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

  const handleLocationSubmit = async (event) => {
    event.preventDefault();
    await createLocation({ ...locationForm, organization_id: me?.organization || null });
    setLocationForm({ name: "", location_type: "warehouse", address: "" });
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
    formData.append("is_hard", data.is_hard ? "true" : "false");
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
      is_hard: false,
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
        ? ""
        : status === "expired" ? "Резерв снят из-за окончания срока/договора." : "Резерв снят вручную.",
    });
    setMessage(quantity ? "Резерв уменьшен, доступность пересчитана." : "Резерв снят, доступность пересчитана.");
    await loadAll();
  };

  const handleIncreaseReservation = async (reservation, quantity, confirm = true) => {
    if (!quantity) return;
    const available = getReservationAvailableQuantity(reservation);
    if (quantity > available) {
      setError(`Можно добавить не больше ${available} шт. свободного остатка на этой локации.`);
      return;
    }
    if (confirm && !window.confirm(`Точно увеличить резерв на ${quantity} шт.?`)) return;
    await increaseReservation(reservation.id, { quantity });
    setMessage("Резерв увеличен, доступность пересчитана.");
    await loadAll();
  };

  const handleStepReservation = async (reservation, delta) => {
    if (delta > 0) {
      await handleIncreaseReservation(reservation, 1, false);
      return;
    }

    if (reservation.quantity <= 1) {
      if (!window.confirm("Количество станет 0. Точно убрать резерв полностью?")) return;
      await releaseReservation(reservation.id, { status: "released" });
      setMessage("Резерв снят, доступность пересчитана.");
      await loadAll();
      return;
    }

    await releaseReservation(reservation.id, { status: "released", quantity: 1, comment: "" });
    setMessage("Резерв уменьшен, доступность пересчитана.");
    await loadAll();
  };

  const handleReturnUnitToAvailable = async (unit) => {
    if (!window.confirm(`Вернуть серийник ${unit.serial_number} в свободные остатки?`)) return;
    await updateEquipmentUnit(unit.id, {
      status: "available",
      customer_name: "",
      contract: null,
      responsible_person: "",
      reserved_until: null,
    });
    setMessage("Оборудование возвращено в свободные остатки.");
    await loadAll();
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
      is_hard: item?.tracking_type === "serial",
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
      is_hard: true,
      comment: "",
    });
    setActiveModal("reserve");
  };

  const itemOptions = items.map((item) => <option key={item.id} value={item.id}>{item.sku} - {item.name}</option>);
  const locationOptions = locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>);
  const reserveItem = items.find((item) => item.id === reserveForm.item);
  const contractOptions = contracts.map((contract) => (
    <option key={contract.id} value={contract.id} disabled={isContractBlocked(contract)}>
      {contract.customer_name} / {contract.number} ({CONTRACT_STATUS_LABELS[contract.status] || contract.status})
    </option>
  ));
  const renderModal = () => {
    if (!activeModal || !canEditInventory) return null;
    const titles = {
      location: "Новая локация",
      reserve: "Создать резерв",
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

          {activeModal === "reserve" ? (
            <form className="form" onSubmit={handleReserveSubmit}>
              <div className="field-note">
                {reserveItem?.tracking_type === "serial"
                  ? "Для серийной позиции резервируется конкретный серийный номер."
                  : "Для количественной позиции резервируется количество."}
              </div>
              <select
                value={reserveForm.item}
                onChange={(event) => {
                  const item = items.find((entry) => entry.id === event.target.value);
                  setReserveForm((prev) => ({
                    ...prev,
                    item: event.target.value,
                    reservation_type: item?.tracking_type === "serial" ? "serial" : "quantity",
                    equipment_units: [],
                  }));
                }}
                required
              >
                <option value="">Позиция</option>{itemOptions}
              </select>
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
              <select value={reserveForm.contract} onChange={(event) => handleContractSelect(event.target.value)}><option value="">Договор</option>{contractOptions}</select>
              {contractFileLink(reserveForm.contract) ? (
                <a className="button-link secondary" href={contractFileLink(reserveForm.contract)} target="_blank" rel="noreferrer">Открыть файл договора</a>
              ) : null}
              <input placeholder="Заказчик" value={reserveForm.customer_name} onChange={(event) => setReserveForm((prev) => ({ ...prev, customer_name: event.target.value }))} />
              <label>Зарезервировано до<input type="date" value={reserveForm.reserved_until} onChange={(event) => setReserveForm((prev) => ({ ...prev, reserved_until: event.target.value }))} /></label>
              <input placeholder="Номер договора, если нет в справочнике" value={reserveForm.contract_number} onChange={(event) => setReserveForm((prev) => ({ ...prev, contract_number: event.target.value }))} />
              <label className="checkbox">
                <input type="checkbox" checked={reserveForm.is_hard} onChange={(event) => setReserveForm((prev) => ({ ...prev, is_hard: event.target.checked }))} />
                Жестко закрепить: нельзя выдать другому заказчику или договору
              </label>
              <input placeholder="UUID заявки" value={reserveForm.request_id} onChange={(event) => setReserveForm((prev) => ({ ...prev, request_id: event.target.value }))} />
              <textarea placeholder="Комментарий" value={reserveForm.comment} onChange={(event) => setReserveForm((prev) => ({ ...prev, comment: event.target.value }))} />
              <button type="submit">Зарезервировать</button>
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
          {canEditInventory ? (
            <div className="compact-actions">
              <button type="button" onClick={() => openReserveForItem()}>Резерв</button>
              <button type="button" onClick={() => setActiveModal("location")}>Локация</button>
            </div>
          ) : null}
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
          <div className="metric-card"><span>Серийных номеров</span><strong>{summary.units}</strong></div>
          <div className="metric-card"><span>Активных резервов</span><strong>{summary.activeReservations}</strong></div>
        </div>

        <div className="inventory-workspace">
          <section className="card equipment-register">
            <h2>Номенклатура и доступность</h2>
            <div className="item-register-head">
              <span title="Артикул позиции в каталоге ЗИП.">SKU</span>
              <span title="Название позиции из каталога.">Позиция</span>
              <span title="Модель оборудования или комплектующей, если она заведена в каталоге.">Модель</span>
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
                    setSerialSearch("");
                    setReservationSearch("");
                    setDetailOpen(true);
                  }}
                >
                  <span className="row-serial">{item.sku}</span>
                  <span>{item.name}</span>
                  <span>{item.equipment_model_name || "-"}</span>
                  <span>{TRACKING_LABELS[item.tracking_type] || item.tracking_type}</span>
                  <span>{item.onHand}</span>
                  <span>{item.reserved}</span>
                  <span>{item.available}</span>
                </button>
              ))}
            </div>
            {!filteredItems.length ? <p>Позиции не найдены.</p> : null}
          </section>

          {detailOpen ? (
            <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setDetailOpen(false)}>
          <aside className="card equipment-detail equipment-detail-modal" role="dialog" aria-modal="true" aria-label="Карточка позиции">
            {selectedItem ? (
              <>
                <div className="modal-header">
                  <h2>Карточка позиции</h2>
                  <button className="ghost-button" type="button" onClick={() => setDetailOpen(false)}>Закрыть</button>
                </div>
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
                {canEditInventory ? (
                  <div className="detail-actions">
                    <button type="button" className="ghost-button" onClick={() => openReserveForItem(selectedItem)}>Зарезервировать</button>
                  </div>
                ) : null}

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
                    <input
                      className="detail-search"
                      value={serialSearch}
                      onChange={(event) => setSerialSearch(event.target.value)}
                      placeholder="Поиск по серийному номеру, локации, статусу, заказчику или договору"
                    />
                    <div className="serial-list">
                      {filteredSelectedUnits.map((unit) => (
                        <button
                          className={`serial-row ${selectedUnit?.id === unit.id ? "active" : ""}`}
                          key={unit.id}
                          type="button"
                          onClick={() => setSelectedUnitId(unit.id)}
                        >
                          <span>
                            {unitHardReserved(unit) ? <span className="lock-indicator" title="Жестко закреплено под заказчика/договор">●</span> : null}
                            {unit.serial_number}
                          </span>
                          <mark className={`status-badge status-${unit.status}`}>{unitHardReserved(unit) ? "Закреплено" : UNIT_STATUSES[unit.status] || unit.status}</mark>
                        </button>
                      ))}
                    </div>
                    {!selectedItem.units.length ? <p className="field-note">Серийные карточки еще не заведены.</p> : null}
                    {selectedItem.units.length && !filteredSelectedUnits.length ? <p className="field-note">Серийники не найдены.</p> : null}
                  </div>
                ) : null}

                {selectedUnit ? (
                  <div className="detail-section selected-unit-card">
                    <h3>{selectedUnit.serial_number}</h3>
                    <dl className="equipment-details">
                      <div><dt>Локация</dt><dd>{selectedUnit.location_name || "-"}</dd></div>
                      <div><dt>Статус</dt><dd>{UNIT_STATUSES[selectedUnit.status] || selectedUnit.status}</dd></div>
                      <div><dt>Заказчик</dt><dd>{selectedUnit.customer_name || "-"}</dd></div>
                      <div>
                        <dt>Договор</dt>
                        <dd>
                          {selectedUnit.contract_number || "-"}
                          {contractFileLink(selectedUnit.contract) ? (
                            <>
                              <br />
                              <a href={contractFileLink(selectedUnit.contract)} target="_blank" rel="noreferrer">Открыть файл</a>
                            </>
                          ) : null}
                        </dd>
                      </div>
                      <div><dt>До</dt><dd>{selectedUnit.reserved_until || "-"}</dd></div>
                      <div><dt>Ответственный</dt><dd>{selectedUnit.responsible_person || "-"}</dd></div>
                    </dl>
                    <div className="detail-actions">
                      {canEditInventory && selectedUnit.status === "available" ? <button type="button" onClick={() => openReserveForUnit(selectedUnit)}>Зарезервировать этот серийник</button> : null}
                      {canEditInventory && selectedUnit.status === "needs_check" ? (
                        <>
                          <button type="button" onClick={() => handleReturnUnitToAvailable(selectedUnit)}>Вернуть в свободные</button>
                          <button type="button" className="ghost-button" onClick={() => openReserveForUnit(selectedUnit)}>Вернуть в резерв</button>
                        </>
                      ) : null}
                      {selectedUnitReservations.map((reservation) => (
                        <div className="linked-reservation" key={reservation.id}>
                          <h3>Резерв серийника</h3>
                          <p>{reservation.customer_name || "Заказчик не указан"} · {reservation.contract_display || reservation.contract_number || "Договор не указан"} · до {reservation.reserved_until || "-"}</p>
                          {reservationHasBlockedContract(reservation) ? (
                            <p className="reservation-warning">Договор истек или закрыт: резерв нужно отозвать, продлить или перенести.</p>
                          ) : null}
                          {cleanReservationComment(reservation.comment) ? <p className="reservation-comment">{cleanReservationComment(reservation.comment)}</p> : null}
                          {canEditInventory ? <button type="button" className="ghost-button" onClick={() => handleReleaseReservation(reservation)}>
                            Снять резерв
                          </button> : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {selectedItem.tracking_type === "quantity" ? (
                <div className="detail-section">
                  <h3>Активные резервы</h3>
                  <input
                    className="detail-search"
                    value={reservationSearch}
                    onChange={(event) => setReservationSearch(event.target.value)}
                    placeholder="Поиск по резервам: заказчик, договор, локация, комментарий"
                  />
                  {filteredSelectedReservations.map((reservation) => (
                    <div className="reservation-detail-row" key={reservation.id}>
                      <div className="reservation-main">
                        <strong>{reservation.customer_name || "Заказчик не указан"}</strong>
                        <small>
                          {reservation.contract_display || reservation.contract_number || "Договор не указан"}
                          {contractFileLink(reservation.contract) ? (
                            <>
                              {" · "}
                              <a href={contractFileLink(reservation.contract)} target="_blank" rel="noreferrer">файл</a>
                            </>
                          ) : null}
                        </small>
                        <span className="reservation-meta">
                          {reservation.equipment_unit_serials?.join(", ") || `${reservation.quantity} шт.`}
                          <br />
                          до {reservation.reserved_until || "-"}
                        </span>
                        {cleanReservationComment(reservation.comment) ? (
                          <p className="reservation-comment">{cleanReservationComment(reservation.comment)}</p>
                        ) : null}
                        {reservationHasBlockedContract(reservation) ? (
                          <p className="reservation-warning">Договор истек или закрыт: резерв нужно отозвать, продлить или перенести.</p>
                        ) : null}
                      </div>
                      {canEditInventory ? <div className="reservation-controls">
                        {reservation.reservation_type === "quantity" ? (
                          <div className="reservation-stepper" aria-label="Количество под резерв">
                            <span>Кол-во под резерв</span>
                            <button type="button" title="Уменьшить резерв" onClick={() => handleStepReservation(reservation, -1)}>
                              -
                            </button>
                            <strong>{reservation.quantity}</strong>
                            <button
                              type="button"
                              title="Увеличить резерв"
                              disabled={getReservationAvailableQuantity(reservation) < 1}
                              onClick={() => handleStepReservation(reservation, 1)}
                            >
                              +
                            </button>
                            <small>свободно {getReservationAvailableQuantity(reservation)} шт.</small>
                          </div>
                        ) : null}
                        <div className="reservation-actions">
                          <button type="button" className="ghost-button" onClick={() => handleReleaseReservation(reservation, "expired")}>Истек</button>
                        </div>
                      </div> : null}
                    </div>
                  ))}
                  {!selectedItem.reservations.length ? <p className="field-note">Активных резервов по позиции нет.</p> : null}
                  {selectedItem.reservations.length && !filteredSelectedReservations.length ? <p className="field-note">Резервы не найдены.</p> : null}
                </div>
                ) : null}
              </>
            ) : (
              <p>Выбери позицию из реестра.</p>
            )}
          </aside>
            </div>
          ) : null}
        </div>

        {renderModal()}
      </div>
    </Navbar>
  );
}
