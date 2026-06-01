idf_component_register(
    SRCS "sensors.c"
    INCLUDE_DIRS "include"
    REQUIRES esp_common onewire_bus ds18b20
    PRIV_REQUIRES esp_driver_gpio esp_driver_i2c
)
