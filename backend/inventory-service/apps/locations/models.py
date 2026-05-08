import uuid

from django.db import models


class StorageLocationType(models.TextChoices):
    WAREHOUSE = "warehouse", "Warehouse"
    SITE = "site", "Site"
    LAB = "lab", "Lab"
    TRANSIT = "transit", "Transit"
    VEHICLE = "vehicle", "Vehicle"


class StorageLocation(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization_id = models.UUIDField(null=True, blank=True)
    name = models.CharField(max_length=255)
    location_type = models.CharField(
        max_length=30,
        choices=StorageLocationType.choices,
        default=StorageLocationType.WAREHOUSE,
    )
    address = models.CharField(max_length=500, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        unique_together = ("organization_id", "name")

    def __str__(self):
        return self.name
