from django.db import models
import uuid


class RequestType(models.TextChoices):
    CUSTOMER_REQUEST = "customer_request", "Заявка заказчика"
    INTERNAL_LAB_LOAN = "internal_lab_loan", "Временная выдача в лабораторию"
    INTERNAL_EQUIPMENT_REQUEST = "internal_equipment_request", "Внутренний запрос оборудования"
    REPAIR_REQUEST = "repair_request", "Ремонт / диагностика"


class RequestPriority(models.TextChoices):
    LOW = "low", "Низкий"
    MEDIUM = "medium", "Средний"
    HIGH = "high", "Высокий"
    CRITICAL = "critical", "Критический"


class RequestStatus(models.TextChoices):
    DRAFT = "draft", "Черновик"
    NEW = "new", "Новая"
    IN_REVIEW = "in_review", "На проверке"
    AWAITING_CONTRACT_CHECK = "awaiting_contract_check", "Проверка контракта"
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
        "Тип заявки",
        max_length=50,
        choices=RequestType.choices,
        default=RequestType.CUSTOMER_REQUEST,
    )
    priority = models.CharField(
        "Приоритет",
        max_length=20,
        choices=RequestPriority.choices,
        default=RequestPriority.MEDIUM,
    )
    status = models.CharField(
        "Статус",
        max_length=50,
        choices=RequestStatus.choices,
        default=RequestStatus.NEW,
    )

    is_internal = models.BooleanField("Внутренняя заявка", default=False)
    contract_exists = models.BooleanField("Контракт подтвержден", default=False)
    recall_allowed = models.BooleanField("Можно отозвать под внешний приоритет", default=False)

    customer_organization_id = models.UUIDField(null=True, blank=True)
    integrator_organization_id = models.UUIDField(null=True, blank=True)

    created_by_id = models.UUIDField()
    current_assignee_id = models.UUIDField(null=True, blank=True)
    requested_for_user_id = models.UUIDField(null=True, blank=True)

    equipment_name = models.CharField("Оборудование", max_length=255, blank=True)
    equipment_model = models.CharField("Модель", max_length=255, blank=True)
    serial_number = models.CharField("Серийный номер", max_length=255, blank=True)
    inventory_number = models.CharField("Инвентарный номер", max_length=255, blank=True)

    site_name = models.CharField("Площадка / объект", max_length=255, blank=True)
    address = models.CharField("Адрес", max_length=500, blank=True)
    desired_date = models.DateField("Желаемая дата", null=True, blank=True)
    due_date = models.DateField("Срок возврата / завершения", null=True, blank=True)

    created_at = models.DateTimeField("Создана", auto_now_add=True)
    updated_at = models.DateTimeField("Обновлена", auto_now=True)

    class Meta:
        verbose_name = "Заявка"
        verbose_name_plural = "Заявки"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.number or self.id} - {self.title}"

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

    catalog_item_id = models.UUIDField(null=True, blank=True)
    item_name = models.CharField("Наименование", max_length=255)
    quantity = models.PositiveIntegerField("Количество", default=1)
    allow_analog = models.BooleanField("Разрешена замена", default=False)
    comment = models.TextField("Комментарий", blank=True)

    class Meta:
        verbose_name = "Позиция заявки"
        verbose_name_plural = "Позиции заявок"

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
    author_role = models.CharField(max_length=50)
    body = models.TextField("Текст комментария")
    is_internal = models.BooleanField("Внутренний комментарий", default=False)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Комментарий"
        verbose_name_plural = "Комментарии"
        ordering = ["created_at"]

    def __str__(self):
        return f"Комментарий {self.author_role} - {self.created_at}"


class RequestEvent(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    request = models.ForeignKey(
        ServiceRequest,
        on_delete=models.CASCADE,
        related_name="events",
    )

    actor_id = models.UUIDField()
    actor_role = models.CharField(max_length=50)
    event_type = models.CharField(max_length=100)
    old_value = models.CharField(max_length=255, blank=True)
    new_value = models.CharField(max_length=255, blank=True)
    comment = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Событие заявки"
        verbose_name_plural = "События заявки"
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.event_type} - {self.created_at}"