from django.urls import path
from .views import (
    CustomerContractListCreateView,
    EquipmentComponentListCreateView,
    EquipmentModelListCreateView,
    EquipmentUnitDetailView,
    EquipmentUnitListCreateView,
    InventoryBalanceListCreateView,
    InventoryItemDetailView,
    InventoryItemListCreateView,
    InventoryReservationListCreateView,
    InventoryReservationReleaseView,
    InventoryTransactionListCreateView,
    ItemAnalogListCreateView,
    StorageLocationListCreateView,
    health_check,
)

urlpatterns = [
    path("health/", health_check),
    path("api/equipment-models/", EquipmentModelListCreateView.as_view()),
    path("api/catalog/items/", InventoryItemListCreateView.as_view()),
    path("api/catalog/items/<uuid:pk>/", InventoryItemDetailView.as_view()),
    path("api/catalog/components/", EquipmentComponentListCreateView.as_view()),
    path("api/catalog/analogs/", ItemAnalogListCreateView.as_view()),
    path("api/contracts/", CustomerContractListCreateView.as_view()),
    path("api/equipment-units/", EquipmentUnitListCreateView.as_view()),
    path("api/equipment-units/<uuid:pk>/", EquipmentUnitDetailView.as_view()),
    path("api/locations/", StorageLocationListCreateView.as_view()),
    path("api/balances/", InventoryBalanceListCreateView.as_view()),
    path("api/reservations/", InventoryReservationListCreateView.as_view()),
    path("api/reservations/<uuid:pk>/release/", InventoryReservationReleaseView.as_view()),
    path("api/transactions/", InventoryTransactionListCreateView.as_view()),
]
