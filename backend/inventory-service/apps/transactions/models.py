import uuid

from django.db import models


class TransactionType(models.TextChoices):
    RECEIPT = "receipt", "Receipt"
    TRANSFER = "transfer", "Transfer"
    ISSUE = "issue", "Issue"
    RETURN = "return", "Return"
    ADJUSTMENT = "adjustment", "Adjustment"


class InventoryTransaction(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    transaction_type = models.CharField(max_length=30, choices=TransactionType.choices)
    source_location = models.ForeignKey(
        "locations.StorageLocation",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="outgoing_transactions",
    )
    destination_location = models.ForeignKey(
        "locations.StorageLocation",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="incoming_transactions",
    )
    related_request_id = models.UUIDField(null=True, blank=True)
    performed_by_id = models.UUIDField(null=True, blank=True)
    performed_by_username = models.CharField(max_length=150, blank=True)
    reason = models.CharField(max_length=255, blank=True)
    comment = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.transaction_type} {self.created_at:%Y-%m-%d %H:%M}"


class InventoryTransactionItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    transaction = models.ForeignKey(
        InventoryTransaction,
        on_delete=models.CASCADE,
        related_name="items",
    )
    item = models.ForeignKey(
        "catalog.InventoryItem",
        on_delete=models.PROTECT,
        related_name="transaction_items",
    )
    quantity = models.PositiveIntegerField()

    def __str__(self):
        return f"{self.item} x {self.quantity}"
