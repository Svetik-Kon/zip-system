import uuid

from django.db import models


class ItemAnalog(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    item = models.ForeignKey(
        "catalog.InventoryItem",
        on_delete=models.CASCADE,
        related_name="analogs",
    )
    analog_item = models.ForeignKey(
        "catalog.InventoryItem",
        on_delete=models.CASCADE,
        related_name="analog_for",
    )
    note = models.TextField(blank=True)

    class Meta:
        unique_together = ("item", "analog_item")

    def __str__(self):
        return f"{self.item} -> {self.analog_item}"
