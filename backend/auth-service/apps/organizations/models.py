from django.db import models
import uuid


class OrganizationType(models.TextChoices):
    CUSTOMER = "customer", "Заказчик"
    INTEGRATOR = "integrator", "Интегратор"


class Organization(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField("Название", max_length=255, unique=True)
    org_type = models.CharField(
        "Тип организации",
        max_length=20,
        choices=OrganizationType.choices,
    )
    is_active = models.BooleanField("Активна", default=True)
    created_at = models.DateTimeField("Создана", auto_now_add=True)

    class Meta:
        verbose_name = "Организация"
        verbose_name_plural = "Организации"
        ordering = ["name"]

    def __str__(self):
        return self.name