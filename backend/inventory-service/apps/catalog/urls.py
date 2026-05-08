from django.urls import path
from .views import (
    EquipmentComponentListCreateView,
    EquipmentModelListCreateView,
    InventoryBalanceListCreateView,
    InventoryItemDetailView,
    InventoryItemListCreateView,
    InventoryReservationListCreateView,
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
    path("api/locations/", StorageLocationListCreateView.as_view()),
    path("api/balances/", InventoryBalanceListCreateView.as_view()),
    path("api/reservations/", InventoryReservationListCreateView.as_view()),
    path("api/transactions/", InventoryTransactionListCreateView.as_view()),
]
