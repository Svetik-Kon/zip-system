import uuid

from django.db import models


class ReservationStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    RELEASED = "released", "Released"
    USED = "used", "Used"
    EXPIRED = "expired", "Expired"


class ReservationType(models.TextChoices):
    QUANTITY = "quantity", "Quantity"
    SERIAL = "serial", "Serial numbers"


class InventoryReservation(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    request_id = models.UUIDField(null=True, blank=True)
    request_item_id = models.UUIDField(null=True, blank=True)
    reservation_type = models.CharField(
        max_length=30,
        choices=ReservationType.choices,
        default=ReservationType.QUANTITY,
    )
    item = models.ForeignKey(
        "catalog.InventoryItem",
        on_delete=models.PROTECT,
        related_name="reservations",
    )
    location = models.ForeignKey(
        "locations.StorageLocation",
        on_delete=models.PROTECT,
        related_name="reservations",
    )
    quantity = models.PositiveIntegerField()
    customer_name = models.CharField(max_length=255, blank=True)
    reserved_until = models.DateField(null=True, blank=True)
    contract = models.ForeignKey(
        "catalog.CustomerContract",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reservations",
    )
    equipment_units = models.ManyToManyField(
        "catalog.EquipmentUnit",
        blank=True,
        related_name="reservations",
    )
    contract_number = models.CharField(max_length=150, blank=True)
    contract_file = models.FileField(
        upload_to="inventory_contracts/",
        null=True,
        blank=True,
    )
    status = models.CharField(
        max_length=30,
        choices=ReservationStatus.choices,
        default=ReservationStatus.ACTIVE,
    )
    created_by_id = models.UUIDField(null=True, blank=True)
    created_by_username = models.CharField(max_length=150, blank=True)
    comment = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.item} x {self.quantity} ({self.status})"
