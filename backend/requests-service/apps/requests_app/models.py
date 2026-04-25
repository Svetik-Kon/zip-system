from django.db import models
import uuid


class RequestType(models.TextChoices):
    REPAIR_DIAGNOSTICS = "repair_diagnostics", "Ремонт / диагностика"
    EQUIPMENT_REPLACEMENT = "equipment_replacement", "Замена оборудования"
    INTERNAL_REQUEST = "internal_request", "Внутренний запрос"
    SOFTWARE_UPDATE = "software_update", "Обновление / запрос софта"


class RequestPriority(models.TextChoices):
    LOW = "low", "Низкий"
    MEDIUM = "medium", "Средний"
    HIGH = "high", "Высокий"
    CRITICAL = "critical", "Критический"


class RequestStatus(models.TextChoices):
    NEW = "new", "Новая"
    IN_REVIEW = "in_review", "На проверке"
    DIAGNOSTICS = "diagnostics", "Диагностика"
    AWAITING_WAREHOUSE = "awaiting_warehouse", "Ожидает склад"
    AWAITING_PROCUREMENT = "awaiting_procurement", "Ожидает закупки"
    RESERVED = "reserved", "Зарезервировано"
    READY_TO_SHIP = "ready_to_ship", "Готово к отгрузке"
    SHIPPED = "shipped", "Отгружено"
    IN_LAB = "in_lab", "В лаборатории"
    RECEIVED = "received", "Получено"
    CLOSED = "closed", "Закрыта"
    REJECTED = "rejected", "Отклонена"
    CANCELLED = "cancelled", "Отменена"


class ServiceRequest(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    number = models.CharField(max_length=50, unique=True, blank=True)

    title = models.CharField("Заголовок", max_length=255)
    description = models.TextField("Описание", blank=True)

    request_type = models.CharField(
        max_length=50,
        choices=RequestType.choices,
        default=RequestType.REPAIR_DIAGNOSTICS,
    )
    priority = models.CharField(
        max_length=20,
        choices=RequestPriority.choices,
        default=RequestPriority.MEDIUM,
    )
    status = models.CharField(
        max_length=50,
        choices=RequestStatus.choices,
        default=RequestStatus.NEW,
    )

    is_internal = models.BooleanField(default=False)
    contract_exists = models.BooleanField(default=False)
    recall_allowed = models.BooleanField(default=False)

    customer_organization_id = models.UUIDField(null=True, blank=True)
    integrator_organization_id = models.UUIDField(null=True, blank=True)

    created_by_id = models.UUIDField()
    created_by_username = models.CharField(max_length=150, blank=True)

    current_assignee_id = models.UUIDField(null=True, blank=True)
    current_assignee_username = models.CharField(max_length=150, blank=True)
    requested_for_user_id = models.UUIDField(null=True, blank=True)

    equipment_name = models.CharField(max_length=255, blank=True)
    equipment_model = models.CharField(max_length=255, blank=True)
    serial_number = models.CharField(max_length=255, blank=True)
    inventory_number = models.CharField(max_length=255, blank=True)

    site_name = models.CharField(max_length=255, blank=True)
    address = models.CharField(max_length=500, blank=True)
    desired_date = models.DateField(null=True, blank=True)
    due_date = models.DateField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.number} - {self.title}"

    def save(self, *args, **kwargs):
        if not self.number:
            last_request = ServiceRequest.objects.order_by("-created_at").first()
            next_number = 1
            if last_request and last_request.number:
                try:
                    next_number = int(last_request.number.split("-")[-1]) + 1
                except Exception:
                    next_number = 1
            self.number = f"REQ-{next_number:05d}"
        super().save(*args, **kwargs)


class ServiceRequestItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    request = models.ForeignKey(
        ServiceRequest,
        on_delete=models.CASCADE,
        related_name="items",
    )
    item_name = models.CharField(max_length=255)
    quantity = models.PositiveIntegerField(default=1)
    allow_analog = models.BooleanField(default=False)
    comment = models.TextField(blank=True)

    def __str__(self):
        return f"{self.item_name} x {self.quantity}"


class RequestComment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    request = models.ForeignKey(
        ServiceRequest,
        on_delete=models.CASCADE,
        related_name="comments",
    )

    author_id = models.UUIDField()
    author_username = models.CharField(max_length=150, blank=True)
    author_role = models.CharField(max_length=50)
    body = models.TextField()
    is_internal = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.author_username}: {self.body[:30]}"


class RequestEvent(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    request = models.ForeignKey(
        ServiceRequest,
        on_delete=models.CASCADE,
        related_name="events",
    )

    actor_id = models.UUIDField()
    actor_username = models.CharField(max_length=150, blank=True)
    actor_role = models.CharField(max_length=50)

    event_type = models.CharField(max_length=100)
    old_value = models.CharField(max_length=255, blank=True)
    new_value = models.CharField(max_length=255, blank=True)
    comment = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.event_type} - {self.created_at}"