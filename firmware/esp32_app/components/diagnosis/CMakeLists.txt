idf_component_register(
    SRCS "diagnosis.c"
    INCLUDE_DIRS "." "include"
    REQUIRES esp_common
    PRIV_REQUIRES preprocess)
