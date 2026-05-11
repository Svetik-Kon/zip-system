from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("reservations", "0003_serial_reservations"),
    ]

    operations = [
        migrations.AddField(
            model_name="inventoryreservation",
            name="is_hard",
            field=models.BooleanField(default=False),
        ),
    ]
