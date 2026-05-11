import uuid
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("requests_app", "0005_alter_servicerequest_status"),
    ]

    operations = [
        migrations.CreateModel(
            name="Notification",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("recipient_id", models.UUIDField(blank=True, null=True)),
                ("recipient_role", models.CharField(blank=True, max_length=50)),
                ("event_type", models.CharField(max_length=100)),
                ("message", models.CharField(max_length=255)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("expires_at", models.DateTimeField()),
                ("request", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="notifications", to="requests_app.servicerequest")),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="notification",
            index=models.Index(fields=["recipient_id", "expires_at"], name="requests_ap_recipie_7c457b_idx"),
        ),
        migrations.AddIndex(
            model_name="notification",
            index=models.Index(fields=["recipient_role", "expires_at"], name="requests_ap_recipie_491d1b_idx"),
        ),
    ]
