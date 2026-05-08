from django.db import transaction
from rest_framework import serializers

from apps.analogs.models import ItemAnalog
from apps.balances.models import InventoryBalance
from apps.locations.models import StorageLocation
from apps.reservations.models import InventoryReservation, ReservationStatus
from apps.transactions.models import (
    InventoryTransaction,
    InventoryTransactionItem,
    TransactionType,
)
from .models import EquipmentComponent, EquipmentModel, InventoryItem


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
        balance, _ = InventoryBalance.objects.update_or_create(
            item=validated_data["item"],
            location=validated_data["location"],
            defaults={
                "on_hand_quantity": validated_data.get("on_hand_quantity", 0),
                "reserved_quantity": validated_data.get("reserved_quantity", 0),
            },
        )
        return balance


class InventoryReservationSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source="item.name", read_only=True)
    item_sku = serializers.CharField(source="item.sku", read_only=True)
    location_name = serializers.CharField(source="location.name", read_only=True)

    class Meta:
        model = InventoryReservation
        fields = (
            "id",
            "request_id",
            "request_item_id",
            "item",
            "item_name",
            "item_sku",
            "location",
            "location_name",
            "quantity",
            "status",
            "created_by_id",
            "created_by_username",
            "comment",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_by_id", "created_by_username")


class ReservationCreateSerializer(serializers.Serializer):
    request_id = serializers.UUIDField(required=False, allow_null=True)
    request_item_id = serializers.UUIDField(required=False, allow_null=True)
    item = serializers.PrimaryKeyRelatedField(queryset=InventoryItem.objects.filter(is_active=True))
    location = serializers.PrimaryKeyRelatedField(queryset=StorageLocation.objects.filter(is_active=True))
    quantity = serializers.IntegerField(min_value=1)
    comment = serializers.CharField(required=False, allow_blank=True)

    def create(self, validated_data):
        request = self.context["request"]

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

            balance.reserved_quantity += validated_data["quantity"]
            balance.save(update_fields=["reserved_quantity", "updated_at"])

            return InventoryReservation.objects.create(
                **validated_data,
                created_by_id=request.user.id,
                created_by_username=request.user.username,
            )


class InventoryTransactionItemSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source="item.name", read_only=True)
    item_sku = serializers.CharField(source="item.sku", read_only=True)

    class Meta:
        model = InventoryTransactionItem
        fields = ("id", "item", "item_name", "item_sku", "quantity")


class InventoryTransactionSerializer(serializers.ModelSerializer):
    items = InventoryTransactionItemSerializer(many=True)
    source_location_name = serializers.CharField(source="source_location.name", read_only=True)
    destination_location_name = serializers.CharField(source="destination_location.name", read_only=True)

    class Meta:
        model = InventoryTransaction
        fields = (
            "id",
            "transaction_type",
            "source_location",
            "source_location_name",
            "destination_location",
            "destination_location_name",
            "related_request_id",
            "performed_by_id",
            "performed_by_username",
            "reason",
            "comment",
            "items",
            "created_at",
        )
        read_only_fields = ("performed_by_id", "performed_by_username")

    def validate(self, attrs):
        transaction_type = attrs.get("transaction_type")
        source = attrs.get("source_location")
        destination = attrs.get("destination_location")

        if transaction_type in (TransactionType.ISSUE, TransactionType.TRANSFER, TransactionType.RETURN) and not source:
            raise serializers.ValidationError({"source_location": "Source location is required."})
        if transaction_type in (TransactionType.RECEIPT, TransactionType.TRANSFER, TransactionType.RETURN) and not destination:
            raise serializers.ValidationError({"destination_location": "Destination location is required."})
        if transaction_type == TransactionType.ADJUSTMENT and not destination:
            raise serializers.ValidationError({"destination_location": "Location is required for adjustment."})
        return attrs

    def create(self, validated_data):
        request = self.context["request"]
        items_data = validated_data.pop("items")

        with transaction.atomic():
            inventory_transaction = InventoryTransaction.objects.create(
                **validated_data,
                performed_by_id=request.user.id,
                performed_by_username=request.user.username,
            )

            for item_data in items_data:
                item = item_data["item"]
                quantity = item_data["quantity"]
                self._apply_balance(inventory_transaction, item, quantity)
                InventoryTransactionItem.objects.create(
                    transaction=inventory_transaction,
                    item=item,
                    quantity=quantity,
                )

            return inventory_transaction

    def _apply_balance(self, inventory_transaction, item, quantity):
        source = inventory_transaction.source_location
        destination = inventory_transaction.destination_location
        transaction_type = inventory_transaction.transaction_type

        if source:
            source_balance, _ = InventoryBalance.objects.select_for_update().get_or_create(
                item=item,
                location=source,
                defaults={"on_hand_quantity": 0, "reserved_quantity": 0},
            )
            if source_balance.available_quantity < quantity:
                raise serializers.ValidationError(
                    {"items": f"Not enough available stock for {item.sku} at source location."}
                )
            source_balance.on_hand_quantity -= quantity
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
            destination_balance.save(
                update_fields=["on_hand_quantity", "reserved_quantity", "updated_at"]
            )
