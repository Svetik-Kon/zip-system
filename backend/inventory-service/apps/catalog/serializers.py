from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from apps.analogs.models import ItemAnalog
from apps.balances.models import InventoryBalance
from apps.locations.models import StorageLocation
from apps.reservations.models import InventoryReservation, ReservationStatus
from apps.transactions.models import (
    BusinessOperation,
    InventoryTransaction,
    InventoryTransactionItem,
    TransactionType,
)
from .models import (
    ContractStatus,
    CustomerContract,
    EquipmentComponent,
    EquipmentModel,
    EquipmentUnit,
    EquipmentUnitStatus,
    InventoryItem,
)


def contract_is_unusable(contract):
    if not contract:
        return False
    if contract.status in {ContractStatus.EXPIRED, ContractStatus.CLOSED}:
        return True
    return bool(contract.ends_at and contract.ends_at < timezone.localdate())


def validate_usable_contract(contract, field_name="contract"):
    if contract_is_unusable(contract):
        raise serializers.ValidationError(
            {field_name: "Cannot use an expired or closed contract for this operation."}
        )


class EquipmentModelSerializer(serializers.ModelSerializer):
    class Meta:
        model = EquipmentModel
        fields = ("id", "name", "manufacturer", "description")


class InventoryItemSerializer(serializers.ModelSerializer):
    equipment_model_name = serializers.CharField(source="equipment_model.name", read_only=True)
    model_name = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = InventoryItem
        fields = (
            "id",
            "sku",
            "name",
            "manufacturer",
            "unit",
            "item_type",
            "tracking_type",
            "equipment_model",
            "equipment_model_name",
            "model_name",
            "description",
            "is_active",
            "created_at",
            "updated_at",
        )

    def create(self, validated_data):
        model_name = validated_data.pop("model_name", "").strip()

        if model_name and not validated_data.get("equipment_model"):
            equipment_model, _ = EquipmentModel.objects.get_or_create(
                name=model_name,
                defaults={"manufacturer": validated_data.get("manufacturer", "")},
            )
            validated_data["equipment_model"] = equipment_model

        return super().create(validated_data)


class EquipmentComponentSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source="item.name", read_only=True)
    item_sku = serializers.CharField(source="item.sku", read_only=True)

    class Meta:
        model = EquipmentComponent
        fields = ("id", "equipment_model", "item", "item_name", "item_sku", "quantity")


class ItemAnalogSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source="item.name", read_only=True)
    analog_item_name = serializers.CharField(source="analog_item.name", read_only=True)

    class Meta:
        model = ItemAnalog
        fields = ("id", "item", "item_name", "analog_item", "analog_item_name", "note")


class CustomerContractSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomerContract
        fields = (
            "id",
            "organization_id",
            "customer_name",
            "number",
            "starts_at",
            "ends_at",
            "status",
            "file",
            "comment",
            "created_at",
            "updated_at",
        )

    def validate(self, attrs):
        organization_id = attrs.get("organization_id", getattr(self.instance, "organization_id", None))
        if self.instance is None and not organization_id:
            raise serializers.ValidationError({"organization_id": "Выбери организацию-заказчика."})

        ends_at = attrs.get("ends_at", getattr(self.instance, "ends_at", None))
        status_value = attrs.get("status", getattr(self.instance, "status", ContractStatus.ACTIVE))
        if ends_at and ends_at < timezone.localdate() and status_value != ContractStatus.CLOSED:
            attrs["status"] = ContractStatus.EXPIRED
        return attrs


class EquipmentUnitSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source="item.name", read_only=True)
    item_sku = serializers.CharField(source="item.sku", read_only=True)
    location_name = serializers.CharField(source="location.name", read_only=True)
    contract_number = serializers.CharField(source="contract.number", read_only=True)

    class Meta:
        model = EquipmentUnit
        fields = (
            "id",
            "item",
            "item_name",
            "item_sku",
            "serial_number",
            "inventory_number",
            "location",
            "location_name",
            "status",
            "customer_name",
            "contract",
            "contract_number",
            "responsible_person",
            "reserved_until",
            "notes",
            "created_at",
            "updated_at",
        )

    def create(self, validated_data):
        unit = super().create(validated_data)
        if unit.location_id:
            balance, _ = InventoryBalance.objects.get_or_create(
                item=unit.item,
                location=unit.location,
                defaults={"on_hand_quantity": 0, "reserved_quantity": 0},
            )
            balance.on_hand_quantity += 1
            balance.save(update_fields=["on_hand_quantity", "updated_at"])
        return unit

    def validate(self, attrs):
        contract = attrs.get("contract", getattr(self.instance, "contract", None))
        validate_usable_contract(contract)
        return attrs


class StorageLocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = StorageLocation
        fields = (
            "id",
            "organization_id",
            "name",
            "location_type",
            "address",
            "is_active",
            "created_at",
            "updated_at",
        )


class InventoryBalanceSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source="item.name", read_only=True)
    item_sku = serializers.CharField(source="item.sku", read_only=True)
    location_name = serializers.CharField(source="location.name", read_only=True)
    available_quantity = serializers.IntegerField(read_only=True)

    class Meta:
        model = InventoryBalance
        fields = (
            "id",
            "item",
            "item_name",
            "item_sku",
            "location",
            "location_name",
            "on_hand_quantity",
            "reserved_quantity",
            "available_quantity",
            "updated_at",
        )
        validators = []

    def validate(self, attrs):
        on_hand = attrs.get(
            "on_hand_quantity",
            getattr(self.instance, "on_hand_quantity", 0),
        )
        reserved = attrs.get(
            "reserved_quantity",
            getattr(self.instance, "reserved_quantity", 0),
        )
        if reserved > on_hand:
            raise serializers.ValidationError(
                {"reserved_quantity": "Reserved quantity cannot exceed on-hand quantity."}
            )
        return attrs

    def create(self, validated_data):
        reserved_quantity = validated_data.get("reserved_quantity")
        balance, created = InventoryBalance.objects.update_or_create(
            item=validated_data["item"],
            location=validated_data["location"],
            defaults={
                "on_hand_quantity": validated_data.get("on_hand_quantity", 0),
            },
        )
        if created or reserved_quantity is not None:
            balance.reserved_quantity = reserved_quantity or 0
            balance.save(update_fields=["reserved_quantity", "updated_at"])
        return balance


class InventoryReservationSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source="item.name", read_only=True)
    item_sku = serializers.CharField(source="item.sku", read_only=True)
    location_name = serializers.CharField(source="location.name", read_only=True)
    contract_display = serializers.CharField(source="contract.number", read_only=True)
    contract_status = serializers.CharField(source="contract.status", read_only=True)
    contract_ends_at = serializers.DateField(source="contract.ends_at", read_only=True)
    equipment_unit_serials = serializers.SerializerMethodField()

    def get_equipment_unit_serials(self, obj):
        return [unit.serial_number for unit in obj.equipment_units.all()]

    class Meta:
        model = InventoryReservation
        fields = (
            "id",
            "request_id",
            "request_item_id",
            "reservation_type",
            "item",
            "item_name",
            "item_sku",
            "location",
            "location_name",
            "quantity",
            "customer_name",
            "reserved_until",
            "contract",
            "contract_display",
            "contract_status",
            "contract_ends_at",
            "equipment_units",
            "equipment_unit_serials",
            "contract_number",
            "status",
            "created_by_id",
            "created_by_username",
            "is_hard",
            "comment",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_by_id", "created_by_username")


class ReservationCreateSerializer(serializers.Serializer):
    request_id = serializers.UUIDField(required=False, allow_null=True)
    request_item_id = serializers.UUIDField(required=False, allow_null=True)
    reservation_type = serializers.ChoiceField(
        choices=("quantity", "serial"),
        required=False,
        default="quantity",
    )
    item = serializers.PrimaryKeyRelatedField(queryset=InventoryItem.objects.filter(is_active=True))
    location = serializers.PrimaryKeyRelatedField(queryset=StorageLocation.objects.filter(is_active=True))
    quantity = serializers.IntegerField(min_value=1, required=False)
    customer_name = serializers.CharField(required=False, allow_blank=True)
    reserved_until = serializers.DateField(required=False, allow_null=True)
    contract = serializers.PrimaryKeyRelatedField(
        queryset=CustomerContract.objects.all(),
        required=False,
        allow_null=True,
    )
    equipment_units = serializers.PrimaryKeyRelatedField(
        queryset=EquipmentUnit.objects.select_related("item", "location").all(),
        many=True,
        required=False,
    )
    contract_number = serializers.CharField(required=False, allow_blank=True)
    is_hard = serializers.BooleanField(required=False, default=False)
    comment = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        equipment_units = attrs.get("equipment_units") or []
        reservation_type = attrs.get("reservation_type")
        item = attrs.get("item")
        validate_usable_contract(attrs.get("contract"))

        if item and item.tracking_type == "serial" and not equipment_units:
            raise serializers.ValidationError({"equipment_units": "For serial-tracked items, reserve exact serial numbers."})
        if item and item.tracking_type == "quantity" and equipment_units:
            raise serializers.ValidationError({"equipment_units": "Quantity-tracked items cannot be reserved by serial numbers."})

        if equipment_units:
            attrs["reservation_type"] = "serial"
            attrs["quantity"] = len(equipment_units)
        elif reservation_type == "serial":
            raise serializers.ValidationError({"equipment_units": "Select serial-numbered equipment units."})
        elif not attrs.get("quantity"):
            raise serializers.ValidationError({"quantity": "Quantity is required."})

        return attrs

    def create(self, validated_data):
        request = self.context["request"]
        equipment_units = validated_data.pop("equipment_units", [])
        contract = validated_data.get("contract")
        customer_name = validated_data.get("customer_name") or (contract.customer_name if contract else "")

        with transaction.atomic():
            balance, _ = InventoryBalance.objects.select_for_update().get_or_create(
                item=validated_data["item"],
                location=validated_data["location"],
                defaults={"on_hand_quantity": 0, "reserved_quantity": 0},
            )

            if balance.available_quantity < validated_data["quantity"]:
                raise serializers.ValidationError(
                    {"quantity": "Not enough available stock for reservation."}
                )

            if equipment_units:
                locked_units = list(
                    EquipmentUnit.objects.select_for_update().filter(
                        id__in=[unit.id for unit in equipment_units]
                    )
                )
                if len(locked_units) != len(equipment_units):
                    raise serializers.ValidationError({"equipment_units": "Some equipment units were not found."})

                for unit in locked_units:
                    if unit.item_id != validated_data["item"].id:
                        raise serializers.ValidationError({"equipment_units": f"{unit.serial_number} belongs to another item."})
                    if unit.location_id != validated_data["location"].id:
                        raise serializers.ValidationError({"equipment_units": f"{unit.serial_number} is in another location."})
                    if unit.status not in {EquipmentUnitStatus.AVAILABLE, EquipmentUnitStatus.NEEDS_CHECK}:
                        raise serializers.ValidationError({"equipment_units": f"{unit.serial_number} is not available."})

            balance.reserved_quantity += validated_data["quantity"]
            balance.save(update_fields=["reserved_quantity", "updated_at"])

            validated_data["customer_name"] = customer_name
            reservation = InventoryReservation.objects.create(
                **validated_data,
                created_by_id=request.user.id,
                created_by_username=request.user.username,
            )
            if equipment_units:
                reservation.equipment_units.set(equipment_units)
                EquipmentUnit.objects.filter(id__in=[unit.id for unit in equipment_units]).update(
                    status=EquipmentUnitStatus.RESERVED,
                    customer_name=customer_name,
                    contract=contract,
                    reserved_until=validated_data.get("reserved_until"),
                )
            return reservation


class InventoryTransactionItemSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source="item.name", read_only=True)
    item_sku = serializers.CharField(source="item.sku", read_only=True)
    equipment_unit_serials = serializers.SerializerMethodField()
    reservation = serializers.PrimaryKeyRelatedField(
        queryset=InventoryReservation.objects.filter(status=ReservationStatus.ACTIVE),
        required=False,
        allow_null=True,
        write_only=True,
    )
    serial_numbers = serializers.ListField(
        child=serializers.CharField(max_length=150),
        required=False,
        write_only=True,
    )

    def get_equipment_unit_serials(self, obj):
        return [unit.serial_number for unit in obj.equipment_units.all()]

    class Meta:
        model = InventoryTransactionItem
        fields = ("id", "item", "item_name", "item_sku", "quantity", "equipment_units", "equipment_unit_serials", "reservation", "serial_numbers")


