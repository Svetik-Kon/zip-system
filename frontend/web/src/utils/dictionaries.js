export const REQUEST_TYPE_LABELS = {
  repair_diagnostics: "Ремонт / диагностика",
  equipment_replacement: "Замена оборудования",
  internal_request: "Внутренний запрос",
  software_update: "Обновление / запрос софта",
};

export const REQUEST_STATUS_LABELS = {
  new: "Новая",
  in_review: "На согласовании",
  diagnostics: "Диагностика",
  awaiting_warehouse: "Ожидает склад",
  awaiting_procurement: "Ожидает закупки",
  reserved: "В резерве",
  ready_to_ship: "На отгрузке",
  shipped: "Отгружено",
  in_lab: "В лаборатории",
  received: "Получено",
  closed: "Закрыта",
  rejected: "Отклонена",
  cancelled: "Отменена",
};

export const ROLE_LABELS = {
  admin: "Администратор",
  customer: "Заказчик",
  manager: "Менеджер",
  warehouse: "Складовщик",
  engineer: "Инженер",
  procurement: "Снабжение",
};

export function getRequestTypeLabel(value) {
  return REQUEST_TYPE_LABELS[value] || value;
}

export function getRequestStatusLabel(value) {
  return REQUEST_STATUS_LABELS[value] || value;
}

export function getRoleLabel(value) {
  return ROLE_LABELS[value] || value;
}