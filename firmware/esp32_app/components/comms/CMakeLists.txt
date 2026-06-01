idf_component_register(
    SRCS "comms.c" "comms_payload.c"
    INCLUDE_DIRS "include"
    PRIV_INCLUDE_DIRS "."
    REQUIRES esp_common esp_event esp_netif mqtt preprocess diagnosis state_logic
)
