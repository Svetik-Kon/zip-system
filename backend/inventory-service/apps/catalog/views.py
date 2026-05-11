from django.db import transaction
from django.db.models import ProtectedError
from django.db.models import Q
from django.http import JsonResponse
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.analogs.models import ItemAnalog
from apps.balances.models import InventoryBalance
from apps.locations.models import StorageLocation
from apps.reservations.models import InventoryReservation, ReservationStatus
from apps.transactions.models import InventoryTransaction
from .models import CustomerContract, EquipmentComponent, EquipmentModel, EquipmentUnit, EquipmentUnitStatus, InventoryItem
from .serializers import (
    CustomerContractSerializer,
    EquipmentUnitSerializer,
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

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        try:
            instance.delete()
        except ProtectedError:
            return Response(
                {"detail": "Позицию нельзя удалить: она уже используется в складском учете, резервах, серийниках или движениях."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


class EquipmentComponentListCreateView(generics.ListCreateAPIView):
    queryset = EquipmentComponent.objects.select_related("equipment_model", "item").all()
    serializer_class = EquipmentComponentSerializer
    permission_classes = [IsInternalOrReadOnly]


class ItemAnalogListCreateView(generics.ListCreateAPIView):
    queryset = ItemAnalog.objects.select_related("item", "analog_item").all()
    serializer_class = ItemAnalogSerializer
    permission_classes = [IsInternalOrReadOnly]


class CustomerContractListCreateView(generics.ListCreateAPIView):
    serializer_class = CustomerContractSerializer
    permission_classes = [IsInternalOrReadOnly]

    def get_queryset(self):
        qs = CustomerContract.objects.all()
        search = self.request.query_params.get("search")
        status_value = self.request.query_params.get("status")

        if search:
            qs = qs.filter(Q(customer_name__icontains=search) | Q(number__icontains=search))
        if status_value:
            qs = qs.filter(status=status_value)
        return qs


class EquipmentUnitListCreateView(generics.ListCreateAPIView):
    serializer_class = EquipmentUnitSerializer
    permission_classes = [IsInternalOrReadOnly]

    def get_queryset(self):
        qs = EquipmentUnit.objects.select_related("item", "location", "contract").all()
        item_id = self.request.query_params.get("item")
        location_id = self.request.query_params.get("location")
        status_value = self.request.query_params.get("status")
        search = self.request.query_params.get("search")

        if item_id:
            qs = qs.filter(item_id=item_id)
        if location_id:
            qs = qs.filter(location_id=location_id)
        if status_value:
            qs = qs.filter(status=status_value)
        if search:
            qs = qs.filter(
                Q(serial_number__icontains=search)
                | Q(inventory_number__icontains=search)
                | Q(item__sku__icontains=search)
                | Q(item__name__icontains=search)
                | Q(customer_name__icontains=search)
                | Q(contract__number__icontains=search)
            )
        return qs


class EquipmentUnitDetailView(generics.RetrieveUpdateAPIView):
    queryset = EquipmentUnit.objects.select_related("item", "location", "contract").all()
    serializer_class = EquipmentUnitSerializer
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
        qs = InventoryReservation.objects.select_related("item", "location", "contract").prefetch_related("equipment_units").all()
        request_id = self.request.query_params.get("request_id")
        if request_id:
            qs = qs.filter(request_id=request_id)
        return qs


class InventoryReservationReleaseView(APIView):
    permission_classes = [IsInternalOrReadOnly]

    def post(self, request, pk):
        release_status = request.data.get("status", ReservationStatus.RELEASED)
        if release_status not in {ReservationStatus.RELEASED, ReservationStatus.EXPIRED}:
            release_status = ReservationStatus.RELEASED
        requested_quantity = request.data.get("quantity")

        with transaction.atomic():
            reservation = (
                InventoryReservation.objects.select_for_update()
                .select_related("item", "location")
                .prefetch_related("equipment_units")
                .get(pk=pk)
            )
            if reservation.status != ReservationStatus.ACTIVE:
                serializer = InventoryReservationSerializer(reservation, context={"request": request})
                return Response(serializer.data)

            release_quantity = reservation.quantity
            if requested_quantity not in (None, ""):
                try:
                    release_quantity = int(requested_quantity)
                except (TypeError, ValueError):
                    return Response({"quantity": "Quantity must be a positive integer."}, status=400)
                if release_quantity < 1:
                    return Response({"quantity": "Quantity must be a positive integer."}, status=400)
                if release_quantity > reservation.quantity:
                    return Response({"quantity": "Quantity cannot exceed reserved quantity."}, status=400)

            units = list(reservation.equipment_units.all())
            is_partial_release = release_quantity < reservation.quantity
            if is_partial_release and units:
                return Response(
                    {"quantity": "Partial release for serial-number reservations is not supported yet. Release the full serial reservation."},
                    status=400,
                )

            balance, _ = InventoryBalance.objects.select_for_update().get_or_create(
                item=reservation.item,
                location=reservation.location,
                defaults={"on_hand_quantity": 0, "reserved_quantity": 0},
            )
            balance.reserved_quantity = max(balance.reserved_quantity - release_quantity, 0)
            balance.save(update_fields=["reserved_quantity", "updated_at"])

            if is_partial_release:
                reservation.quantity -= release_quantity
                reservation.comment = "\n".join(
                    value for value in [
                        reservation.comment,
                        request.data.get("comment", "").strip() or f"Partially released quantity: {release_quantity}.",
                    ]
                    if value
                )
                reservation.save(update_fields=["quantity", "comment", "updated_at"])
            elif units:
                EquipmentUnit.objects.filter(id__in=[unit.id for unit in units]).update(
                    status=EquipmentUnitStatus.AVAILABLE,
                    customer_name="",
                    contract=None,
                    reserved_until=None,
                )

            if not is_partial_release:
                reservation.status = release_status
                reservation.comment = "\n".join(
                    value for value in [reservation.comment, request.data.get("comment", "").strip()] if value
                )
                reservation.save(update_fields=["status", "comment", "updated_at"])

        serializer = InventoryReservationSerializer(reservation, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class InventoryTransactionListCreateView(generics.ListCreateAPIView):
    serializer_class = InventoryTransactionSerializer
    permission_classes = [IsInternalOrReadOnly]

    def get_queryset(self):
        qs = InventoryTransaction.objects.prefetch_related("items", "items__equipment_units").select_related(
            "source_location", "destination_location", "contract"
        )
        request_id = self.request.query_params.get("related_request_id")
        if request_id:
            qs = qs.filter(related_request_id=request_id)
        return qs
