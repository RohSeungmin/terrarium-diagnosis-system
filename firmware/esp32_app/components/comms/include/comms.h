#ifndef COMMS_H
#define COMMS_H

#include <stdbool.h>
#include <stdint.h>

#include "esp_err.h"

#include "diagnosis.h"
#include "preprocess.h"
#include "state_logic.h"

#ifdef __cplusplus
extern "C" {
#endif

#define COMMS_DEFAULT_BROKER_URI "mqtt://192.168.0.10:1883" // TODO: 실제 서버 주소로 교체
#define COMMS_DEFAULT_NODE_ID "esp32_01"                    // TODO: 노드 식별자 설정값으로 교체
#define COMMS_DEFAULT_TOPIC_PREFIX "terrarium/terrarium_01"
#define COMMS_DEFAULT_HEARTBEAT_TOPIC_SUFFIX "heartbeat"
#define COMMS_DEFAULT_HEARTBEAT_PUBLISH_INTERVAL_MS 30000U

typedef enum {
    COMMS_MESSAGE_SUMMARY = 0,
    COMMS_MESSAGE_EVENT,
    COMMS_MESSAGE_ALERT,
    COMMS_MESSAGE_FAULT,
    COMMS_MESSAGE_COUNT
} comms_message_kind_t;

typedef struct {
    const char *topic_suffix;
    int qos;
    bool retain;
    uint32_t expiry_ms; // MQTT v5 Message Expiry Interval 적용값. payload metadata에도 포함함.
} comms_message_policy_t;

typedef struct {
    const char *broker_uri;
    const char *node_id;
    const char *topic_prefix;
    const char *heartbeat_topic_suffix;
    uint32_t heartbeat_publish_interval_ms;

    comms_message_policy_t summary_policy;
    comms_message_policy_t event_policy;
    comms_message_policy_t alert_policy;
    comms_message_policy_t fault_policy;
} comms_config_t;

typedef struct {
    comms_config_t config;
    void *mqtt_client;
    bool mqtt_started;
    bool connected;
    uint32_t last_publish_ms[COMMS_MESSAGE_COUNT];
    uint32_t last_heartbeat_publish_ms;
} comms_ctx_t;

void comms_get_default_config(comms_config_t *out_config);

esp_err_t comms_init(comms_ctx_t *ctx, const comms_config_t *config);

esp_err_t comms_deinit(comms_ctx_t *ctx);

esp_err_t comms_publish_if_needed(
    comms_ctx_t *ctx,
    const preprocess_result_t *preprocess_result,
    const diagnosis_result_t *diagnosis_result,
    const state_logic_result_t *state_logic_result,
    uint32_t now_ms
);

esp_err_t comms_publish_heartbeat_if_needed(comms_ctx_t *ctx,
                                            state_logic_state_t current_state,
                                            uint32_t now_ms);

#ifdef __cplusplus
}
#endif

#endif
