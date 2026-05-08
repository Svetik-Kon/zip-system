import uuid

from django.core.validators import MinValueValidator
from django.db import models


class InventoryBalance(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    item = models.ForeignKey(
        "catalog.InventoryItem",
        on_delete=models.CASCADE,
        related_name="balances",
    )
    location = models.ForeignKey(
        "locations.StorageLocation",
        on_delete=models.CASCADE,
        related_name="balances",
    )
    on_hand_quantity = models.PositiveIntegerField(default=0)
    reserved_quantity = models.PositiveIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("item", "location")
        ordering = ["item__sku", "location__name"]

    @property
    def available_quantity(self):
        return max(self.on_hand_quantity - self.reserved_quantity, 0)

    def clean(self):
        if self.reserved_quantity > self.on_hand_quantity:
            from django.core.exceptions import ValidationError

            raise ValidationError("Reserved quantity cannot exceed on-hand quantity.")

    def __str__(self):
        return f"{self.item} @ {self.location}: {self.available_quantity}"
