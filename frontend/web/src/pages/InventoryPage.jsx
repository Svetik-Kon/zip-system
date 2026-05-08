import { useEffect, useMemo, useState } from "react";
import {
  createBalance,
  createLocation,
  createReservation,
  getBalances,
  getCatalogItems,
  getLocations,
  getReservations,
} from "../api/inventory";
import Navbar from "../components/Navbar";
import { getMe } from "../utils/auth";

export default function InventoryPage() {
  const me = getMe();
  const [items, setItems] = useState([]);
  const [locations, setLocations] = useState([]);
  const [balances, setBalances] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [filters, setFilters] = useState({ search: "", location: "", available: "" });
  const [locationForm, setLocationForm] = useState({ name: "", location_type: "warehouse", address: "" });
  const [balanceForm, setBalanceForm] = useState({ item: "", location: "", on_hand_quantity: 0, reserved_quantity: 0 });
  const [reserveForm, setReserveForm] = useState({ item: "", location: "", quantity: 1, request_id: "", comment: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAll();
  }, []);

  const filteredBalances = useMemo(() => {
    const text = filters.search.toLowerCase();
    return balances.filter((balance) => {
      const matchesSearch = !text || [balance.item_sku, balance.item_name, balance.location_name].some((value) => String(value || "").toLowerCase().includes(text));
      const matchesLocation = !filters.location || balance.location === filters.location;
      const matchesAvailable = filters.available !== "true" || balance.available_quantity > 0;
      return matchesSearch && matchesLocation && matchesAvailable;
    });
  }, [balances, filters]);

  const loadAll = async () => {
    try {
      setLoading(true);
      setError("");
      const [itemsResult, locationsResult, balancesResult, reservationsResult] = await Promise.all([
        getCatalogItems(),
        getLocations(),
        getBalances(),
        getReservations(),
      ]);
      setItems(itemsResult);
      setLocations(locationsResult);
      setBalances(balancesResult);
      setReservations(reservationsResult);
    } catch (err) {
      setError(err?.response?.data ? JSON.stringify(err.response.data) : "Не удалось загрузить склад.");
    } finally {
      setLoading(false);
    }
  };

  const handleLocationSubmit = async (event) => {
    event.preventDefault();
    await createLocation({ ...locationForm, organization_id: me?.organization_id || null });
    setLocationForm({ name: "", location_type: "warehouse", address: "" });
    await loadAll();
  };

  const handleBalanceSubmit = async (event) => {
    event.preventDefault();
    await createBalance({
      ...balanceForm,
      on_hand_quantity: Number(balanceForm.on_hand_quantity),
      reserved_quantity: Number(balanceForm.reserved_quantity),
    });
    setBalanceForm({ item: "", location: "", on_hand_quantity: 0, reserved_quantity: 0 });
    await loadAll();
  };

  const handleReserveSubmit = async (event) => {
    event.preventDefault();
    await createReservation({
      ...reserveForm,
      quantity: Number(reserveForm.quantity),
      request_id: reserveForm.request_id || null,
      request_item_id: null,
    });
    setReserveForm({ item: "", location: "", quantity: 1, request_id: "", comment: "" });
    await loadAll();
  };

  const itemOptions = items.map((item) => <option key={item.id} value={item.id}>{item.sku} - {item.name}</option>);
  const locationOptions = locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>);

  return (
    <Navbar>
      <div className="page">
        <div className="page-header"><h1>Склад</h1></div>
        {error ? <div className="error">{error}</div> : null}
        {loading ? <p>Загрузка...</p> : null}

        <div className="dashboard-grid">
          <div className="card">
            <h2>Локация</h2>
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
          </div>

          <div className="card">
            <h2>Остаток</h2>
            <form className="form" onSubmit={handleBalanceSubmit}>
              <select value={balanceForm.item} onChange={(event) => setBalanceForm((prev) => ({ ...prev, item: event.target.value }))} required><option value="">Позиция</option>{itemOptions}</select>
              <select value={balanceForm.location} onChange={(event) => setBalanceForm((prev) => ({ ...prev, location: event.target.value }))} required><option value="">Локация</option>{locationOptions}</select>
              <input type="number" min="0" value={balanceForm.on_hand_quantity} onChange={(event) => setBalanceForm((prev) => ({ ...prev, on_hand_quantity: event.target.value }))} />
              <input type="number" min="0" value={balanceForm.reserved_quantity} onChange={(event) => setBalanceForm((prev) => ({ ...prev, reserved_quantity: event.target.value }))} />
              <button type="submit">Сохранить</button>
            </form>
          </div>

          <div className="card">
            <h2>Резерв</h2>
            <form className="form" onSubmit={handleReserveSubmit}>
              <select value={reserveForm.item} onChange={(event) => setReserveForm((prev) => ({ ...prev, item: event.target.value }))} required><option value="">Позиция</option>{itemOptions}</select>
              <select value={reserveForm.location} onChange={(event) => setReserveForm((prev) => ({ ...prev, location: event.target.value }))} required><option value="">Локация</option>{locationOptions}</select>
              <input type="number" min="1" value={reserveForm.quantity} onChange={(event) => setReserveForm((prev) => ({ ...prev, quantity: event.target.value }))} />
              <input placeholder="UUID заявки" value={reserveForm.request_id} onChange={(event) => setReserveForm((prev) => ({ ...prev, request_id: event.target.value }))} />
              <textarea placeholder="Комментарий" value={reserveForm.comment} onChange={(event) => setReserveForm((prev) => ({ ...prev, comment: event.target.value }))} />
              <button type="submit">Зарезервировать</button>
            </form>
          </div>
        </div>

        <div className="card filters">
          <input placeholder="Поиск по SKU, позиции, локации" value={filters.search} onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))} />
          <select value={filters.location} onChange={(event) => setFilters((prev) => ({ ...prev, location: event.target.value }))}><option value="">Все локации</option>{locationOptions}</select>
          <select value={filters.available} onChange={(event) => setFilters((prev) => ({ ...prev, available: event.target.value }))}><option value="">Все остатки</option><option value="true">Только доступные</option></select>
        </div>

        <div className="card">
          <h2>Остатки</h2>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>SKU</th><th>Позиция</th><th>Локация</th><th>В наличии</th><th>Резерв</th><th>Доступно</th></tr></thead>
              <tbody>{filteredBalances.map((balance) => <tr key={balance.id}><td>{balance.item_sku}</td><td>{balance.item_name}</td><td>{balance.location_name}</td><td>{balance.on_hand_quantity}</td><td>{balance.reserved_quantity}</td><td>{balance.available_quantity}</td></tr>)}</tbody>
            </table>
          </div>
          {!filteredBalances.length ? <p>Остатков не найдено.</p> : null}
        </div>

        <div className="card">
          <h2>Активные резервы</h2>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Позиция</th><th>Локация</th><th>Количество</th><th>Статус</th><th>Заявка</th></tr></thead>
              <tbody>{reservations.map((reservation) => <tr key={reservation.id}><td>{reservation.item_sku} - {reservation.item_name}</td><td>{reservation.location_name}</td><td>{reservation.quantity}</td><td>{reservation.status}</td><td>{reservation.request_id || "-"}</td></tr>)}</tbody>
            </table>
          </div>
          {!reservations.length ? <p>Резервов пока нет.</p> : null}
        </div>
      </div>
    </Navbar>
  );
}
