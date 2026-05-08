import uuid

from django.db import models


class InventoryItemType(models.TextChoices):
    EQUIPMENT = "equipment", "Equipment"
    SPARE_PART = "spare_part", "Spare part"
    TOOL = "tool", "Tool"
    ACCESSORY = "accessory", "Accessory"


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
