from django.db import models
from django.contrib.auth.models import AbstractUser
from apps.roles.models import UserRole
import uuid


class User(AbstractUser):
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    email = models.EmailField("Email", unique=True)

    role = models.CharField(
        "Роль",
        max_length=30,
        choices=UserRole.choices,
        default=UserRole.CUSTOMER,
    )

    organization = models.ForeignKey(
        "organizations.Organization",
        verbose_name="Организация",
        on_delete=models.PROTECT,
        related_name="users",
        null=True,
        blank=True,
    )

    phone = models.CharField("Телефон", max_length=30, blank=True)
    job_title = models.CharField("Должность", max_length=100, blank=True)

    is_internal = models.BooleanField("Внутренний сотрудник", default=False)

    REQUIRED_FIELDS = ["email"]

    class Meta:
        verbose_name = "Пользователь"
        verbose_name_plural = "Пользователи"
        ordering = ["username"]

    def __str__(self):
        return f"{self.username} ({self.get_role_display()})"

    def save(self, *args, **kwargs):
        self.is_internal = self.role != UserRole.CUSTOMER
        super().save(*args, **kwargs)

    @property
    def is_admin_role(self):
        return self.role == UserRole.ADMIN

    @property
    def is_customer_role(self):
        return self.role == UserRole.CUSTOMER

    @property
    def is_manager_role(self):
        return self.role == UserRole.MANAGER

    @property
    def is_warehouse_role(self):
        return self.role == UserRole.WAREHOUSE

    @property
    def is_engineer_role(self):
        return self.role == UserRole.ENGINEER

    @property
    def is_procurement_role(self):
        return self.role == UserRole.PROCUREMENT