class InventoryTransactionSerializer(serializers.ModelSerializer):
    items = InventoryTransactionItemSerializer(many=True)
    source_location_name = serializers.CharField(source="source_location.name", read_only=True)
    destination_location_name = serializers.CharField(source="destination_location.name", read_only=True)
    contract_display = serializers.CharField(source="contract.number", read_only=True)
    override_reservation_conflict = serializers.BooleanField(write_only=True, required=False, default=False)

    class Meta:
        model = InventoryTransaction
        fields = (
            "id",
            "transaction_type",
            "operation_kind",
            "source_location",
            "source_location_name",
            "destination_location",
            "destination_location_name",
            "related_request_id",
            "performed_by_id",
            "performed_by_username",
            "customer_name",
            "contract",
            "contract_display",
            "responsible_person",
            "due_date",
            "reason",
            "comment",
            "override_reservation_conflict",
            "items",
            "created_at",
        )
        read_only_fields = ("performed_by_id", "performed_by_username")
        extra_kwargs = {"transaction_type": {"required": False}}

    def validate(self, attrs):
        operation_kind = attrs.get("operation_kind", BusinessOperation.SUPPLIER_RECEIPT)
        attrs["transaction_type"] = self._transaction_type_for_operation(operation_kind)
        transaction_type = attrs.get("transaction_type")
        source = attrs.get("source_location")
        destination = attrs.get("destination_location")

        if transaction_type in (TransactionType.ISSUE, TransactionType.TRANSFER, TransactionType.RETURN) and not source:
            raise serializers.ValidationError({"source_location": "Source location is required."})
        if transaction_type in (TransactionType.RECEIPT, TransactionType.TRANSFER, TransactionType.RETURN) and not destination:
            raise serializers.ValidationError({"destination_location": "Destination location is required."})
        if transaction_type == TransactionType.ADJUSTMENT and not destination:
            raise serializers.ValidationError({"destination_location": "Location is required for adjustment."})
        if operation_kind == BusinessOperation.CUSTOMER_ISSUE and not attrs.get("customer_name") and not attrs.get("contract"):
            raise serializers.ValidationError({"customer_name": "Customer or contract is required for customer issue."})
        if operation_kind == BusinessOperation.CUSTOMER_ISSUE:
            validate_usable_contract(attrs.get("contract"))
        if operation_kind == BusinessOperation.LAB_TRANSFER and not attrs.get("responsible_person"):
            raise serializers.ValidationError({"responsible_person": "Responsible person is required for lab transfer."})
        return attrs

    def _transaction_type_for_operation(self, operation_kind):
        mapping = {
            BusinessOperation.SUPPLIER_RECEIPT: TransactionType.RECEIPT,
            BusinessOperation.WAREHOUSE_TRANSFER: TransactionType.TRANSFER,
            BusinessOperation.CUSTOMER_ISSUE: TransactionType.ISSUE,
            BusinessOperation.LAB_TRANSFER: TransactionType.TRANSFER,
            BusinessOperation.CUSTOMER_RETURN: TransactionType.RECEIPT,
            BusinessOperation.LAB_RETURN: TransactionType.RETURN,
            BusinessOperation.WRITE_OFF: TransactionType.ISSUE,
            BusinessOperation.STOCK_ADJUSTMENT: TransactionType.ADJUSTMENT,
        }
        return mapping.get(operation_kind, TransactionType.RECEIPT)

    def create(self, validated_data):
        request = self.context["request"]
        items_data = validated_data.pop("items")
        override_reservation_conflict = validated_data.pop("override_reservation_conflict", False)

        with transaction.atomic():
            inventory_transaction = InventoryTransaction.objects.create(
                **validated_data,
                performed_by_id=request.user.id,
                performed_by_username=request.user.username,
            )

            for item_data in items_data:
                item = item_data["item"]
                quantity = item_data["quantity"]
                equipment_units = item_data.pop("equipment_units", [])
                selected_reservation = item_data.pop("reservation", None)
                serial_numbers = [
                    serial.strip()
                    for serial in item_data.pop("serial_numbers", [])
                    if serial and serial.strip()
                ]
                if equipment_units:
                    quantity = len(equipment_units)
                if serial_numbers:
                    if inventory_transaction.operation_kind != BusinessOperation.SUPPLIER_RECEIPT:
                        raise serializers.ValidationError({"items": "Serial numbers can be created only on supplier receipt."})
                    if item.tracking_type != "serial":
                        raise serializers.ValidationError({"items": f"{item.sku} is not tracked by serial numbers."})
                    if len(serial_numbers) != len(set(serial_numbers)):
                        raise serializers.ValidationError({"items": "Serial numbers in receipt must be unique."})
                    existing_serials = set(
                        EquipmentUnit.objects.filter(serial_number__in=serial_numbers).values_list("serial_number", flat=True)
                    )
                    if existing_serials:
                        raise serializers.ValidationError({"items": f"Serial numbers already exist: {', '.join(sorted(existing_serials))}."})
                    quantity = len(serial_numbers)
                self._apply_balance(
                    inventory_transaction,
                    item,
                    quantity,
                    equipment_units,
                    override_reservation_conflict,
                    selected_reservation,
                )
                transaction_item = InventoryTransactionItem.objects.create(
                    transaction=inventory_transaction,
                    item=item,
                    quantity=quantity,
                )
                if equipment_units:
                    transaction_item.equipment_units.set(equipment_units)
                if serial_numbers:
                    created_units = [
                        EquipmentUnit.objects.create(
                            item=item,
                            serial_number=serial,
                            location=inventory_transaction.destination_location,
                            notes=inventory_transaction.comment,
                        )
                        for serial in serial_numbers
                    ]
                    transaction_item.equipment_units.set(created_units)

            return inventory_transaction

    def _reservation_matches_transaction(self, reservation, inventory_transaction):
        if reservation.contract_id and inventory_transaction.contract_id:
            return reservation.contract_id == inventory_transaction.contract_id
        if reservation.customer_name and inventory_transaction.customer_name:
            return reservation.customer_name.strip().lower() == inventory_transaction.customer_name.strip().lower()
        return not reservation.contract_id and not reservation.customer_name

    def _consume_quantity_reservations(self, reservations, quantity):
        remaining = quantity
        for reservation in reservations:
            if remaining <= 0:
                break
            consumed = min(reservation.quantity, remaining)
            remaining -= consumed
            if consumed >= reservation.quantity:
                reservation.status = ReservationStatus.USED
                reservation.save(update_fields=["status", "updated_at"])
            else:
                reservation.quantity -= consumed
                reservation.save(update_fields=["quantity", "updated_at"])

    def _consume_serial_reservation_unit(self, reservation, unit):
        if reservation.quantity <= 1:
            reservation.status = ReservationStatus.USED
            reservation.save(update_fields=["status", "updated_at"])
            return
        reservation.equipment_units.remove(unit)
        reservation.quantity -= 1
        reservation.save(update_fields=["quantity", "updated_at"])

    def _copy_reservation(self, reservation, location, quantity):
        return InventoryReservation.objects.create(
            request_id=reservation.request_id,
            request_item_id=reservation.request_item_id,
            reservation_type=reservation.reservation_type,
            item=reservation.item,
            location=location,
            quantity=quantity,
            customer_name=reservation.customer_name,
            reserved_until=reservation.reserved_until,
            contract=reservation.contract,
            contract_number=reservation.contract_number,
            status=ReservationStatus.ACTIVE,
            created_by_id=reservation.created_by_id,
            created_by_username=reservation.created_by_username,
            is_hard=reservation.is_hard,
            comment=reservation.comment,
        )

    def _move_quantity_reservation(self, reservation, destination, quantity):
        if quantity > reservation.quantity:
            raise serializers.ValidationError({"reservation": "Move quantity cannot exceed reservation quantity."})
        if quantity == reservation.quantity:
            reservation.location = destination
            reservation.save(update_fields=["location", "updated_at"])
            return reservation

        reservation.quantity -= quantity
        reservation.save(update_fields=["quantity", "updated_at"])
        return self._copy_reservation(reservation, destination, quantity)

    def _move_serial_reservations(self, reservations, moved_units, destination):
        moved_unit_ids = {unit.id for unit in moved_units}
        for reservation in reservations:
            reservation_units = list(reservation.equipment_units.all())
            moved_for_reservation = [unit for unit in reservation_units if unit.id in moved_unit_ids]
            if not moved_for_reservation:
                continue
            if len(moved_for_reservation) == len(reservation_units):
                reservation.location = destination
                reservation.save(update_fields=["location", "updated_at"])
                continue

            new_reservation = self._copy_reservation(
                reservation,
                destination,
                len(moved_for_reservation),
            )
            new_reservation.equipment_units.set(moved_for_reservation)
            reservation.equipment_units.remove(*moved_for_reservation)
            reservation.quantity -= len(moved_for_reservation)
            reservation.save(update_fields=["quantity", "updated_at"])

    def _apply_balance(self, inventory_transaction, item, quantity, equipment_units=None, override_reservation_conflict=False, selected_reservation=None):
        source = inventory_transaction.source_location
        destination = inventory_transaction.destination_location
        transaction_type = inventory_transaction.transaction_type
        equipment_units = equipment_units or []
        locked_units = []
        serial_reservations_to_consume = []
        serial_reservations_to_move = []
        reserved_unit_ids_to_move = set()
        quantity_reservations_to_consume = []
        quantity_reserved_to_consume = 0
        quantity_reserved_to_move = 0

        if equipment_units:
            locked_units = list(
                EquipmentUnit.objects.select_for_update().filter(
                    id__in=[unit.id for unit in equipment_units]
                )
            )
            if len(locked_units) != len(equipment_units):
                raise serializers.ValidationError({"items": "Some equipment units were not found."})

            for unit in locked_units:
                if unit.item_id != item.id:
                    raise serializers.ValidationError({"items": f"{unit.serial_number} belongs to another item."})
                if source and unit.location_id != source.id:
                    raise serializers.ValidationError({"items": f"{unit.serial_number} is in another source location."})
                if inventory_transaction.operation_kind == BusinessOperation.CUSTOMER_ISSUE:
                    active_reservations = list(
                        InventoryReservation.objects.select_for_update()
                        .filter(status=ReservationStatus.ACTIVE, equipment_units=unit)
                    )
                    for reservation in active_reservations:
                        if self._reservation_matches_transaction(reservation, inventory_transaction):
                            serial_reservations_to_consume.append((reservation, unit))
                            continue
                        if reservation.is_hard:
                            raise serializers.ValidationError({
                                "items": f"{unit.serial_number} is hard-reserved for another customer/contract."
                            })
                        if not override_reservation_conflict:
                            raise serializers.ValidationError({
                                "override_reservation_conflict": f"{unit.serial_number} is reserved for another customer/contract."
                            })
                elif inventory_transaction.operation_kind in (BusinessOperation.WAREHOUSE_TRANSFER, BusinessOperation.LAB_TRANSFER, BusinessOperation.LAB_RETURN):
                    unit_reservations = list(
                        InventoryReservation.objects.select_for_update()
                        .filter(status=ReservationStatus.ACTIVE, equipment_units=unit)
                        .prefetch_related("equipment_units")
                    )
                    if inventory_transaction.operation_kind == BusinessOperation.LAB_TRANSFER:
                        hard_reservation = next((reservation for reservation in unit_reservations if reservation.is_hard), None)
                        if hard_reservation:
                            raise serializers.ValidationError({
                                "items": f"{unit.serial_number} is hard-reserved and cannot be sent to lab."
                            })
                    if unit_reservations:
                        reserved_unit_ids_to_move.add(unit.id)
                        serial_reservations_to_move.extend(unit_reservations)

        if source:
            source_balance, _ = InventoryBalance.objects.select_for_update().get_or_create(
                item=item,
                location=source,
                defaults={"on_hand_quantity": 0, "reserved_quantity": 0},
            )
            if equipment_units:
                if source_balance.on_hand_quantity < quantity:
                    raise serializers.ValidationError(
                        {"items": f"Not enough stock for {item.sku} at source location."}
                    )
                reserved_selected = sum(
                    1
                    for unit in locked_units
                    if unit.status == EquipmentUnitStatus.RESERVED or unit.id in reserved_unit_ids_to_move
                )
                source_balance.on_hand_quantity -= quantity
                source_balance.reserved_quantity = max(
                    source_balance.reserved_quantity - reserved_selected,
                    0,
                )
                source_balance.save(update_fields=["on_hand_quantity", "reserved_quantity", "updated_at"])
            else:
                if inventory_transaction.operation_kind == BusinessOperation.CUSTOMER_ISSUE:
                    quantity_reservations = list(
                        InventoryReservation.objects.select_for_update().filter(
                            status=ReservationStatus.ACTIVE,
                            reservation_type="quantity",
                            item=item,
                            location=source,
                        )
                    )
                    quantity_reservations_to_consume = [
                        reservation
                        for reservation in quantity_reservations
                        if self._reservation_matches_transaction(reservation, inventory_transaction)
                    ]
                    matching_reserved_quantity = sum(
                        reservation.quantity for reservation in quantity_reservations_to_consume
                    )
                    if source_balance.available_quantity + matching_reserved_quantity < quantity:
                        raise serializers.ValidationError(
                        {"items": f"Not enough available or matching reserved stock for {item.sku} at source location."}
                        )
                    quantity_reserved_to_consume = min(quantity, matching_reserved_quantity)
                elif inventory_transaction.operation_kind in (BusinessOperation.WAREHOUSE_TRANSFER, BusinessOperation.LAB_TRANSFER, BusinessOperation.LAB_RETURN) and selected_reservation:
                    selected_reservation = InventoryReservation.objects.select_for_update().get(pk=selected_reservation.pk)
                    if selected_reservation.reservation_type != "quantity":
                        raise serializers.ValidationError({"reservation": "Only quantity reservations can be moved by quantity."})
                    if inventory_transaction.operation_kind == BusinessOperation.LAB_TRANSFER and selected_reservation.is_hard:
                        raise serializers.ValidationError({"reservation": "Hard-reserved stock cannot be sent to lab."})
                    if selected_reservation.item_id != item.id or selected_reservation.location_id != source.id:
                        raise serializers.ValidationError({"reservation": "Reservation does not belong to the selected item and source location."})
                    if quantity > selected_reservation.quantity:
                        raise serializers.ValidationError({"quantity": "Move quantity cannot exceed reservation quantity."})
                    if source_balance.on_hand_quantity < quantity:
                        raise serializers.ValidationError(
                            {"items": f"Not enough stock for {item.sku} at source location."}
                        )
                    quantity_reserved_to_move = quantity
                elif source_balance.available_quantity < quantity:
                    raise serializers.ValidationError(
                        {"items": f"Not enough available stock for {item.sku} at source location."}
                    )
                source_balance.on_hand_quantity -= quantity
                if quantity_reserved_to_consume or quantity_reserved_to_move:
                    source_balance.reserved_quantity = max(
                        source_balance.reserved_quantity - quantity_reserved_to_consume - quantity_reserved_to_move,
                        0,
                    )
                    source_balance.save(update_fields=["on_hand_quantity", "reserved_quantity", "updated_at"])
                else:
                    source_balance.save(update_fields=["on_hand_quantity", "updated_at"])

        if destination:
            destination_balance, _ = InventoryBalance.objects.select_for_update().get_or_create(
                item=item,
                location=destination,
                defaults={"on_hand_quantity": 0, "reserved_quantity": 0},
            )
            if transaction_type == TransactionType.ADJUSTMENT:
                destination_balance.on_hand_quantity = quantity
                destination_balance.reserved_quantity = min(
                    destination_balance.reserved_quantity,
                    destination_balance.on_hand_quantity,
                )
            else:
                destination_balance.on_hand_quantity += quantity
                if inventory_transaction.operation_kind in (BusinessOperation.WAREHOUSE_TRANSFER, BusinessOperation.LAB_TRANSFER, BusinessOperation.LAB_RETURN):
                    destination_balance.reserved_quantity += (
                        quantity_reserved_to_move
                        + sum(
                            1
                            for unit in locked_units
                            if unit.status == EquipmentUnitStatus.RESERVED or unit.id in reserved_unit_ids_to_move
                        )
                    )
            destination_balance.save(
                update_fields=["on_hand_quantity", "reserved_quantity", "updated_at"]
            )

        if locked_units:
            for unit in locked_units:
                if inventory_transaction.operation_kind == BusinessOperation.CUSTOMER_ISSUE:
                    unit.status = EquipmentUnitStatus.CUSTOMER
                    unit.customer_name = inventory_transaction.customer_name or (
                        inventory_transaction.contract.customer_name if inventory_transaction.contract else ""
                    )
                    unit.contract = inventory_transaction.contract
                elif inventory_transaction.operation_kind == BusinessOperation.LAB_TRANSFER:
                    unit.status = EquipmentUnitStatus.LAB
                    unit.responsible_person = inventory_transaction.responsible_person
                elif inventory_transaction.operation_kind == BusinessOperation.WRITE_OFF:
                    unit.status = EquipmentUnitStatus.WRITTEN_OFF
                elif inventory_transaction.operation_kind == BusinessOperation.CUSTOMER_RETURN:
                    unit.status = EquipmentUnitStatus.NEEDS_CHECK
                    unit.customer_name = ""
                    unit.contract = None
                elif inventory_transaction.operation_kind == BusinessOperation.LAB_RETURN:
                    unit.status = (
                        EquipmentUnitStatus.RESERVED
                        if unit.id in reserved_unit_ids_to_move
                        else EquipmentUnitStatus.AVAILABLE
                    )
                    unit.responsible_person = ""
                elif inventory_transaction.operation_kind == BusinessOperation.WAREHOUSE_TRANSFER:
                    pass
                else:
                    unit.status = EquipmentUnitStatus.AVAILABLE

                if destination:
                    unit.location = destination
                unit.save(update_fields=["status", "customer_name", "contract", "responsible_person", "location", "updated_at"])

        for reservation, unit in serial_reservations_to_consume:
            self._consume_serial_reservation_unit(reservation, unit)
        if quantity_reserved_to_consume:
            self._consume_quantity_reservations(quantity_reservations_to_consume, quantity_reserved_to_consume)
        if quantity_reserved_to_move:
            self._move_quantity_reservation(selected_reservation, destination, quantity_reserved_to_move)
        if serial_reservations_to_move:
            self._move_serial_reservations(
                {reservation.id: reservation for reservation in serial_reservations_to_move}.values(),
                locked_units,
                destination,
            )
