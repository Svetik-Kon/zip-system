from django.db import models


class UserRole(models.TextChoices):
    ADMIN = "admin", "Администратор"
    CUSTOMER = "customer", "Заказчик"
    MANAGER = "manager", "Менеджер / Первая линия"
    WAREHOUSE = "warehouse", "Складовщик"
    ENGINEER = "engineer", "Инженер"
    PROCUREMENT = "procurement", "Снабжение / Закупки"