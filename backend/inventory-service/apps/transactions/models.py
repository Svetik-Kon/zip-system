import uuid

from django.db import models


class TransactionType(models.TextChoices):
    RECEIPT = "receipt", "Receipt"
    TRANSFER = "transfer", "Transfer"
    ISSUE = "issue", "Issue"
    RETURN = "return", "Return"
    ADJUSTMENT = "adjustment", "Adjustment"


class BusinessOperation(models.TextChoices):
    SUPPLIER_RECEIPT = "supplier_receipt", "Supplier receipt"
    WAREHOUSE_TRANSFER = "warehouse_transfer", "Warehouse transfer"
    CUSTOMER_ISSUE = "customer_issue", "Customer issue"
    LAB_TRANSFER = "lab_transfer", "Lab transfer"
    CUSTOMER_RETURN = "customer_return", "Customer return"
    LAB_RETURN = "lab_return", "Lab return"
    WRITE_OFF = "write_off", "Write off"
    STOCK_ADJUSTMENT = "stock_adjustment", "Stock adjustment"


class InventoryTransaction(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    transaction_type = models.CharField(max_length=30, choices=TransactionType.choices)
    operation_kind = models.CharField(
        max_length=40,
        choices=BusinessOperation.choices,
        default=BusinessOperation.SUPPLIER_RECEIPT,
    )
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
    customer_name = models.CharField(max_length=255, blank=True)
    contract = models.ForeignKey(
        "catalog.CustomerContract",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="transactions",
    )
    responsible_person = models.CharField(max_length=255, blank=True)
    due_date = models.DateField(null=True, blank=True)
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
    equipment_units = models.ManyToManyField(
        "catalog.EquipmentUnit",
        blank=True,
        related_name="transaction_items",
    )
    quantity = models.PositiveIntegerField()

    def __str__(self):
        return f"{self.item} x {self.quantity}"
