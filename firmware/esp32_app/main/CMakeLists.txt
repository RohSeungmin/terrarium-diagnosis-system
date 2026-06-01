idf_component_register(
    SRCS "main.c"
    INCLUDE_DIRS "."
    REQUIRES sensors preprocess diagnosis state_logic comms wifi
)
