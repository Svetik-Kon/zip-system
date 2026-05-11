import uuid

from django.db import models


class InventoryItemType(models.TextChoices):
    EQUIPMENT = "equipment", "Equipment"
    SPARE_PART = "spare_part", "Spare part"
    TOOL = "tool", "Tool"
    ACCESSORY = "accessory", "Accessory"


class TrackingType(models.TextChoices):
    QUANTITY = "quantity", "Quantity"
    SERIAL = "serial", "Serial numbers"


class EquipmentModel(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255, unique=True)
    manufacturer = models.CharField(max_length=255, blank=True)
    description = models.TextField(blank=True)

    class Meta:
        ordering = ["manufacturer", "name"]

    def __str__(self):
        return f"{self.manufacturer} {self.name}".strip()


class InventoryItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    sku = models.CharField(max_length=100, unique=True)
    name = models.CharField(max_length=255)
    manufacturer = models.CharField(max_length=255, blank=True)
    unit = models.CharField(max_length=30, default="pcs")
    item_type = models.CharField(
        max_length=30,
        choices=InventoryItemType.choices,
        default=InventoryItemType.SPARE_PART,
    )
    tracking_type = models.CharField(
        max_length=30,
        choices=TrackingType.choices,
        default=TrackingType.QUANTITY,
    )
    equipment_model = models.ForeignKey(
        EquipmentModel,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="items",
    )
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["sku"]

    def __str__(self):
        return f"{self.sku} - {self.name}"


class EquipmentComponent(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    equipment_model = models.ForeignKey(
        EquipmentModel,
        on_delete=models.CASCADE,
        related_name="components",
    )
    item = models.ForeignKey(
        InventoryItem,
        on_delete=models.PROTECT,
        related_name="model_components",
    )
    quantity = models.PositiveIntegerField(default=1)

    class Meta:
        unique_together = ("equipment_model", "item")

    def __str__(self):
        return f"{self.equipment_model}: {self.item} x {self.quantity}"


class ContractStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    EXPIRING = "expiring", "Expiring"
    EXPIRED = "expired", "Expired"
    CLOSED = "closed", "Closed"


class CustomerContract(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization_id = models.UUIDField(null=True, blank=True)
    customer_name = models.CharField(max_length=255)
    number = models.CharField(max_length=150, unique=True)
    starts_at = models.DateField(null=True, blank=True)
    ends_at = models.DateField(null=True, blank=True)
    status = models.CharField(
        max_length=30,
        choices=ContractStatus.choices,
        default=ContractStatus.ACTIVE,
    )
    file = models.FileField(upload_to="contracts/", null=True, blank=True)
    comment = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["customer_name", "number"]

    def __str__(self):
        return f"{self.customer_name} / {self.number}"


class EquipmentUnitStatus(models.TextChoices):
    AVAILABLE = "available", "Available"
    RESERVED = "reserved", "Reserved"
    ISSUED = "issued", "Issued"
    CUSTOMER = "customer", "At customer"
    LAB = "lab", "In lab"
    WRITTEN_OFF = "written_off", "Written off"
    NEEDS_CHECK = "needs_check", "Needs check"


class EquipmentUnit(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    item = models.ForeignKey(
        InventoryItem,
        on_delete=models.PROTECT,
        related_name="units",
    )
    serial_number = models.CharField(max_length=150, unique=True)
    inventory_number = models.CharField(max_length=150, blank=True)
    location = models.ForeignKey(
        "locations.StorageLocation",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="equipment_units",
    )
    status = models.CharField(
        max_length=30,
        choices=EquipmentUnitStatus.choices,
        default=EquipmentUnitStatus.AVAILABLE,
    )
    customer_name = models.CharField(max_length=255, blank=True)
    contract = models.ForeignKey(
        CustomerContract,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="equipment_units",
    )
    responsible_person = models.CharField(max_length=255, blank=True)
    reserved_until = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["serial_number"]

    def __str__(self):
        return f"{self.item.sku} / {self.serial_number}"
