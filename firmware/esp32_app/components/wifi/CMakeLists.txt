idf_component_register(
    SRCS "wifi_manager.c"
    INCLUDE_DIRS "include"
    REQUIRES esp_common esp_event esp_netif esp_wifi nvs_flash
)
