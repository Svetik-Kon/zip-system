from django.db.models import Q
from django.http import JsonResponse
from rest_framework import generics, permissions

from apps.analogs.models import ItemAnalog
from apps.balances.models import InventoryBalance
from apps.locations.models import StorageLocation
from apps.reservations.models import InventoryReservation
from apps.transactions.models import InventoryTransaction
from .models import EquipmentComponent, EquipmentModel, InventoryItem
from .serializers import (
    EquipmentComponentSerializer,
    EquipmentModelSerializer,
    InventoryBalanceSerializer,
    InventoryItemSerializer,
    InventoryReservationSerializer,
    InventoryTransactionSerializer,
    ItemAnalogSerializer,
    ReservationCreateSerializer,
    StorageLocationSerializer,
)


def health_check(request):
    return JsonResponse({"status": "ok", "service": "inventory-service"})


class IsInternalOrReadOnly(permissions.BasePermission):
    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return bool(request.user and request.user.is_authenticated)
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role in {"admin", "manager", "warehouse", "engineer", "procurement"}
        )


class EquipmentModelListCreateView(generics.ListCreateAPIView):
    queryset = EquipmentModel.objects.all()
    serializer_class = EquipmentModelSerializer
    permission_classes = [IsInternalOrReadOnly]


class InventoryItemListCreateView(generics.ListCreateAPIView):
    serializer_class = InventoryItemSerializer
    permission_classes = [IsInternalOrReadOnly]

    def get_queryset(self):
        qs = InventoryItem.objects.select_related("equipment_model").all()
        search = self.request.query_params.get("search")
        item_type = self.request.query_params.get("item_type")

        if search:
            qs = qs.filter(
                Q(sku__icontains=search)
                | Q(name__icontains=search)
                | Q(manufacturer__icontains=search)
                | Q(equipment_model__name__icontains=search)
            )
        if item_type:
            qs = qs.filter(item_type=item_type)
        return qs


class InventoryItemDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = InventoryItem.objects.select_related("equipment_model").all()
    serializer_class = InventoryItemSerializer
    permission_classes = [IsInternalOrReadOnly]


class EquipmentComponentListCreateView(generics.ListCreateAPIView):
    queryset = EquipmentComponent.objects.select_related("equipment_model", "item").all()
    serializer_class = EquipmentComponentSerializer
    permission_classes = [IsInternalOrReadOnly]


class ItemAnalogListCreateView(generics.ListCreateAPIView):
    queryset = ItemAnalog.objects.select_related("item", "analog_item").all()
    serializer_class = ItemAnalogSerializer
    permission_classes = [IsInternalOrReadOnly]


class StorageLocationListCreateView(generics.ListCreateAPIView):
    serializer_class = StorageLocationSerializer
    permission_classes = [IsInternalOrReadOnly]

    def get_queryset(self):
        qs = StorageLocation.objects.all()
        if self.request.user.role == "customer" and self.request.user.organization_id:
            qs = qs.filter(organization_id=self.request.user.organization_id)
        return qs


class InventoryBalanceListCreateView(generics.ListCreateAPIView):
    serializer_class = InventoryBalanceSerializer
    permission_classes = [IsInternalOrReadOnly]

    def get_queryset(self):
        qs = InventoryBalance.objects.select_related("item", "location").all()
        item_id = self.request.query_params.get("item")
        location_id = self.request.query_params.get("location")
        only_available = self.request.query_params.get("available")

        if self.request.user.role == "customer" and self.request.user.organization_id:
            qs = qs.filter(location__organization_id=self.request.user.organization_id)
        if item_id:
            qs = qs.filter(item_id=item_id)
        if location_id:
            qs = qs.filter(location_id=location_id)
        if only_available == "true":
            qs = [balance for balance in qs if balance.available_quantity > 0]
        return qs


class InventoryReservationListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsInternalOrReadOnly]

    def get_serializer_class(self):
        if self.request.method == "POST":
            return ReservationCreateSerializer
        return InventoryReservationSerializer

    def get_queryset(self):
        qs = InventoryReservation.objects.select_related("item", "location").all()
        request_id = self.request.query_params.get("request_id")
        if request_id:
            qs = qs.filter(request_id=request_id)
        return qs


class InventoryTransactionListCreateView(generics.ListCreateAPIView):
    serializer_class = InventoryTransactionSerializer
    permission_classes = [IsInternalOrReadOnly]

    def get_queryset(self):
        qs = InventoryTransaction.objects.prefetch_related("items").select_related(
            "source_location", "destination_location"
        )
        request_id = self.request.query_params.get("related_request_id")
        if request_id:
            qs = qs.filter(related_request_id=request_id)
        return qs
